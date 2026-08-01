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

import ga4_merge

PROPERTY_ID = os.environ["GA4_PROPERTY_ID"]
SHEET_ID = os.environ["SHEET_ID"]
KEY_PATH = os.environ.get("SA_KEY_PATH", os.path.join(os.path.dirname(__file__), "service_account.json"))
# フラグを先に抜いてから位置引数を読む。
# ⛔ int() のまま残すこと: CLAUDE.md レシピの Slack疎通テスト
#    `gh workflow run analytics.yml -f backfill_days=TEST` は、ここで
#    ValueError を出してworkflowをわざと失敗させる手順になっている。
_ARGS = [a for a in sys.argv[1:] if not a.startswith("-")]
DRY_RUN = "--dry-run" in sys.argv[1:]
BACKFILL_DAYS = int(_ARGS[0]) if _ARGS else 3

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
    header, body = (existing[0], existing[1:]) if existing else ([], [])
    merged, kept, replaced = ga4_merge.merge(body, new_rows, targets)

    before = ga4_merge.summarize(kept + replaced)
    expected = ga4_merge.summarize(merged)
    print(f"  既存: {before['rows']}行 / {before['min']}〜{before['max']}"
          f"  → 書込予定: {expected['rows']}行 / {expected['min']}〜{expected['max']}"
          f"  (窓外保持 {len(kept)}行 / 洗い替え {len(replaced)}→{len(new_rows)}行)")

    errs, warns = ga4_merge.check_before_write(header, body, new_rows, merged, kept, replaced, targets)
    for w in warns:
        print(f"::warning::⚠️ {w}")
    if errs:
        for e in errs:
            print(f"::error::🚨 GUARD(書込前): {e}")
        print("::error::🚨 data タブへの書き込みを中止しました(データ保護のため)。"
              "原因を直してから gh workflow run analytics.yml -f backfill_days=7 で取り直してください")
        sys.exit(1)

    if DRY_RUN:
        print(f"[DRY-RUN] 書き込みは行いません（{expected['rows']}行を書く予定でした）")
        return

    # 旧データの取り残しを空行で潰しつつ **update 1回** で書く（ws.clear() を使わない理由は
    # ga4_merge.build_payload の docstring 参照）。value_input_option は既定=RAW のまま:
    # ⛔ dataタブの日付は「文字列」で入っている前提でダッシュボードの数式が
    #    TEXT($B$3,"YYYY-MM-DD") とテキスト比較している。USER_ENTERED にすると
    #    日付型に変換されて全集計が0になる(2026-07-06に踏んだバグ)。
    payload = ga4_merge.build_payload(header, merged, len(existing))
    if ws.row_count < len(payload):
        ws.add_rows(len(payload) - ws.row_count + 200)
    ws.update(payload, "A1")

    # HTTP 200 は「書けた」を意味しない。読み直して突き合わせる。
    actual_rows = [ga4_merge.normalize_row(r) for r in ws.get_all_values()[1:]
                   if r and any(str(c).strip() for c in r)]
    actual = ga4_merge.summarize(actual_rows)
    verify_errs = ga4_merge.check_after_write(expected, actual)
    if verify_errs:
        for e in verify_errs:
            print(f"::error::🚨 GUARD(書込後の読み戻し): {e}")
        sys.exit(1)
    print(f"Sheet updated: {actual['rows']} rows / {actual['min']}〜{actual['max']} (読み戻し検証OK)")

if __name__ == "__main__":
    main()
