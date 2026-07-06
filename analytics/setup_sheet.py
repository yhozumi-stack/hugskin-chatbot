#!/usr/bin/env python3
"""共有済みのスプレッドシートにダッシュボード構造を流し込む(初回のみ)。"""
import gspread
from google.oauth2 import service_account

KEY = "/Users/hozumiyuuki/クロード用/Hugskin/hugskin-chatbot/analytics/service_account.json"
SHEET_ID = "1alEw24pSXbbjtwM5RBl8cCXu77ZLHTHJsTsEO70bEwM"

creds = service_account.Credentials.from_service_account_file(
    KEY, scopes=["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"])
gc = gspread.authorize(creds)
sh = gc.open_by_key(SHEET_ID)
try:
    sh.update_title("HugSkinチャットボット離脱分析ダッシュボード")
except Exception as e:
    print("title rename skip:", str(e)[:80])

data = sh.sheet1
data.update_title("data")
data.update([["date", "lp", "scenario", "event", "count", "users"]], "A1:F1")
data.format("A1:F1", {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.93, "green": 0.90, "blue": 0.92}})

db = sh.add_worksheet(title="ダッシュボード", rows=60, cols=12)
STEPS = [
    ("open", "チャット起動"),
    ("step_first_time", "会員確認(任意)"),
    ("step_name", "名前・フリガナ"),
    ("step_contact", "連絡先/メール"),
    ("step_password", "パスワード"),
    ("step_sex", "性別"),
    ("step_birth", "生年月日(+性別)"),
    ("step_zip", "郵便番号"),
    ("step_addr", "住所(+電話)"),
    ("step_payment", "支払い方法"),
    ("step_card", "カード情報"),
    ("summary_view", "確認画面表示"),
    ("submit", "注文確定"),
]
rows = [
    ["HugSkin チャットボット離脱分析", "", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["開始日", "=TODAY()-13", "", "LP(u=)", "全LP", "", ""],
    ["終了日", "=TODAY()", "", "シナリオ", "全シナリオ", "", ""],
    ["", "", "", "", "", "", ""],
    ["ステップ", "イベント", "到達ユーザー", "通過率", "離脱率", "ファネル", ""],
]
start = 7
for i, (ev, label) in enumerate(STEPS):
    r = start + i
    users = (f'=SUMPRODUCT((data!$A$2:$A>=DATEVALUE($B$3))*(data!$A$2:$A<=DATEVALUE($B$4))'
             f'*((($E$3="全LP")+(data!$B$2:$B=$E$3))>0)*((($E$4="全シナリオ")+(data!$C$2:$C=$E$4))>0)'
             f'*(data!$D$2:$D=$B{r}),data!$F$2:$F)')
    prev = f'=IF(OR(C{r}=0,C{r-1}=0),"",C{r}/C{r-1})' if i > 0 else '=IF(C7=0,"",1)'
    drop = f'=IF(D{r}="","",1-D{r})'
    bar = f'=IF(C{r}=0,"",SPARKLINE(C{r},{{"charttype","bar";"max",MAX($C$7:$C$19);"color1","#c8869a"}}))'
    rows.append([label, ev, users, prev, drop, bar, ""])
db.update(rows, "A1:G19", raw=False)
db.format("A1", {"textFormat": {"bold": True, "fontSize": 14}})
db.format("A6:F6", {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.93, "green": 0.90, "blue": 0.92}})
db.format("D7:E19", {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}})

helper = sh.add_worksheet(title="_filters", rows=100, cols=4)
helper.update([["LP候補", "シナリオ候補"],
               ['=SORT(UNIQUE({"全LP";FILTER(data!B2:B,data!B2:B<>"")}))',
                '=SORT(UNIQUE({"全シナリオ";FILTER(data!C2:C,data!C2:C<>"")}))']], "A1:B2", raw=False)
print("done:", sh.url)
