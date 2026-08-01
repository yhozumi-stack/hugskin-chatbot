#!/usr/bin/env python3
"""pull_ga4.py の「data タブを壊さない」仕組みの単体テスト(本番シートには一切触らない)。

実行: python3 analytics/test_pull_ga4.py
  → 全部OKなら exit 0 / どれか壊れたら AssertionError で exit 1

守りたいこと(2026-08-01の改修の本体):
  ① ws.clear() 廃止。空行パディング付きの **update 1回** で書くので、
     途中で落ちても data タブが空になる瞬間が存在しない
  ② GA4 が 0 行を返したとき(API成功・データ無し)に直近N日を黙って消さない
  ③ 窓外(洗い替え対象外)の過去分は1行も消えない
  ④ 書いた後に読み戻して行数・最古日・最新日が一致することを確認する
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ga4_merge as gm   # noqa: E402  (env にも鍵にも依存しないので import できる)

OK = []


def check(name, cond):
    assert cond, f"❌ {name}"
    OK.append(name)
    print(f"  ok: {name}")


HEADER = ["date", "lp", "scenario", "event", "count", "users"]


def row(d, lp="u=ins29", scen="formplus", ev="open", c=10, u=9):
    return [d, lp, scen, ev, c, u]


# 既存シート: 7/10〜7/28 の過去分(19行) + 洗い替え対象 7/29〜7/31 の3行
old_rows = [row(f"2026-07-{d:02d}") for d in range(10, 29)]
recent_rows = [row(f"2026-07-{d:02d}") for d in (29, 30, 31)]
BODY = old_rows + recent_rows
TARGETS = {"2026-07-29", "2026-07-30", "2026-07-31"}

print("== ① マージ: 窓外は保持・対象日は差し替え ==")
new_rows = [row("2026-07-29", c=99), row("2026-07-30", c=98), row("2026-07-31", c=97),
            row("2026-07-31", lp="u=insp29", c=5)]
merged, kept, replaced = gm.merge(BODY, new_rows, TARGETS)
check("窓外19行がそのまま残る", len(kept) == 19)
check("対象日の既存3行が差し替え対象として分離される", len(replaced) == 3)
check("結果は 窓外 + 新規 = 23行", len(merged) == 19 + 4)
check("古い値(10)は残らず新しい値(99)になる",
      [r for r in merged if r[0] == "2026-07-29"][0][4] == 99)
check("日付順に並ぶ", [r[0] for r in merged] == sorted(r[0] for r in merged))
check("最古日は窓外のまま", gm.summarize(merged)["min"] == "2026-07-10")

print("== ② シート末尾の空行はマージで捨てられる ==")
merged2, kept2, _ = gm.merge(BODY + [[], ["", "", "", "", "", ""]], new_rows, TARGETS)
check("空行は kept に入らない", len(kept2) == 19)
check("行数は空行なしと同じ", len(merged2) == len(merged))

print("== ③ GA4が0行を返したら書き込まずに止める(今回の主眼) ==")
merged3, kept3, replaced3 = gm.merge(BODY, [], TARGETS)
errs, warns = gm.check_before_write(HEADER, BODY, [], merged3, kept3, replaced3, TARGETS)
check("エラーになる", len(errs) >= 1)
check("理由が『0行しか取得できなかった』と分かる", any("0 行" in e for e in errs))
check("消える行数を明示する", any("3 行" in e for e in errs))
check("窓外の過去分自体は保持されている(消えるのは直近だけ)", len(kept3) == 19)

print("== ③b 初回/対象日にデータが無い正当なケースは止めない ==")
body_only_old = list(old_rows)
m, k, rp = gm.merge(body_only_old, [], TARGETS)
errs, warns = gm.check_before_write(HEADER, body_only_old, [], m, k, rp, TARGETS)
check("既存にも対象日が無ければエラーにしない", errs == [])
check("代わりに『1行も取得できなかった日』を警告する", any("1行も取得できなかった日" in w for w in warns))

print("== ④ その他の書込前ガード ==")
e, _ = gm.check_before_write(["date", "lp"], BODY, new_rows, merged, kept, replaced, TARGETS)
check("ヘッダの列が足りなければ止める", any("ヘッダ" in x for x in e))
e, _ = gm.check_before_write(HEADER, [], [], [], [], [], TARGETS)
check("マージ結果が空なら止める", any("0行" in x for x in e))
e, _ = gm.check_before_write(HEADER, BODY, new_rows, merged, [], replaced, TARGETS)
check("窓外が丸ごと消えていたら止める(読み取り失敗の疑い)", any("窓外" in x for x in e))
_, w = gm.check_before_write(HEADER, BODY, [row("2026-07-29")], merged, kept, replaced, TARGETS)
check("対象日が半減したら警告する(止めはしない)", any("減少" in x for x in w))

print("== ⑤ 空行パディング: update 1回で余りを消す(ws.clear() 不要) ==")
short = [row("2026-07-10")]
payload = gm.build_payload(HEADER, short, previous_used_rows=25)
check("旧使用行数まで埋まる", len(payload) == 25)
check("先頭はヘッダ", payload[0] == HEADER)
check("余りは空セルで埋まる(旧データが残らない)",
      all(cell == "" for r in payload[2:] for cell in r))
check("空行も列幅6でそろう", all(len(r) == gm.WIDTH for r in payload))
payload2 = gm.build_payload(HEADER, merged, previous_used_rows=5)
check("増える場合はパディングしない", len(payload2) == len(merged) + 1)

print("== ⑥ 書込後の読み戻し検証 ==")
exp = gm.summarize(merged)
check("一致すればエラーなし", gm.check_after_write(exp, dict(exp)) == [])
bad = dict(exp, rows=exp["rows"] - 1)
check("行数が違えば検知", any("行数" in x for x in gm.check_after_write(exp, bad)))
bad = dict(exp, min="2026-07-29")
check("最古日が後退したら検知", any("最古日" in x for x in gm.check_after_write(exp, bad)))
bad = dict(exp, max="2026-07-30")
check("最新日が後退したら検知", any("最新日" in x for x in gm.check_after_write(exp, bad)))

print("== ⑦ 列幅の正規化(末尾の空セルが落ちても列がズレない) ==")
check("短い行は6列に伸びる", gm.normalize_row(["2026-07-10", "u=x"]) == ["2026-07-10", "u=x", "", "", "", ""])
check("長い行は6列に切られる", len(gm.normalize_row(list(range(9)))) == 6)

print(f"\n✅ 全 {len(OK)} 項目 OK (本番シートへのアクセスは0回)")
