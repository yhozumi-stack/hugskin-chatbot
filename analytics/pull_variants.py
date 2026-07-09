#!/usr/bin/env python3
"""LPバリアント(u=接頭辞)別に「流入/ボット起動/CV」をGA4から取り、
スプレッドシートに新タブ(variant_master / variant_daily / variant_summary)を作る。

既存の data / ダッシュボード タブは一切触らない(別タブのみ)。

方針(Codexレビュー反映):
- lp_view(/lp前方一致=後続ページ混入)は"流入分母"に使わない
- 流入は landingPagePlusQueryString の sessions/users(=真の着地)
- 率は sessions同士・users同士で出す(単位を混ぜない)
- tidy(縦持ち)の variant_daily を残す(将来Tableauに繋げやすい)

env: GA4_PROPERTY_ID / SHEET_ID / SA_KEY_PATH(省略時 analytics/service_account.json)
使い方: python3 pull_variants.py [window_days=60] [--dry]  (--dry はシート書込せず表示のみ)
"""
import os
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

SCOPES = ["https://www.googleapis.com/auth/analytics.readonly",
          "https://www.googleapis.com/auth/spreadsheets"]
creds = service_account.Credentials.from_service_account_file(KEY, scopes=SCOPES)
client = BetaAnalyticsDataClient(credentials=creds)

# variant_master の初期値(既に存在すれば上書きしない=ユーザー編集を尊重)
MASTER_HEADER = ["code", "名前", "ツール", "起動", "バケツ", "状態"]
MASTER_SEED = [
    ["fo",    "通常",          "なし",     "-",  "control", "稼働"],
    ["ins29", "自社bot 自動起動", "自社",     "自動", "bot",     "テスト中"],
    ["in29",  "自社bot CTA起動",  "自社",     "CTA",  "bot",     "テスト中"],
    ["as29",  "アスニカbot",     "アスニカ",  "CTA",  "bot",     "停止"],
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


def load_master() -> dict:
    """variant_master(code->(名前,状態))を読む。無ければseedを使う。"""
    seed = {row[0]: (row[1], row[5]) for row in MASTER_SEED}
    try:
        gc = gspread.authorize(creds)
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


def query(url_dim: str, event_filter, by_date: bool):
    """url_dim(URL/hs_page) で sessions,totalUsers を取り variant別に集約。
    by_date=True: (date, variant)別(日次tidy用) / False: variant別(期間合計=usersを正しく重複除去)。
    ※usersは日跨ぎで重複するので、期間合計は必ず by_date=False で引く(日次の足し算はNG)。"""
    dims = ([Dimension(name="date")] if by_date else []) + [Dimension(name=url_dim)]
    req = RunReportRequest(
        property=f"properties/{PID}",
        date_ranges=[DateRange(start_date=f"{WINDOW}daysAgo", end_date="today")],
        dimensions=dims,
        metrics=[Metric(name="sessions"), Metric(name="totalUsers")],
        dimension_filter=event_filter,
        limit=100000,
    )
    agg = {}
    for r in client.run_report(req).rows:
        d = r.dimension_values
        if by_date:
            ymd = f"{d[0].value[0:4]}-{d[0].value[4:6]}-{d[0].value[6:8]}"
            var = variant_of(u_from(d[1].value or ""))
            key = (ymd, var)
        else:
            var = variant_of(u_from(d[0].value or ""))
            key = var
        cur = agg.setdefault(key, {"sessions": 0, "users": 0})
        cur["sessions"] += int(r.metric_values[0].value)
        cur["users"] += int(r.metric_values[1].value)
    return agg


def query_events():
    """hs_chat_* を date×variant×scenario×event別に集計(botステップ用・variant_daily行)。
    metric=イベント名(prefix除去)。scenario別に持つ(=formplus/standardの混在を後で切り分け可)。"""
    req = RunReportRequest(
        property=f"properties/{PID}",
        date_ranges=[DateRange(start_date=f"{WINDOW}daysAgo", end_date="today")],
        dimensions=[Dimension(name="date"), Dimension(name="customEvent:hs_scenario"),
                    Dimension(name="eventName"), Dimension(name="customEvent:hs_page")],
        metrics=[Metric(name="sessions"), Metric(name="totalUsers")],
        dimension_filter=FilterExpression(filter=Filter(field_name="eventName",
            string_filter=Filter.StringFilter(
                match_type=Filter.StringFilter.MatchType.BEGINS_WITH, value="hs_chat_"))),
        limit=100000,
    )
    agg = {}
    for r in client.run_report(req).rows:
        d = r.dimension_values
        ymd = f"{d[0].value[0:4]}-{d[0].value[4:6]}-{d[0].value[6:8]}"
        scenario = d[1].value or "(not set)"
        ev = d[2].value.replace("hs_chat_", "")
        var = variant_of(u_from(d[3].value or ""))
        cur = agg.setdefault((ymd, var, scenario, ev), {"sessions": 0, "users": 0})
        cur["sessions"] += int(r.metric_values[0].value)
        cur["users"] += int(r.metric_values[1].value)
    return agg


# 着地が "/lp" または "/lp?..." のものだけ(=真のLP入口)。/lp/confirm や /lp/new は除外(Codex指摘①)
LANDING_FILTER = FilterExpression(filter=Filter(field_name="landingPagePlusQueryString",
    string_filter=Filter.StringFilter(match_type=Filter.StringFilter.MatchType.FULL_REGEXP, value=r"^/lp(\?.*)?$")))
SPECS = [
    ("landing",  "landingPagePlusQueryString", LANDING_FILTER),
    ("bot_open", "customEvent:hs_page",        eq("eventName", "hs_chat_open")),
    ("purchase", "pagePathPlusQueryString",    eq("eventName", "purchase")),
]


# ダッシュボードのファネル(表示名, variant_dailyのmetric名)。
# ※formplusは性別/PW/郵便番号を個別イベントにせず他ステップに束ねて発火するため、
#   個別行(step_sex/password/zip)は置かず束ねた表示にする(standard scenarioは別途)。
FUNNEL = [
    ("LP流入", "landing"), ("ボット起動", "open"), ("名前", "step_name"),
    ("生年月日", "step_birth"), ("連絡先(メール/PW)", "step_contact"),
    ("住所(+郵便番号)", "step_addr"), ("支払い方法", "step_payment"),
    ("カード情報", "step_card"), ("確認画面", "summary_view"),
    ("自動送信", "auto_submit"), ("CV(購入)", "purchase"),
]


def ensure_dashboard(sh, existing):
    """variant_dashboard タブを作る(無ければ)。期間/バリアントをセルで切替、
    variant_daily から SUMPRODUCT で集計する数式(=日付/バリアントを変えると即再計算)。
    既に有れば触らない(ユーザーの選択セルを保持)。"""
    if "variant_dashboard" in existing:
        print("variant_dashboard: 既存につき保持")
        return
    today = datetime.now(timezone(timedelta(hours=9))).date()
    start = (today - timedelta(days=14)).isoformat()
    D = "variant_daily"  # 参照先。列: A=date B=variant C=scenario D=metric E=sessions
    Ad, Bd = f"{D}!$A$2:$A$5000", f"{D}!$B$2:$B$5000"
    Cd, Dd, Ed = f"{D}!$C$2:$C$5000", f"{D}!$D$2:$D$5000", f"{D}!$E$2:$E$5000"
    # 制御セル: B1=開始 D1=終了 / B2=バリアント / B3=シナリオ。ヘッダ=5行目、ファネル=6行目〜
    vals = [
        ["期間", start, "〜", today.isoformat(), "", ""],
        ["バリアント", "ins29", "", "", "", ""],
        ["シナリオ", "formplus", "", "", "", ""],
        ["", "", "", "", "", ""],
        ["ステップ", "到達(sess)", "対LP流入", "対ボット起動", "", "metric"],
    ]
    period = f'({Ad}>=TEXT($B$1,"yyyy-mm-dd"))*({Ad}<=TEXT($D$1,"yyyy-mm-dd"))*({Bd}=$B$2)'
    # 率は固定基準(÷LP流入=$B$6 / ÷ボット起動=$B$7)。直前比だと修正機能の再発火で崩れるため。
    n = len(FUNNEL)
    for j, (label, metric) in enumerate(FUNNEL):
        r = 6 + j
        is_lp = metric in ("landing", "purchase")  # LP系はシナリオ非依存、botステップはB3で絞る
        scen = "" if is_lp else f"*({Cd}=$B$3)"
        reach = f'=IFERROR(SUMPRODUCT({period}{scen}*({Dd}=$F{r})*{Ed}),0)'
        cover_lp = f'=IFERROR($B{r}/$B$6,"")'                       # 対LP流入(=起動率/LP CVRもここ)
        cover_open = "" if metric == "landing" else f'=IFERROR($B{r}/$B$7,"")'  # 対ボット起動
        vals.append([label, reach, cover_lp, cover_open, "", metric])

    ws = sh.add_worksheet("variant_dashboard", rows=max(30, n + 10), cols=6)
    ws.update(vals, "A1", value_input_option="USER_ENTERED")
    first, last = 6, 5 + n
    ws.format(f"C{first}:D{last}", {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}})
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


