# NP後払い切替 当日手順(Sonnet等にこのファイルを渡して実行させる用)

HugSkinの後払いを「NP後払いリアルタイムwiz」に切り替える日の作業手順。
**このファイルと CLAUDE.md(レシピ18)・tags/タグ設定リファレンス.md を読んでから作業すること。**
chatbot.js の編集・push は一切不要(v3.26.1で機能実装済み)。**全作業はecforceタグ管理のタグ編集のみ**。

## 前提(ecforce側の設定・人間が確認)

- [ ] NP後払いは「**リアルタイムwiz(同期与信)**」で設定されている(非同期だと与信NGリカバリーが動かない)
- [ ] 与信NGの時にecforceが注文を通さず**LPに弾き返す**設定になっている
- [ ] 支払い方法の表示名に「**後払い**」の語が含まれている(例:「かんたん後払い」)。クレカ側は「クレジット」を含むこと

## 手順1: 新しいNPの payment_method_id を調べる

切替後のLPをブラウザで開き、開発者ツールのConsoleで:
```js
[...document.querySelector('[name="order[payment_attributes][payment_method_id]"]').options]
  .map(o => o.value + ' = ' + o.text)
```
→ 出てきた「後払いのID」(例: `58 = かんたん後払い`)を控える。**以降 <NP_ID> と書く**。

## 手順2: skipで旧ID(102)を使っているタグの棚卸し

ecforceタグ管理で全LPのタグを確認し、`skip: { ... payment: '102' ... }` がある場合は
`payment: '<NP_ID>'` に書き換える(⚠️これを忘れるとそのLPの後払い注文が壊れる)。

## 手順3: 各LPのタグに追記する4点セット

対象LPのタグの `window.HS_CHAT = { ... }` 内に追記:

```js
/* --- NP切替セット(2026-07 v3.26.1〜) --- */
/* ①与信NGリカバリー(与信落ち→クレカ再注文に自動誘導) */
paymentFallback: {},

/* ②後払い選択直後のNPバナー(Befas/I-ne方式=バナーのみ) */
codNoticeImage: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/np_wiz_banner.png',
codNotice: '',

/* ②' hideFormを使っているLPは codNotice:'' ではなく規約文を入れる(表示場所がチャットしか無いため):
codNotice: '利用規約\n\n商品到着後、請求書で「後から」お支払いいただけます。請求書は商品に同封されます（ご注文者様とお届け先のご住所が異なる場合は、ご注文者様へお送りします）。\n商品代金のお支払いは「コンビニ」「郵便局」「銀行」「LINE Pay」でご利用いただけます。請求書の発行日から14日以内にお支払いください。お支払い期日を過ぎてもお支払いの確認ができない場合、手数料が加算される場合がございます。\n●後払い手数料：無料\n●ご利用限度額：累計残高55,000円（税込）迄\n本サービスには株式会社ネットプロテクションズの後払いサービスが適用され、同社へ代金債権を譲渡します。NP後払いwiz利用規約及び同社のプライバシーポリシーに同意の上、ご利用ください。\nご利用者が未成年の場合、法定代理人の利用同意を得てご利用ください。',
   ⚠️この文面は切替後にecforceがフォームに出すNPの実文言と突き合わせて微調整すること */
```

さらにタグのchatbot.js読込URLの `?v=` を **+1** する(即時反映のキャッシュ破り)。

## 手順4: テスト(1LPで全部確認してから他LPへ展開)

1. **通常注文**: チャット完走→後払いで注文が普通に通る(NPバナーが後払い選択直後に出る)
2. **与信NG**(NPのテスト用NG条件で): 弾き返し画面でチャットが**自動で**開き、
   「後払いがご利用いただけませんでした→クレカで」の案内→カード入力→クレカで注文が通る
   - パスワードの再質問が**出ない**こと(sessionStorage引き継ぎ)。1回だけ出るのは保険動作で正常。毎回出るなら報告
   - 実カードなら3DS認証画面に進むのが正常
3. GA4リアルタイム(またはシート)に `hs_chat_payment_ng_detected` / `hs_chat_payment_ng_retry` が出ている
4. 問題なければ他LPのタグにも同じ4点セットを展開(手順2のskip書き換えも忘れずに)

