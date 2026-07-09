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


# 着地が "/lp" または "/lp?..." のものだけ(=真のLP入口)。/lp/confirm や /lp/new は除外(Codex指摘①)
LANDING_FILTER = FilterExpression(filter=Filter(field_name="landingPagePlusQueryString",
    string_filter=Filter.StringFilter(match_type=Filter.StringFilter.MatchType.FULL_REGEXP, value=r"^/lp(\?.*)?$")))
SPECS = [
    ("landing",  "landingPagePlusQueryString", LANDING_FILTER),
    ("bot_open", "customEvent:hs_page",        eq("eventName", "hs_chat_open")),
    ("purchase", "pagePathPlusQueryString",    eq("eventName", "purchase")),
]


def main():
    # tidy(日次): date × variant × metric
    daily = {mname: query(dim, filt, by_date=True) for mname, dim, filt in SPECS}
    tidy = [["date", "variant", "metric", "sessions", "users"]]
    for mname, _dim, _filt in SPECS:
        for (ymd, var), v in sorted(daily[mname].items()):
            tidy.append([ymd, var, mname, v["sessions"], v["users"]])
    # 稼働期間(landing着地の初回/最終日)= 同時期比較の判断材料(Codex指摘③)
    span = {}
    for (ymd, var) in daily["landing"]:
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

    print("完了(既存 data / ダッシュボード は未変更)")


if __name__ == "__main__":
    main()
