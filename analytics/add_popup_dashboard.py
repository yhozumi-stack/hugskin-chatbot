#!/usr/bin/env python3
"""ダッシュボードタブに「離脱防止」2ブロック(行21〜31)を追加する(1回だけ実行)。
   ①LPポップアップ: LP流入(lp_view)→表示→クリック→閉じ
     ※LP流入はシナリオを持たないため、このブロックは期間(B3/B4)とLP(E3)のみで絞る
   ②チャット閉じ確認: 起動→×押下(確認表示)→引き止め成功/離脱
   数式は本番ダッシュボード既存行と同じ TEXT() 文字列比較方式(DATEVALUEに変えないこと)"""
import gspread
from google.oauth2 import service_account

KEY = "/Users/hozumiyuuki/クロード用/Hugskin/hugskin-chatbot/analytics/service_account.json"
SHEET_ID = "1alEw24pSXbbjtwM5RBl8cCXu77ZLHTHJsTsEO70bEwM"

creds = service_account.Credentials.from_service_account_file(
    KEY, scopes=["https://www.googleapis.com/auth/spreadsheets"])
gc = gspread.authorize(creds)
db = gc.open_by_key(SHEET_ID).worksheet("ダッシュボード")

def users_formula(row, scenario_filter):
    """既存行と同じSUMPRODUCT(日付は文字列TEXT比較)。scenario_filter=Falseで E4 を無視"""
    scen = '*((($E$4="全シナリオ")+(data!$C$2:$C=$E$4))>0)' if scenario_filter else ""
    return ('=SUMPRODUCT((data!$A$2:$A>=TEXT($B$3,"YYYY-MM-DD"))'
            '*(data!$A$2:$A<=TEXT($B$4,"YYYY-MM-DD"))'
            '*((($E$3="全LP")+(data!$B$2:$B=$E$3))>0)'
            f'{scen}*(data!$D$2:$D=$B{row}),data!$F$2:$F)')

def rate(row, denom_row):
    return f'=IF(OR(C{row}=0,C{denom_row}=0),"",C{row}/C{denom_row})'

rows = [
    # 21: ブロック①ヘッダー
    ["離脱防止① LPポップアップ", "イベント", "ユーザー", "率", "率の分母", ""],
    # 22-25
    ["LP流入(全LPページ)※シナリオ無視", "lp_view",     users_formula(22, False), "", "", ""],
    ["ポップ表示",                     "popup_show",  users_formula(23, False), rate(23, 22), "LP流入比(表示率)", ""],
    ["ポップクリック",                 "popup_cta",   users_formula(24, False), rate(24, 23), "表示比(CTR)", ""],
    ["ポップ閉じ(×/見送る)",           "popup_close", users_formula(25, False), rate(25, 23), "表示比", ""],
    # 26: 空行
    ["", "", "", "", "", ""],
    # 27: ブロック②ヘッダー
    ["離脱防止② チャット閉じ確認", "イベント", "ユーザー", "率", "率の分母", ""],
    # 28-31
    ["チャット起動",                   "open",                users_formula(28, True), "", "", ""],
    ["×押下(閉じ確認の表示)",          "close_confirm_show",  users_formula(29, True), rate(29, 28), "起動比", ""],
    ["引き止め成功(チャットに戻る)",    "close_confirm_stay",  users_formula(30, True), rate(30, 29), "確認表示比", ""],
    ["閉じて離脱",                     "close_confirm_leave", users_formula(31, True), rate(31, 29), "確認表示比", ""],
]
db.update(rows, "A21:F31", raw=False)
header_fmt = {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.93, "green": 0.90, "blue": 0.92}}
db.format("A21:F21", header_fmt)
db.format("A27:F27", header_fmt)
db.format("D22:D31", {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}})
print("done: 行21-31を追加")
