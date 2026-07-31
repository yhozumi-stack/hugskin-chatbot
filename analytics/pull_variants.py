#!/usr/bin/env python3
"""LPバリアント(u=接頭辞)別に「流入/ボット起動/CV」をGA4から取り、
スプレッドシートに新タブ(variant_master / variant_daily / variant_summary)を作る。

既存の data / ダッシュボード タブは一切触らない(別タブのみ)。

方針(Codexレビュー反映):
- lp_view(/lp前方一致=後続ページ混入)は"流入分母"に使わない
- 流入は landingPagePlusQueryString の sessions/users(=真の着地)
- 率は sessions同士・users同士で出す(単位を混ぜない)
- tidy(縦持ち)の variant_daily を残す(将来Tableauに繋げやすい)

⚠️ variant_daily は「蓄積型(マージ)」(2026-07-31〜)。
   以前は ws.clear() → 全書き換えだったため、WINDOW より短い窓で1回実行するだけで
   窓の外の過去日がシートから消えた(sanity_guards は直近3日しか見ないので検知できない
   =サイレント障害)。実際 2026-07-31 に 856行 → 341行(07-24〜07-31)まで縮んでいた。
   今は (date, variant, scenario, metric) をキーにした upsert で、
   ・同キー = 新しい取得値で上書き(GA4は数日かけて確定するため)
   ・既存にしかない過去日 = そのまま残す(履歴は消えない)
   → **variant_daily に対して ws.clear() を使ってはいけない**。
   さらに書込前に「行数・日付範囲が縮んでいないか」を検証し、縮んでいたら書かずに exit 1。

env: GA4_PROPERTY_ID / SHEET_ID / SA_KEY_PATH(省略時 analytics/service_account.json)
使い方: python3 pull_variants.py [window_days=60] [--dry] [--reset-dashboard]
  --dry: シート書込せず表示のみ(既存行の読み取りとマージ結果の表示は行う)
  --reset-dashboard: variant_dashboardタブを削除→再作成
"""
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import gspread
from google.oauth2 import service_account
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    RunReportRequest, DateRange, Dimension, Metric,
    FilterExpression, FilterExpressionList, Filter,
)

PID = os.environ.get("GA4_PROPERTY_ID", "534388892")
SHEET_ID = os.environ.get("SHEET_ID", "1alEw24pSXbbjtwM5RBl8cCXu77ZLHTHJsTsEO70bEwM")
KEY = os.environ.get("SA_KEY_PATH", os.path.join(os.path.dirname(__file__), "service_account.json"))
WINDOW = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 60
DRY = "--dry" in sys.argv
RESET_DASH = "--reset-dashboard" in sys.argv

SCOPES = ["https://www.googleapis.com/auth/analytics.readonly",
          "https://www.googleapis.com/auth/spreadsheets"]
# 鍵の読み込みは遅延(import しただけで鍵を要求しない=マージ処理の単体テストが鍵なしで書ける)
_creds = _client = None


def get_creds():
    global _creds
    if _creds is None:
        _creds = service_account.Credentials.from_service_account_file(KEY, scopes=SCOPES)
    return _creds


def get_client():
    global _client
    if _client is None:
        _client = BetaAnalyticsDataClient(credentials=get_creds())
    return _client


DAILY_SHEET = "variant_daily"
DAILY_HEADER = ["date", "variant", "scenario", "metric", "sessions", "users"]
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# 既存 variant_dashboard の SUMPRODUCT 参照範囲は A2:A5569。蓄積型では行が増え続けるので、
# ここを超えると「集計が黙って欠ける」。超える前に警告を出す(サイレントを作らない)。
DASH_REF_ROWS = 5568
DASH_WARN_ROWS = 4400
# 新規作成/--reset-dashboard で作り直す時の参照範囲(蓄積型に合わせて広く取る)
DASH_NEW_ROWS = 20000

CHANGELOG_SHEET = "変更ログ"
CHANGELOG_HEADER = ["date", "種別", "対象", "内容"]
# ヘッダ直下の書き方メモ。「先頭が # の行」「date が YYYY-MM-DD でない行」は
# 機械読み取り(load_changelog)が無視するので、自由に注記を足してよい。
CHANGELOG_NOTE = [
    "# 書き方",
    "1行1イベント",
    "対象=variant code or 全体",
    "date は YYYY-MM-DD。先頭が # の行 / date が日付でない行は集計側が無視するので自由に書いてOK。"
    "種別の例: AB切替 / バリアント追加 / バリアント停止 / LP変更 / 計測変更 / メモ。"
    "対象は variant code(ins29 等) か 全体。",
]
# 新規作成時だけ入れる初期行(=判明済みの切り替え。出典を内容に明記する)
CHANGELOG_SEED = [
    ["2026-07-24", "AB切替", "全体",
     "メモタブ「7/24に切り替えたから25からやる」より。"
     "第1期(fo/in29/ins29＝ボット有無・起動方式)→第2期(ins29/insp29/inso29＝離脱確認の有無と訴求)"],
]

