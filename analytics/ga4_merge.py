#!/usr/bin/env python3
"""pull_ga4.py の「マージ＋安全ガード」の純粋関数部分。

**env・ネットワーク・gspread に一切依存しない**ように分離してある。
理由: pull_ga4.py はモジュール先頭で os.environ[...] と SA鍵の読み込みを行うため
import できず、ロジックを単体テストできなかった。ガード自体が間違っていたら
意味がないので、ガードはテストできる場所に置く。

⛔ ここを触ったら必ず test_pull_ga4.py を通すこと（workflow が本番データより先に回す）。
"""

# dataタブの列: date / lp / scenario / event / count / users
WIDTH = 6


def normalize_row(row, width=WIDTH):
    """シートから読んだ行を固定幅にそろえる（末尾の空セルは取得時に落ちることがある）。"""
    return (list(row) + [""] * width)[:width]


def summarize(rows):
    """行集合の要約（行数・最古日・最新日）。日付が1つも無ければ min/max は ""。"""
    dates = [r[0] for r in rows if r and r[0]]
    return {"rows": len(rows), "min": min(dates) if dates else "", "max": max(dates) if dates else ""}


def split_by_targets(body, targets):
    """洗い替え対象日(targets)の行と、それ以外（＝保持する過去分）に分ける。
    完全な空行は捨てる（シート末尾の余白）。"""
    kept, replaced = [], []
    for row in body:
        if not row or not any(str(c).strip() for c in row):
            continue
        (replaced if row[0] in targets else kept).append(normalize_row(row))
    return kept, replaced


def merge(body, new_rows, targets):
    """既存body から対象日を抜き、新規行を足して並べ替える。
    戻り: (merged, kept, replaced)"""
    kept, replaced = split_by_targets(body, targets)
    merged = kept + [normalize_row(r) for r in new_rows]
    # 並び順は従来どおり date, lp, event（ダッシュボードの数式は行順に依存しないが、
    # 人が data タブを目視するときの可読性のため維持する）
    merged.sort(key=lambda r: (str(r[0]), str(r[1]), str(r[3])))
    return merged, kept, replaced


def check_before_write(header, body, new_rows, merged, kept, replaced, targets):
    """書き込み**前**のガード。戻り: (errors, warnings)
    errors が1件でもあれば呼び出し側は書かずに exit 1 する（＝シートは無傷のまま残る）。

    ここで止める価値があるのは「書いたら壊れる」ケースだけ。正当に起こりうる変動
    （トラフィックが少ない日で行が減る等）は warning に落として実行は続ける。
    """
    errs, warns = [], []

    # E1: シート構造が壊れている（ヘッダが読めない）状態で書くと列がズレる
    if not header or len([c for c in header if str(c).strip()]) < WIDTH:
        errs.append(f"data タブのヘッダが読めません（{WIDTH}列必要・実際: {header!r}）。"
                    "シート構造の破損か読み取り失敗を疑う")

    # E2: 空を書き込まない（シートを空にする事故の最終防波堤）
    if not merged:
        errs.append("マージ結果が0行です。data タブを空にする書き込みは行いません")

    # E3: GA4 が 0 行を返したのに、既存には対象日の行がある
    #     ＝ API は成功したがデータが取れていない（プロパティ設定変更・
    #        カスタムディメンション削除・フィルタ不一致など）。
    #     このまま書くと直近 N 日が**黙って消える**ので必ず止める。
    if not new_rows and replaced:
        errs.append(f"GA4 から 0 行しか取得できませんでした（対象日 {min(targets)}〜{max(targets)}）。"
                    f"既存シートには同期間の {len(replaced)} 行があるため、"
                    "上書きすると直近分が消えます。取得側の異常を疑う（GA4権限/ディメンション/フィルタ）")

    # E4: 過去分（窓外）が丸ごと消えた ＝ 既存の読み取りに失敗している疑い
    if body and not kept and not all(r[0] in targets for r in body if r and r[0]):
        errs.append("窓外（洗い替え対象外）の行が1件も残りませんでした。既存データの読み取り失敗を疑う")

    # W1: 対象日のデータが半分以下に減った（正当なこともあるが、静かに減るのが一番怖い）
    if replaced and len(new_rows) < len(replaced) * 0.5:
        warns.append(f"対象日の行数が減少: {len(replaced)}行 → {len(new_rows)}行。"
                     "GA4側の計測変調の可能性があるため数字を確認してください")

    # W2: 対象日のうち、1行も取れなかった日
    got = {r[0] for r in new_rows}
    empty_days = sorted(d for d in targets if d not in got)
    if empty_days:
        warns.append(f"GA4 から1行も取得できなかった日: {', '.join(empty_days)}"
                     "（トラフィックゼロなら正常。連日続くなら計測を確認）")

    return errs, warns


def check_after_write(expected, actual):
    """書き込み**後**の読み戻し検証。expected/actual はどちらも summarize() の戻り。
    HTTP 200 は「書けた」を意味しないので、必ず読み直して突き合わせる。"""
    errs = []
    if actual["rows"] != expected["rows"]:
        errs.append(f"読み戻した行数が一致しません: 期待{expected['rows']}行 / 実際{actual['rows']}行")
    for k, label in (("min", "最古日"), ("max", "最新日")):
        if actual[k] != expected[k]:
            errs.append(f"読み戻した{label}が一致しません: 期待{expected[k]!r} / 実際{actual[k]!r}")
    return errs


def build_payload(header, merged, previous_used_rows):
    """1回の update で書き切るための2次元配列を作る。

    ⛔ ws.clear() は使わない（2026-08-01 改修）。
       clear と update は別の API コールなので非アトミック＝間で落ちると
       data タブが空のまま朝を迎える（1,220行・ダッシュボードの唯一のソース）。
       代わりに「旧データが使っていた行数まで空行で埋めた1枚の配列」を作り、
       **update 1回**で上書きと余り消去を同時に済ませる。
       途中で落ちても data タブが空になる瞬間が存在しない。
    """
    payload = [normalize_row(header)] + merged
    pad = previous_used_rows - len(payload)
    if pad > 0:
        payload += [[""] * WIDTH for _ in range(pad)]
    return payload