def main():
    # tidy(日次): date × variant × metric。landing + botステップ(hs_chat_*) + purchase
    land_d = query("landingPagePlusQueryString", LANDING_FILTER, by_date=True)
    pur_d = query("pagePathPlusQueryString", eq("eventName", "purchase"), by_date=True)
    ev_d = query_events()
    # scenario列: LP系(landing/purchase)は "(lp)"、botステップは hs_scenario
    tidy = [["date", "variant", "scenario", "metric", "sessions", "users"]]
    for (ymd, var), v in sorted(land_d.items()):
        tidy.append([ymd, var, "(lp)", "landing", v["sessions"], v["users"]])
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
    print(f"\n[variant_daily] {len(tidy)-1} 行 (先頭5)")
    for row in tidy[1:6]:
        print("  ", row)

    if DRY:
        print("\n--dry: シートには書き込みません")
        return

    # ---- シート書込(新タブのみ・既存は触らない) ----
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)
    existing = {ws.title for ws in sh.worksheets()}

    # variant_master: 無ければ作ってseed。あれば触らない(ユーザー編集尊重)
    if "variant_master" not in existing:
        ws = sh.add_worksheet("variant_master", rows=50, cols=len(MASTER_HEADER))
        ws.update([MASTER_HEADER] + MASTER_SEED, "A1")
        print("variant_master: 作成+初期値")
    else:
        print("variant_master: 既存につき保持")

    for title, values in [("variant_daily", tidy), ("variant_summary", summary)]:
        if title in existing:
            ws = sh.worksheet(title)
            ws.clear()
        else:
            ws = sh.add_worksheet(title, rows=max(50, len(values) + 5), cols=len(values[0]))
        ws.update(values, "A1")
        print(f"{title}: {len(values)-1} 行 更新")

    ensure_dashboard(sh, existing)
    print("完了(既存 data / ダッシュボード は未変更)")


if __name__ == "__main__":
    main()