# variant_master の初期値(既に存在すれば上書きしない=ユーザー編集を尊重)
MASTER_HEADER = ["code", "名前", "ツール", "起動", "バケツ", "状態"]
MASTER_SEED = [
    ["fo",    "通常",          "なし",     "-",  "control", "稼働"],
    ["ins29", "自社bot 自動起動", "自社",     "自動", "bot",     "テスト中"],
    ["insp29", "自社bot 自動起動+離脱確認(安心訴求)", "自社", "自動", "bot", "テスト中"],
    ["inso29", "自社bot 自動起動+離脱確認(お得訴求)", "自社", "自動", "bot", "テスト中"],
    ["in29",  "自社bot CTA起動",  "自社",     "CTA",  "bot",     "テスト中"],
    ["as29",  "アスニカbot",     "アスニカ",  "CTA",  "bot",     "停止"],
    ["as19",  "アスニカ旧",      "アスニカ",  "CTA",  "bot",     "停止"],
    ["lp1",   "LP1(価格テスト)", "なし",     "-",  "control", "停止"],
    ["lp2",   "LP2(価格テスト)", "なし",     "-",  "control", "停止"],
    ["lp3",   "LP3(価格テスト)", "なし",     "-",  "control", "停止"],
    ["INH",   "INH",            "なし",     "-",  "other",   "停止"],
    ["thanks","サンクスページ",   "なし",     "-",  "other",   "対象外"],
]


def variant_of(u: str) -> str:
    """u= の値からバリアント(接頭辞)を取る。テストは *_test に寄せて本番と分離。"""
    if not u:
        return "(no_u)"
    pre = u.split("_")[0]
    return pre + "_test" if "test" in u.lower() else pre


def u_from(url: str) -> str:
    try:
        return (parse_qs(urlparse(url).query).get("u") or [""])[0]
    except Exception:
        return ""


def u_from_any(*urls) -> str:
    """複数のURL候補からu=を探す(壊れにくい多段フォールバック 2026-07-13)。
    ①どれかのu=(hs_page正規形/実URLの順) ②u=が全滅ならab=(Squad beyondの
    AB振り分けコード。in/insの区別は無いが施策単位の集計は残る=ゼロにしない)"""
    for url in urls:
        u = u_from(url)
        if u:
            return u
    for url in urls:
        try:
            ab = (parse_qs(urlparse(url).query).get("ab") or [""])[0]
        except Exception:
            ab = ""
        if ab:
            return ab
    return ""


def load_master() -> dict:
    """variant_master(code->(名前,状態))を読む。無ければseedを使う。"""
    seed = {row[0]: (row[1], row[5]) for row in MASTER_SEED}
    try:
        gc = gspread.authorize(get_creds())
        ws = gc.open_by_key(SHEET_ID).worksheet("variant_master")
        vals = ws.get_all_values()[1:]
        m = {r[0]: (r[1] if len(r) > 1 else "", r[5] if len(r) > 5 else "") for r in vals if r and r[0]}
        return m or seed
    except Exception:
        return seed


def eq(f, v):
    return FilterExpression(filter=Filter(field_name=f, string_filter=Filter.StringFilter(value=v)))


def AND(*fs):
    return FilterExpression(and_group=FilterExpressionList(expressions=list(fs)))


def query(url_dims, event_filter, by_date: bool):
    """url_dims(URL系ディメンション名 or そのリスト)で sessions,totalUsers を取り variant別に集約。
    複数指定時はどれかからu=が取れればOK(hs_page正規形×実URLの多段フォールバック)。
    by_date=True: (date, variant)別(日次tidy用) / False: variant別(期間合計=usersを正しく重複除去)。
    ※usersは日跨ぎで重複するので、期間合計は必ず by_date=False で引く(日次の足し算はNG)。"""
    if isinstance(url_dims, str):
        url_dims = [url_dims]
    dims = ([Dimension(name="date")] if by_date else []) + [Dimension(name=d) for d in url_dims]
    req = RunReportRequest(
        property=f"properties/{PID}",
        date_ranges=[DateRange(start_date=f"{WINDOW}daysAgo", end_date="today")],
        dimensions=dims,
        metrics=[Metric(name="sessions"), Metric(name="totalUsers")],
        dimension_filter=event_filter,
        limit=100000,
    )
    agg = {}
    off = 1 if by_date else 0
    for r in get_client().run_report(req).rows:
        d = r.dimension_values
        var = variant_of(u_from_any(*[d[off + i].value or "" for i in range(len(url_dims))]))
        if by_date:
            ymd = f"{d[0].value[0:4]}-{d[0].value[4:6]}-{d[0].value[6:8]}"
            key = (ymd, var)
        else:
            key = var
        cur = agg.setdefault(key, {"sessions": 0, "users": 0})
        cur["sessions"] += int(r.metric_values[0].value)
        cur["users"] += int(r.metric_values[1].value)
    return agg


