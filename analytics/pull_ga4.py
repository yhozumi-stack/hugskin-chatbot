#!/usr/bin/env python3
"""GA4からチャットボットイベント(hs_chat_*)を日次集計してスプレッドシートdataタブへ。
   GitHub Actionsで毎朝実行(直近N日を洗い替え=遅延データも取りこぼさない)。
   env: GA4_PROPERTY_ID / SHEET_ID / SA_KEY_PATH(省略時 analytics/service_account.json)"""
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import gspread
from google.oauth2 import service_account
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    RunReportRequest, DateRange, Dimension, Metric, FilterExpression, Filter,
)

PROPERTY_ID = os.environ["GA4_PROPERTY_ID"]
SHEET_ID = os.environ["SHEET_ID"]
KEY_PATH = os.environ.get("SA_KEY_PATH", os.path.join(os.path.dirname(__file__), "service_account.json"))
BACKFILL_DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 3

creds = service_account.Credentials.from_service_account_file(
    KEY_PATH,
    scopes=["https://www.googleapis.com/auth/analytics.readonly",
            "https://www.googleapis.com/auth/spreadsheets"])

def normalize_lp(page, *alts):
    """パス+クエリから広告コード(u=)を抽出してLP名にする。多段フォールバック(2026-07-13):
    ①page/alts のどれかの u=(hs_page はv3.25.0から「パス+u=」の短い正規形。
      旧データや保険として標準ディメンションの実URLも渡す)
    ②u=が全滅なら ab=(Squad beyondのAB振り分けコード。集計をゼロにしないため)
    ③どちらも無ければパス"""
    cands = [page] + list(alts)
    for c in cands:
        try:
            q = parse_qs(urlparse(c).query)
            if q.get("u"):
                return "u=" + q["u"][0]
        except Exception:
            pass
    for c in cands:
        try:
            q = parse_qs(urlparse(c).query)
            if q.get("ab"):
                return "ab=" + q["ab"][0]
        except Exception:
            pass
    try:
        return urlparse(page).path or page
    except Exception:
        return page

def fetch(start, end):
    client = BetaAnalyticsDataClient(credentials=creds)
    req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimensions=[Dimension(name="date"), Dimension(name="eventName"),
                    Dimension(name="customEvent:hs_scenario"), Dimension(name="customEvent:hs_page"),
                    Dimension(name="pagePathPlusQueryString")],
        metrics=[Metric(name="eventCount"), Metric(name="totalUsers")],
        dimension_filter=FilterExpression(filter=Filter(
            field_name="eventName",
            string_filter=Filter.StringFilter(
                match_type=Filter.StringFilter.MatchType.BEGINS_WITH, value="hs_chat_"))),
        limit=100000,
    )
    out = []
    for r in client.run_report(req).rows:
        d = r.dimension_values
        ymd = f"{d[0].value[0:4]}-{d[0].value[4:6]}-{d[0].value[6:8]}"
        event = d[1].value.replace("hs_chat_", "", 1)
        scenario = d[2].value or "(not set)"
        lp = normalize_lp(d[3].value or "", d[4].value or "")
        out.append([ymd, lp, scenario, event, int(r.metric_values[0].value), int(r.metric_values[1].value)])
    return out

def fetch_lp_views(start, end):
    """LP(/lp)へのページビューを日次×LP(u=)で取得し、event='lp_view' の行にする。
       離脱ポップアップの表示率(popup_show ÷ lp_view)の分母に使う。
       scenario列は '(lp)' 固定(チャットのイベントではないため)"""
    client = BetaAnalyticsDataClient(credentials=creds)
    req = RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimensions=[Dimension(name="date"), Dimension(name="pagePathPlusQueryString")],
        metrics=[Metric(name="screenPageViews"), Metric(name="totalUsers")],
        dimension_filter=FilterExpression(filter=Filter(
            field_name="pagePathPlusQueryString",
            string_filter=Filter.StringFilter(
                match_type=Filter.StringFilter.MatchType.BEGINS_WITH, value="/lp"))),
        limit=100000,
    )
    out = []
    for r in client.run_report(req).rows:
        d = r.dimension_values
        ymd = f"{d[0].value[0:4]}-{d[0].value[4:6]}-{d[0].value[6:8]}"
        lp = normalize_lp(d[1].value or "")
        out.append([ymd, lp, "(lp)", "lp_view", int(r.metric_values[0].value), int(r.metric_values[1].value)])
    return out

def main():
    # ⚠️GitHubランナーはUTC。date.today()だとJST朝5時の実行時に「昨日」が2日前になる
    # (GA4プロパティのタイムゾーンは日本なので日付はJST基準で切る)
    end = datetime.now(timezone(timedelta(hours=9))).date() - timedelta(days=1)
    start = end - timedelta(days=BACKFILL_DAYS - 1)
    targets = {(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)}
    new_rows = fetch(start.isoformat(), end.isoformat()) + fetch_lp_views(start.isoformat(), end.isoformat())
    print(f"GA4: {len(new_rows)} rows / {sorted(targets)}")

    gc = gspread.authorize(creds)
    ws = gc.open_by_key(SHEET_ID).worksheet("data")
    existing = ws.get_all_values()
    header, body = existing[0], existing[1:]
    kept = [row for row in body if row and row[0] not in targets]
    merged = kept + new_rows
    merged.sort(key=lambda r: (r[0], r[1], r[3]))
    ws.clear()
    ws.update([header] + merged, "A1")
    print(f"Sheet updated: {len(merged)} rows")

if __name__ == "__main__":
    main()