## ⚠️ やってはいけないこと

- chatbot.js / popup.js は原則編集・pushしない(タグだけで完結する)。**唯一の例外**は下のトラブルシュートに書いた「検知正規表現の追加」のみ
- 凍結対象(SCENARIOSのstandard/formplus・DEFAULTS・ENGINE)に触らない
- `?v=` の上げ忘れに注意(旧chatbot.jsのキャッシュが残ると新機能が動かない)
- テスト前に全LPへ一斉展開しない(必ず1LPで手順4を通してから)

## トラブルシュート(検知が効かない時の調査手順・下位モデルでも実行可)

### 症状A: 与信NGで弾き返されたのにチャットが自動で開かない

弾き返された画面のまま、開発者ツールのConsoleで以下を実行して結果を全部控える:
```js
({
  tag_paymentFallback: !!(window.HS_CHAT && window.HS_CHAT.paymentFallback),
  chatbot_version: (document.querySelector('script[src*="chatbot.js"]')||{}).src,
  payment_error_code: (document.querySelector('input[name="payment_error_code"]')||{}).value || '(要素なし/空)',
  alert可視: [...document.querySelectorAll('[class*="alert"]')].filter(e=>e.offsetParent).map(e=>e.innerText.trim().slice(0,100)),
  pm: (location.search.match(/[?&]pm=(\d+)/)||[])[1] || '(なし)',
  支払い選択肢: [...(document.querySelector('[name="order[payment_attributes][payment_method_id]"]')||{options:[]}).options].map(o=>o.value+'='+o.text.trim())
})
```
結果ごとの対処(上から順に見る):

| 結果 | 原因と対処 |
|---|---|
| `tag_paymentFallback: false` | タグに `paymentFallback: {}` が入っていない。または `?v=` 未更新で旧chatbot.jsが動いている(versionのURLの?v=を確認) |
| `pm` がクレカのID | **正常**(クレカ決済失敗には出さない仕様) |
| `支払い選択肢` に「クレジット」を含むoptionが無い | ecforce側のクレカ表示名に「クレジット」を含める(またはタグの`paymentLabels`はチャット表示専用なので不可。ecforce側で直す) |
| `payment_error_code` が「(要素なし/空)」**かつ** `alert可視` に「与信審査が通りません」を含む文言が無い | ecforceのエラー形式が実測(Befas 2026-07-17)と異なる。`alert可視`に出た**実際のエラー文言**を使って下の「検知条件の追加」を行う |

### 検知条件の追加(chatbot.jsで唯一触ってよい箇所)

`chatbot.js` の `function detectPaymentNGError()` 内、
`if (/与信審査が通りません/.test(els[i].innerText || '')) return true;`
の正規表現に、実画面の文言を **`|` で追加するだけ**(例: `/与信審査が通りません|後払いをご利用いただけません/`)。
それ以外の行・関数は一切触らない。修正後は必ずこの順で:
```bash
node --check chatbot.js                     # 構文チェック(エラーが出たら絶対にpushしない)
python3 -m http.server 8940                 # → preview/payment_ng_test.html の全テストモードを確認
git add -A && git commit -m "fix(与信NG検知): 実エラー文言を検知条件に追加" && git push
# → タグの ?v= を+1
```

### 症状B: リカバリーのカード入力後、104エラーで弾かれる
CLAUDE.md レシピ14の「3Dセキュア」項の事象。カード転記のイベント列の問題なのでコードは触らず、
症状と画面スクショを控えて報告(リカバリーは既存のカード転記関数を使っているため、通常注文でも同じ症状が出ているはず)。

### 症状C: パスワードの再質問が毎回出る(引き継ぎが効かない)
注文送信直後(遷移前)のConsoleで `sessionStorage.getItem('hs_pw_hold')` に値が入るか確認。
- 入らない → タグに `paymentFallback` が入っているか・?v=更新を確認(預かりはpaymentFallback有効LPのみ動く)
- 入るのに再質問される → 15分超過 or 別タブで開いている可能性。再現条件を控えて報告
- なお「1回だけ再質問が出る」のは引き継ぎ失敗時の正常な保険動作(注文は問題なく完了する)