def query_events():
    """hs_chat_* を date×variant×scenario×event別に集計(botステップ用・variant_daily行)。
    metric=イベント名(prefix除去)。scenario別に持つ(=formplus/standardの混在を後で切り分け可)。
    ※URLは hs_page(v3.25.0からチャット側が「パス+u=」の短い正規形を送る=第一候補)と
      標準ディメンションの実URL(旧データ・保険=第二候補)の両方から引く(2026-07-13)"""
    req = RunReportRequest(
        property=f"properties/{PID}",
        date_ranges=[DateRange(start_date=f"{WINDOW}daysAgo", end_date="today")],
        dimensions=[Dimension(name="date"), Dimension(name="customEvent:hs_scenario"),
                    Dimension(name="eventName"), Dimension(name="customEvent:hs_page"),
                    Dimension(name="pagePathPlusQueryString")],
        metrics=[Metric(name="sessions"), Metric(name="totalUsers")],
        dimension_filter=FilterExpression(filter=Filter(field_name="eventName",
            string_filter=Filter.StringFilter(
                match_type=Filter.StringFilter.MatchType.BEGINS_WITH, value="hs_chat_"))),
        limit=100000,
    )
    agg = {}
    for r in get_client().run_report(req).rows:
        d = r.dimension_values
        ymd = f"{d[0].value[0:4]}-{d[0].value[4:6]}-{d[0].value[6:8]}"
        scenario = d[1].value or "(not set)"
        ev = d[2].value.replace("hs_chat_", "")
        var = variant_of(u_from_any(d[3].value or "", d[4].value or ""))
        cur = agg.setdefault((ymd, var, scenario, ev), {"sessions": 0, "users": 0})
        cur["sessions"] += int(r.metric_values[0].value)
        cur["users"] += int(r.metric_values[1].value)
    return agg


# 着地が "/lp" または "/lp?..." のものだけ(=真のLP入口)。/lp/confirm や /lp/new は除外(Codex指摘①)
LANDING_FILTER = FilterExpression(filter=Filter(field_name="landingPagePlusQueryString",
    string_filter=Filter.StringFilter(match_type=Filter.StringFilter.MatchType.FULL_REGEXP, value=r"^/lp(\?.*)?$")))
SPECS = [
    ("landing",   "landingPagePlusQueryString", LANDING_FILTER),
    ("bot_open",  ["customEvent:hs_page", "pagePathPlusQueryString"], eq("eventName", "hs_chat_open")),
    ("purchase",  "pagePathPlusQueryString",    eq("eventName", "purchase")),
    ("form_view", "pagePathPlusQueryString",    eq("eventName", "form_view")),
    ("cta_click", "pagePathPlusQueryString",    eq("eventName", "cta_click")),
]


# ダッシュボードのファネル(表示名, variant_dailyのmetric名)。
# ※formplusは性別/PW/郵便番号を個別イベントにせず他ステップに束ねて発火するため、
#   個別行(step_sex/password/zip)は置かず束ねた表示にする(standard scenarioは別途)。
FUNNEL = [
    ("LP流入", "landing"), ("フォーム表示", "form_view"), ("CTA押下", "cta_click"),
    ("ボット起動", "open"), ("名前", "step_name"),
    ("生年月日(+性別)", "step_birth"), ("住所(郵便番号/電話番号)", "step_addr"),
    ("連絡先(メール/PW)", "step_contact"), ("支払い方法", "step_payment"),
    ("カード情報", "step_card"), ("確認画面", "summary_view"),
    ("自動送信", "auto_submit"), ("CV(購入)", "purchase"),
]


def ensure_dashboard(sh, existing):
    """variant_dashboard タブを作る(無ければ)。期間/バリアントをセルで切替、
    variant_daily から SUMPRODUCT で集計する数式(=日付/バリアントを変えると即再計算)。
    既に有れば触らない(ユーザーの選択セルを保持)。"""
    if "variant_dashboard" in existing and not RESET_DASH:
        print("variant_dashboard: 既存につき保持(--reset-dashboard で再作成)")
        return
    if "variant_dashboard" in existing:
        sh.del_worksheet(sh.worksheet("variant_dashboard"))
        print("variant_dashboard: 削除→再作成")
    today = datetime.now(timezone(timedelta(hours=9))).date()
    start = (today - timedelta(days=14)).isoformat()
    D = DAILY_SHEET  # 参照先。列: A=date B=variant C=scenario D=metric E=sessions
    # variant_daily は蓄積型で行が増え続けるので、参照範囲は広めに取る(狭いと黙って欠ける)
    N = DASH_NEW_ROWS
    Ad, Bd = f"{D}!$A$2:$A${N}", f"{D}!$B$2:$B${N}"
    Cd, Dd, Ed = f"{D}!$C$2:$C${N}", f"{D}!$D$2:$D${N}", f"{D}!$E$2:$E${N}"
    # 制御セル: B1=開始 D1=終了 / B2=バリアント / B3=シナリオ。ヘッダ=5行目、ファネル=6行目〜
    vals = [
        ["期間", start, "〜", today.isoformat(), "", ""],
        ["バリアント", "ins29", "", "", "", ""],
        ["シナリオ", "formplus", "", "", "", ""],
        ["", "", "", "", "", ""],
        ["ステップ", "到達(sess)", "対LP流入", "対ボット起動(起動後)", "直前比較(参考)", "metric"],
    ]
    period = f'({Ad}>=TEXT($B$1,"yyyy-mm-dd"))*({Ad}<=TEXT($D$1,"yyyy-mm-dd"))*({Bd}=$B$2)'
    n = len(FUNNEL)
    open_row = 6 + next(j for j, (_, m) in enumerate(FUNNEL) if m == "open")
    # 率は固定基準(÷LP流入=$B$6 / ÷ボット起動=$B${open_row})。直前比だと修正機能の再発火で崩れるため。
    for j, (label, metric) in enumerate(FUNNEL):
        r = 6 + j
        is_lp = metric in ("landing", "purchase", "form_view", "cta_click")
        scen = "" if is_lp else f"*({Cd}=$B$3)"
        reach = f'=IFERROR(SUMPRODUCT({period}{scen}*({Dd}=$F{r})*{Ed}),0)'
        cover_lp = f'=IFERROR($B{r}/$B$6,"")'
        # 「対ボット起動」はボット起動以降の行だけ。LP流入/フォーム表示/CTA押下はbot起動より"前"の
        # LPイベントなので分母(ボット起動)にできない→空欄(bot起動列で見ると誤読になる。Codex指摘)
        cover_open = f'=IFERROR($B{r}/$B${open_row},"")' if r >= open_row else ""
        # 直前比較(=残存率): ボット起動より"後"のステップだけ直前の表示行と比較→どこで離脱したかが分かる。
        # bot内は一本道なので有効(LP側は自動起動/CTA起動で経路が分岐するので出さない)。DIV/0はIFERRORで空に
        prev = f'=IFERROR($B{r}/$B{r-1},"")' if r > open_row else ""
        vals.append([label, reach, cover_lp, cover_open, prev, metric])
    # E列(直前比較)の但し書き。ファネル最終行(=5+n)の1つ下に置く。
    # ※sessions基準では"修正の再発火"は二重計上されない(同一セッション内は1)。100%超の主因は
    #   小N＋確認画面からの部分修正でセッションが分裂すること。母数が増えると収束(=参考値)。
    vals.append(["", "", "", "", "※参考値。小N＋確認画面での部分修正で100%超が出る(母数増で収束)", ""])
    # cta_clickの計測範囲はGTM修正(2026-07-13公開)で拡大した。それ以前は追従バナー
    # (fixBanner-btn)のクリックが未計測=過小なので、7/13をまたぐ期間比較は不可
    vals.append(["※CTA押下(cta_click)は2026-07-13にGTMトリガーを修正(それ以前は追従バナーのクリックが未計測=過小)。7/13をまたぐ期間比較は注意", "", "", "", "", ""])

    ws = sh.add_worksheet("variant_dashboard", rows=max(30, n + 10), cols=6)
    ws.update(vals, "A1", value_input_option="USER_ENTERED")
    first, last = 6, 5 + n
    ws.format(f"C{first}:E{last}", {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}})
    ws.format("A1:A3", {"textFormat": {"bold": True}})
    ws.format("A5:F5", {"textFormat": {"bold": True}})
    # B2=バリアント / B3=シナリオ のプルダウン(失敗しても本体は動く)
    try:
        def dv(row0, opts):
            return {"setDataValidation": {
                "range": {"sheetId": ws.id, "startRowIndex": row0, "endRowIndex": row0 + 1,
                          "startColumnIndex": 1, "endColumnIndex": 2},
                "rule": {"condition": {"type": "ONE_OF_LIST",
                    "values": [{"userEnteredValue": v} for v in opts]},
                    "showCustomUi": True, "strict": False}}}
        sh.batch_update({"requests": [
            dv(1, ["fo", "ins29", "in29", "as29"]),
            dv(2, ["formplus", "standard", "(not set)"]),
        ]})
    except Exception as e:
        print(f"  (プルダウン設定skip: {e})")
    print("variant_dashboard: 作成(期間/バリアント/シナリオ切替式)")


def _num(v):
    """シートから読んだ値を数値に戻す。
    ⚠️必須: 書込は RAW なので、文字列 '12' のまま書き戻すとセルが「文字」になり、
    variant_dashboard の SUMPRODUCT が**エラーも出さずに 0** を返す(サイレント破壊)。"""
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip().replace(",", "")
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def read_daily(sh):
    """variant_daily の既存行を読む(shrink検証とマージの土台)。
    戻り: (dict[(date,variant,scenario,metric)] -> 行, 生のデータ行数, 無視した壊れ行数)"""
    try:
        ws = sh.worksheet(DAILY_SHEET)
    except gspread.WorksheetNotFound:
        return {}, 0, 0
    vals = ws.get_all_values()
    if not vals:
        return {}, 0, 0
    cur, bad = {}, 0
    for r in vals[1:]:
        r = (list(r) + [""] * len(DAILY_HEADER))[:len(DAILY_HEADER)]
        d = r[0].strip()
        if not d and not any(c.strip() for c in r):
            continue          # 完全な空行はカウントしない
        if not DATE_RE.match(d):
            bad += 1
            continue
        key = (d, r[1].strip(), r[2].strip(), r[3].strip())
        cur[key] = [key[0], key[1], key[2], key[3], _num(r[4]), _num(r[5])]
    return cur, sum(1 for r in vals[1:] if any(c.strip() for c in r)), bad


def stats_of(rows):
    """行(ヘッダ抜き)の 行数・最古日・最新日。shrink検証の比較単位。"""
    dates = sorted({r[0] for r in rows if r and DATE_RE.match(str(r[0]))})
    return {"rows": len(rows), "min": dates[0] if dates else None,
            "max": dates[-1] if dates else None}


def merge_daily(existing, new_rows, win_start, win_end):
    """(date, variant, scenario, metric) をキーに upsert。
    ・同キー → 新しい取得値で上書き(GA4は数日かけて確定するため常に新を採用)
    ・既存にしかない行 → そのまま残す(=**履歴は構造的に消えない**)
    戻り: (マージ後の行リスト(ヘッダ抜き・キー順), stats)"""
    merged = dict(existing)
    overwritten = changed = added = 0
    new_keys = set()
    for row in new_rows:
        key = (row[0], row[1], row[2], row[3])
        val = [key[0], key[1], key[2], key[3], int(row[4]), int(row[5])]
        new_keys.add(key)
        if key in merged:
            overwritten += 1
            if merged[key][4:6] != val[4:6]:
                changed += 1
        else:
            added += 1
        merged[key] = val
    # 「窓の中なのに今回GA4が返さなくなった既存キー」= 古い値が残り続ける。
    # 数値が黙って据え置かれるので、黙殺せず件数を出す(GA4のしきい値処理でも起きうる)。
    stale = [k for k in existing if k not in new_keys and win_start <= k[0] <= win_end]
    rows = [merged[k] for k in sorted(merged)]
    return rows, {"overwritten": overwritten, "changed": changed,
                  "added": added, "stale_in_window": len(stale)}


def check_no_shrink(before, after):
    """行数・日付範囲が縮んでいないかを検証(=サイレント履歴消失の検知)。
    マージ方式なら通常は絶対に縮まないので、縮んだ = バグかデータ破損のサイン。
    戻り: エラー文字列のリスト(空なら健全)"""
    errs = []
    if after["rows"] < before["rows"]:
        errs.append(f"{DAILY_SHEET} の行数が縮小: {before['rows']}行 → {after['rows']}行。"
                    "蓄積型では起こらないはずの事象(マージ漏れ/既存行の読み取り失敗を疑う)")
    if before["min"] and (not after["min"] or after["min"] > before["min"]):
        errs.append(f"{DAILY_SHEET} の最古日が後退: {before['min']} → {after['min']}。過去分が失われている")
    if before["max"] and (not after["max"] or after["max"] < before["max"]):
        errs.append(f"{DAILY_SHEET} の最新日が後退: {before['max']} → {after['max']}。直近分が失われている")
    return errs


def abort_on_shrink(errs, phase):
    """縮小を検知したら、書き込まずに大声で死ぬ(Slack通知は yml の if: failure() 側)。"""
    if not errs:
        return
    for e in errs:
        print(f"::error::🚨 GUARD({phase}): {e}")
    print(f"::error::🚨 {DAILY_SHEET} への書き込みを中止しました(履歴保護のため)。"
          "原因を直してから再実行してください")
    sys.exit(1)


def write_daily(sh, values, existing):
    """variant_daily を書く。
    ⚠️ **ws.clear() は絶対に使わない**(過去分消失の元凶。2026-07-31改修)。
    values はマージ済み=既存の上位集合なので行数は必ず「同じか増える」→
    上書き書き込みだけで取り残し行は原理的に発生しない。"""
    if DAILY_SHEET in existing:
        ws = sh.worksheet(DAILY_SHEET)
        if ws.row_count < len(values):
            ws.add_rows(len(values) - ws.row_count + 200)
        if ws.col_count < len(DAILY_HEADER):
            ws.add_cols(len(DAILY_HEADER) - ws.col_count)
    else:
        ws = sh.add_worksheet(DAILY_SHEET, rows=len(values) + 200, cols=len(DAILY_HEADER))
    ws.update(values, "A1")
    return ws


def load_changelog(sh):
    """変更ログ を機械読み(先頭 # / date が YYYY-MM-DD でない行は無視)。
    書き込みは一切しない。実行ログに出して「いつ何を切り替えたか」を数字の隣に置く。"""
    try:
        ws = sh.worksheet(CHANGELOG_SHEET)
    except gspread.WorksheetNotFound:
        return []
    out = []
    for r in ws.get_all_values()[1:]:
        r = (list(r) + [""] * len(CHANGELOG_HEADER))[:len(CHANGELOG_HEADER)]
        d = r[0].strip()
        if d.startswith("#") or not DATE_RE.match(d):
            continue
        out.append([d] + [c.strip() for c in r[1:]])
    return sorted(out)


def ensure_changelog(sh, existing):
    """変更ログ タブ(人が手で書く・機械が読む)。無ければ作る。
    ⚠️ **既に有れば中身に一切触らない**(手入力が消えたら本末転倒なので上書き・削除禁止)。"""
    if CHANGELOG_SHEET in existing:
        print(f"{CHANGELOG_SHEET}: 既存につき保持(内容には一切触らない)")
        return
    ws = sh.add_worksheet(CHANGELOG_SHEET, rows=200, cols=len(CHANGELOG_HEADER))
    ws.update([CHANGELOG_HEADER, CHANGELOG_NOTE] + CHANGELOG_SEED, "A1")
    try:    # 見やすさの調整(失敗しても本体は動く)
        ws.format("A1:D1", {"textFormat": {"bold": True}})
        ws.format("A2:D2", {"textFormat": {"italic": True,
                                           "foregroundColor": {"red": .55, "green": .55, "blue": .55}}})
        sh.batch_update({"requests": [
            {"updateSheetProperties": {
                "properties": {"sheetId": ws.id, "gridProperties": {"frozenRowCount": 2}},
                "fields": "gridProperties.frozenRowCount"}},
            {"updateDimensionProperties": {
                "range": {"sheetId": ws.id, "dimension": "COLUMNS", "startIndex": 3, "endIndex": 4},
                "properties": {"pixelSize": 640}, "fields": "pixelSize"}},
        ]})
    except Exception as e:
        print(f"  ({CHANGELOG_SHEET} の書式設定skip: {e})")
    print(f"{CHANGELOG_SHEET}: 作成 + 初期行{len(CHANGELOG_SEED)}件"
          "(以後この関数はタブを作るだけで、中身は二度と触りません)")


def sanity_guards(tidy_rows):
    """集計が「静かに」壊れた時にワークフローを失敗させる(通知はymlの if: failure() 側)。
    ジョブ自体はsuccessのまま中身だけ死ぬパターン(2026-07-10のhs_page切り落とし等)への保険。
    ⚠️ シート書込の「後」に呼ぶこと(データは残した上で大声で死ぬ)。
    ⚠️ 引数は「今回GA4から取り直した行」を渡すこと(マージ後の行を渡すと、窓を短くした時に
       取得していない日の古い行で判定してしまい、直近3日の検査が骨抜きになる)。
    ※履歴の縮小検知は別系統(check_no_shrink)。あちらは書込「前」に走って書かずに止める。
    Guard A: 直近3日のチャットイベントのバリアント判定不能率((no_u))が50%超
             → URL形式がまた変わってu=/ab=両方読めなくなった疑い
    Guard B: 直近3日でLP流入が十分あるのにチャットイベントが1件も無い
             → GTMタグ停止・GA4計測死の疑い"""
    today = datetime.now(timezone(timedelta(hours=9))).date()   # JST固定(RunnerはUTC)
    recent = {(today - timedelta(days=i)).isoformat() for i in range(3)}
    chat = [r for r in tidy_rows[1:] if r[0] in recent and r[2] != "(lp)"]
    chat_sessions = sum(int(r[4]) for r in chat)
    no_u = sum(int(r[4]) for r in chat if r[1] == "(no_u)")
    landing = sum(int(r[4]) for r in tidy_rows[1:] if r[0] in recent and r[3] == "landing")
    errors = []
    if chat_sessions >= 5 and no_u / chat_sessions > 0.5:
        errors.append(f"バリアント判定不能((no_u))が直近3日で{no_u}/{chat_sessions}セッション(>50%)。"
                      "LPのURL形式変化(u=/ab=両方消えた)やGA4ディメンション変更を疑う")
    if chat_sessions == 0 and landing >= 30:
        errors.append(f"直近3日: LP流入{landing}セッションに対しチャットイベント0件。"
                      "GTMタグ停止/チャット計測の死を疑う(GA4リアルタイムで実機確認を)")
    if errors:
        for e in errors:
            print(f"::error::🚨 GUARD: {e}")
        print("(シートへの書込自体は完了済み。この失敗は検知目的)")
        sys.exit(1)
    print(f"guards OK (直近3日: chat {chat_sessions}s / (no_u) {no_u}s / landing {landing}s)")


def main():
    # tidy(日次): date × variant × metric。landing + GTMイベント + botステップ(hs_chat_*) + purchase
    land_d = query("landingPagePlusQueryString", LANDING_FILTER, by_date=True)
    pur_d = query("pagePathPlusQueryString", eq("eventName", "purchase"), by_date=True)
    fv_d = query("pagePathPlusQueryString", eq("eventName", "form_view"), by_date=True)
    cta_d = query("pagePathPlusQueryString", eq("eventName", "cta_click"), by_date=True)
    ev_d = query_events()
    # scenario列: LP系(landing/purchase/form_view/cta_click)は "(lp)"、botステップは hs_scenario
    tidy = [list(DAILY_HEADER)]
    for (ymd, var), v in sorted(land_d.items()):
        tidy.append([ymd, var, "(lp)", "landing", v["sessions"], v["users"]])
    for (ymd, var), v in sorted(fv_d.items()):
        tidy.append([ymd, var, "(lp)", "form_view", v["sessions"], v["users"]])
    for (ymd, var), v in sorted(cta_d.items()):
        tidy.append([ymd, var, "(lp)", "cta_click", v["sessions"], v["users"]])
    for (ymd, var, scenario, ev), v in sorted(ev_d.items()):
        tidy.append([ymd, var, scenario, ev, v["sessions"], v["users"]])
    for (ymd, var), v in sorted(pur_d.items()):
        tidy.append([ymd, var, "(lp)", "purchase", v["sessions"], v["users"]])
    # 稼働期間(landing着地の初回/最終日)= 同時期比較の判断材料(Codex指摘③)
    span = {}
    for (ymd, var) in land_d:
        s = span.setdefault(var, [ymd, ymd])
        s[0], s[1] = min(s[0], ymd), max(s[1], ymd)

    # summary(期間合計・usersは重複除去): variant別 landing/open/purchase の s,u と率
    win = {mname: query(dim, filt, by_date=False) for mname, dim, filt in SPECS}
    variants = sorted({var for data in win.values() for var in data})
    master = load_master()  # code -> (名前, 状態)。既存variant_masterがあれば尊重、無ければseed
    def g(m, var, key):
        return win[m].get(var, {}).get(key, 0)
    def pct(a, b):
        return round(a / b * 100, 1) if b else ""
    rows = []
    for var in variants:
        ls, lu = g("landing", var, "sessions"), g("landing", var, "users")
        os_, ou = g("bot_open", var, "sessions"), g("bot_open", var, "users")
        cs, cu = g("purchase", var, "sessions"), g("purchase", var, "users")
        name, state = master.get(var, ("", ""))
        first, last = span.get(var, ["", ""])
        rows.append([var, name, state, first, last, ls, lu, os_, ou, cs, cu,
                     pct(os_, ls), pct(ou, lu), pct(cs, ls), pct(cu, lu)])
    # 本番(状態あり)を上に、流入(sessions)降順
    order = {"稼働": 0, "テスト中": 1, "停止": 2, "": 9}
    rows.sort(key=lambda r: (order.get(r[2], 9), -r[5]))
    summary = [["variant", "名前", "状態", "初回着地", "最終着地", "landing_s", "landing_u",
                "open_s", "open_u", "cv_s", "cv_u",
                "起動率_s(%)", "起動率_u(%)", "LPCVR_s(%)", "LPCVR_u(%)"]] + rows

    # ---- 表示(dry) ----
    print(f"== variant集計 (直近{WINDOW}日 / property {PID}) ==")
    print("\n[variant_summary]")
    w = summary[0]
    print("  " + " | ".join(f"{c}" for c in w))
    for row in summary[1:]:
        print("  " + " | ".join(str(c) for c in row))
    print(f"\n[variant_daily] 今回GA4から取得 {len(tidy)-1} 行 (先頭5)")
    for row in tidy[1:6]:
        print("  ", row)

    # ---- 既存 variant_daily を読んでマージ(蓄積型) ----
    # --dry でもここまでは走る(読み取りのみ)。「消えないこと」をdry-runで実証できるようにするため。
    gc = gspread.authorize(get_creds())
    sh = gc.open_by_key(SHEET_ID)
    existing = {ws.title for ws in sh.worksheets()}

    today = datetime.now(timezone(timedelta(hours=9))).date()   # JST固定(RunnerはUTC)
    win_start = (today - timedelta(days=WINDOW)).isoformat()
    win_end = today.isoformat()
    cur, raw_rows, bad_rows = read_daily(sh)
    before = stats_of(list(cur.values()))
    daily_rows, mstat = merge_daily(cur, tidy[1:], win_start, win_end)
    after = stats_of(daily_rows)

    print(f"\n[{DAILY_SHEET} マージ] 既存{before['rows']}行 + 新規{mstat['added']}行 "
          f"→ 合計{after['rows']}行（うち更新{mstat['overwritten']}行）")
    print(f"  日付範囲: {before['min']}〜{before['max']} → {after['min']}〜{after['max']}")
    print(f"  内訳: 同キー上書き{mstat['overwritten']}行(うち値が変化{mstat['changed']}行) / "
          f"新規追加{mstat['added']}行 / 既存のまま保持{before['rows'] - mstat['overwritten']}行")
    if bad_rows:
        print(f"::warning::{DAILY_SHEET} に date が YYYY-MM-DD でない行が {bad_rows} 行あり無視しました"
              f"(生データ行数{raw_rows} / 採用{before['rows']})")
    if mstat["stale_in_window"]:
        print(f"::warning::窓({win_start}〜{win_end})の中なのに今回GA4が返さなかった既存キーが "
              f"{mstat['stale_in_window']} 件。古い値が据え置かれています"
              "(GA4のしきい値処理なら正常。急増したらディメンション変更を疑う)")
    if after["rows"] > DASH_WARN_ROWS:
        print(f"::warning::{DAILY_SHEET} が {after['rows']} 行。既存 variant_dashboard の参照範囲は "
              f"A2:A{DASH_REF_ROWS+1} なので、これを超えると集計が**黙って**欠けます。"
              "--reset-dashboard で作り直すか、ダッシュボードの数式の範囲を手で広げてください")

    # 書き込み「前」の縮小検知。マージ方式なら通常は縮まない=縮んだ時点でバグかデータ破損。
    abort_on_shrink(check_no_shrink(before, after), "書込前")

    if DRY:
        print(f"\n--dry: シートには書き込みません(既存{before['rows']}行は保持され、"
              f"合計{after['rows']}行になる予定。消える行は0行)")
        return

    # variant_master: 無ければ作ってseed。あれば未登録コードだけ追記(ユーザー編集尊重)
    if "variant_master" not in existing:
        ws = sh.add_worksheet("variant_master", rows=50, cols=len(MASTER_HEADER))
        ws.update([MASTER_HEADER] + MASTER_SEED, "A1")
        print("variant_master: 作成+初期値")
    else:
        ws = sh.worksheet("variant_master")
        existing_codes = {r[0] for r in ws.get_all_values()[1:] if r and r[0]}
        new_rows = [r for r in MASTER_SEED if r[0] not in existing_codes]
        if new_rows:
            ws.append_rows(new_rows, value_input_option="RAW")
            print(f"variant_master: {len(new_rows)} 件追記 ({', '.join(r[0] for r in new_rows)})")
        else:
            print("variant_master: 既存につき保持")

    # variant_daily: 蓄積型(マージ)。**clear() 禁止**(過去分が消えるため)
    write_daily(sh, [list(DAILY_HEADER)] + daily_rows, existing)
    print(f"{DAILY_SHEET}: 既存{before['rows']}行 + 新規{mstat['added']}行 "
          f"→ 合計{after['rows']}行（うち更新{mstat['overwritten']}行）を書き込み")

    # 書いたら読んで確認(HTTP 200 ≠ 永続化)。ここでも縮小していないかを見る。
    back, _, _ = read_daily(sh)
    actual = stats_of(list(back.values()))
    abort_on_shrink(check_no_shrink(before, actual), "書込後の読み戻し")
    if actual["rows"] != after["rows"]:
        print(f"::error::🚨 GUARD(書込後の読み戻し): 期待{after['rows']}行に対し実際は{actual['rows']}行。"
              "書き込みが一部しか通っていない疑い")
        sys.exit(1)
    print(f"  読み戻し検証OK: {actual['rows']}行 / {actual['min']}〜{actual['max']}")

    # variant_summary: 集計結果(窓内の再集計)なので従来どおり全書き換え
    if "variant_summary" in existing:
        ws = sh.worksheet("variant_summary")
        ws.clear()
    else:
        ws = sh.add_worksheet("variant_summary", rows=max(50, len(summary) + 5), cols=len(summary[0]))
    ws.update(summary, "A1")
    print(f"variant_summary: {len(summary)-1} 行 更新(直近{WINDOW}日の再集計)")

    ensure_changelog(sh, existing)
    ensure_dashboard(sh, existing)
    log = load_changelog(sh)
    if log:
        print(f"\n[{CHANGELOG_SHEET}] {len(log)} 件(数字を読む時の前提)")
        for r in log:
            print("  ", " | ".join(r))
    print("完了(既存 data / ダッシュボード は未変更)")
    sanity_guards(tidy)   # 「今回取得分」で判定。書込完了後に実行(壊れていたらexit 1→Slack通知)


if __name__ == "__main__":
    main()
