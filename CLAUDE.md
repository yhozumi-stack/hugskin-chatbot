# HugSkin 獲得チャットボット — 運用マニュアル

ecforce LP に埋め込む新規獲得用チャットボット。1ファイル(`chatbot.js`)完結・依存ゼロ・ビルド不要。
**このマニュアルはSonnet等の低モデルでの運用を前提に、コピペで済む手順(レシピ)として書いてある。**

## 転記の仕組み(2モード自動切替)
- **モードA: LP内フォーム直接入力(既定・推奨)** — ecforceのLP一体型注文フォーム(`order[billing_address_attributes][name01]`がページ内にある)を検出したら、チャット完了時に**同ページのフォームへ直接入力**してスクロール誘導。**ecforce側へのスクリプト設置は不要**。支払い方法の選択肢もフォームから自動生成(LP毎のID差異に無設定で追従)
- **モードB: リダイレクト(フォールバック)** — フォームが無いページでは `ecforceOrderUrl` へURLパラメータ遷移。遷移先に `ecforce/orders_new_autofill.html` の設置が必要
- フィールド名は **2026-07-05 に hugskin.shop/lp?u=ug29_test の実フォームで照合済**(全12項目必須・住所1=市区町村/住所2=番地建物・prefecture_id=JISコード数値・birth=3分割select・payment_method_id=数値ID)
- **カード番号と後払い同意チェックはチャットは絶対に扱わない**(お客様がフォームで直接入力・同意する)
- **1問ずつ修正**(v3.4.0〜): 過去の回答バブル(✎付き)をタップするとその質問だけ再表示(現在値プリフィル)→修正後は元いた質問に直帰。確認画面の行タップでも同じ。郵便番号を直した時だけ住所確認を挟む(建物名等は保持)。エンジン組込機能なので設定不要
- **自動送信(autoSubmit)**(v3.4.0〜): チャット完了時にLPの注文ボタンを自動で押す(既定ON)。**標準運用はLP側「確認画面スキップ」設定**=チャットの確認画面が最終確認を兼ね、確定ボタンで注文完了。後払い(同意チェックあり)の時は自動送信せず「同意にチェックして注文ボタンを押してください」の案内になる
- **ご注文内容の自動表示**(v3.8.0で完全版): チャットの確認画面に、ecforce標準の注文内容テーブル(`qa-product_name/qa-product_price/qa-deliv_fee/qa-tax/qa-total`)から**商品・単価×個数・送料・合計を自動取得して表示**。さらに `qa-caution`(特商法・定期条件の注意喚起文)も確認画面に転記(確認画面スキップ運用での最終確認表示義務対応)。**商品・価格・オファーが変わってもタグ・シナリオの修正は一切不要**。タグの `vars.PRICE` は挨拶文の表現用のみ(任意)
- **⚠️キャッシュ注意**: chatbot.js更新後、LPタグの `?v=` を上げないとブラウザキャッシュで旧版が動き続けることがある(GitHub Pagesはmax-age=600)。**更新を反映させる時は必ずタグの `?v=` を+1する**
- **文言の変数ルール**(v3.5.0〜): `{{VAR}}` を含む行は、その変数が未設定なら**行ごと非表示**。「ただいま{{PRICE}}でご案内中です」はPRICE未設定なら丸ごと消えるので文言が壊れない
- **入力UXの決定事項**(v3.6.0〜、保積さん指定):
  - 確認画面は**口上なし**でいきなり最終確認カードを出す(summaryのmsgを空にしてある)
  - お名前ステップは**Enterで次に進まない**(`enterNext: false`。苗字のIME変換確定Enterでの誤送信防止。他ステップもIME確定Enterは無視される)
  - **フリガナの自動入力(autokana)は廃止**(漢字がそのまま入る・読みが不正確なため。手入力のみ)
  - 生年月日は**直入力とプルダウンの両対応**(`type:'birth'`)。初期表示年はシナリオの `defaultYear`(現在1992)
- **メール既登録の自動検知**(v3.4.0〜): 送信後にecforceが「既に登録されています」で弾いて戻ってきた画面を検知すると、チャットが自動で開いて「ログイン画面を開く/別のメールで入力する」を案内する(全シナリオ共通・設定不要)

## 構成

| ファイル | 役割 | 編集頻度 |
|---|---|---|
| `chatbot.js` | 本体。①DEFAULTS ②SCENARIOS ③ENGINE の3部構成 | ①②は編集OK / **③ENGINEは編集注意** |
| `popup.js` | **LP離脱ポップアップ**(チャットとは独立・別ファイル)。①DEFAULTS ②ENGINE | ①は編集OK / **②ENGINEは編集注意** |
| `tags/ecforce_tag.html` | ecforceタグ管理に貼るタグの正本 | LP追加時に参照 |
| `tags/ecforce_tag_popup.html` | 離脱ポップアップ用タグの正本 | ポップアップ設置時に参照 |
| `ecforce/orders_new_autofill.html` | orders/new テンプレートに設置する自動入力スクリプトの正本 | ほぼ不変 |
| `preview/index.html` | 偽LP(ローカル動作確認用) | 確認時に使う |
| `preview/orders_new_mock.html` | ecforce注文フォームのモック(転記テスト用) | ほぼ不変 |

## 大原則:どこを触るか

| やりたいこと | 触る場所 | デプロイ |
|---|---|---|
| **LP個別**の価格・オファー文言を変える | ecforce管理画面 > タグ管理 > そのLPのタグの `vars` | 不要(即時) |
| **LP個別**の起動タイミング(即時/スクロール/手動) | 同上 `autoOpen` | 不要(即時) |
| **LP個別**の冒頭画像・在庫演出GIF | 同上 `opening` | 不要(即時) |
| チャットの文言・質問の順番・項目 | `chatbot.js` の **②SCENARIOS** | push必要 |
| 新しい会話フローを別LPで試す | ②SCENARIOSに別名シナリオ追加 + タグの `scenario` で指定 | push必要 |
| 見た目の色 | タグの `theme` (LP個別) or ①DEFAULTS (全体既定) | 場合による |
| 進行ロジック・転記ロジック | **③ENGINE — 原則触らない**。触ったら全ステップをpreviewで確認 | push必要 |

**⚠️ 絶対ルール**
- `transfer()` 内の ecforce パラメータ名(`order[billing_address][name01]`等)は、実フォーム照合済みの値。**勝手に変えない**
- **pushした変更は、タグの `?v=` を上げなくても最大10分で全LPに反映される**(GitHub Pagesは `cache-control: max-age=600`。`?v=` はバージョン固定ではなく「今すぐ確実に反映させる」ためのキャッシュ破り。2026-07-07に実ヘッダで確認済み)。だから:
  - **pushする内容は常に「全LPで動いて問題ない」状態にしてからpushする**(preview確認必須)
  - 特定LPだけで試したい変更は、pushで出し分けるのではなく**別名シナリオ(レシピ13)+タグの `scenario` 指定**で出し分ける
  - `?v=` +1 は「反映を10分待たず即時にする」「確実にキャッシュを割る」ための操作

## 変更判断ガイド(仕様をいじる前に必ずこの順で考える)

「〜を変えたい/試したい」と言われたら、上から順に当てはめる:

1. **タグだけでできるか?** → 上の「大原則」表とレシピ集を見る(autoOpen/vars/texts/skip/closeConfirm/HS_POPUP等はぜんぶタグ)。
   できるなら**タグ編集のみ・push不要・そのLPだけに効く**。これが最優先
2. **chatbot.js / popup.js の編集が必要な場合、その変更は「全LPに同時に出て困らないか?」を必ず自問する**
   (pushすると最大10分で全LPに反映される。バージョン固定はできない)
   - **困らない**(全LP共通のバグ修正・文言統一など) → 直接編集 → レシピ7/P5でpreview確認 → push
   - **困る**(特定LPだけで試したい・CVRテスト・攻めた変更) → 本体の動作を変えるのではなく、次のどちらかで「タグでON/OFFできる形」にする:
     - 質問の流れ・文言の実験 → **別名シナリオを追加**(レシピ13)してタグの `scenario:` で指定
     - 新機能の実験 → **既定OFFのオプションとして実装**しタグで有効化(closeConfirm・hideForm・countdownが前例。この形なら pushしても既存LPは1ミリも変わらない)
3. **③ENGINE(進行・転記・閉じ確認等のロジック)に触るか?** → 原則触らない。触る場合はpreviewで全ステップ+チェックリスト全項目を確認。転記(`transfer()`)とecforceパラメータ名は実フォーム照合済みなので特に注意
4. push前の最終問答: 「**このpushが10分後に全本番LPで動いても事故らないか?**」に即答できなければpushしない

**📝 翻訳例(雑な依頼を正しい手段に変換してから手を動かすこと)**
例:「名前・電話・住所だけ聞いて確認画面にしたい。質問文は〇〇に変えて。支払いは質問せず"後払いで承ります"とテキストで案内して固定」
→ シナリオ改造ではない。**タグだけで実現できる(push不要)**:
```js
texts: { name: '新しい質問文', contact: '新しい質問文', zip: '新しい質問文' },  // 文言(レシピ12)
skip:  { birthdate: '1990/01/01', sex: '2', password: 'auto', email: 'auto',
         payment: '102' },   // 質問を消す(レシピ9)。paymentの値=そのLPの支払いselectのpayment_method_id(後払いは現行102)
summaryOptions: { msg: 'お支払いは【後払い】で承ります✨\nご注文内容をご確認ください' },
         // ↑「〜で承ります」系の案内テキストは確認画面の口上(summaryOptions.msg)に入れるのが定位置
```
- paymentをskipするとカード入力ステップも自動で出ない(後払い扱い)。整合は勝手に取れる
- ※skipでemail/telをダミーにする時の注意(確認メール不達・後払い与信・カゴ落ち)は**レシピ9の⚠️を必ず読んで、依頼者に一言確認**する(後払いは特に「注文確認メールが届かない」が効く)
- ※依頼が曖昧な時(「後払いデフォルト」=質問ごと消す?選択済みで残す?)は勝手に決めず確認する

**🧊 凍結ルール(広告配信中の大原則・保積さん指定 2026-07-08)**
広告が走っているLPに影響させないため、以下は**凍結扱い=書き換え禁止**:
- 本番シナリオ **formplus / standard** の中身(文言含む)
- **DEFAULTSの既定値**(既定ONの設定を変える・既定OFFをONにする 等)
- **ENGINE** のロジック
実験・変更はすべて「**別名シナリオを新規追加**(レシピ13)」か「**既定OFFの新機能**(closeConfirmが前例)」で作り、
**各LPのタグでON**にする。この形ならpushしてもタグ未設定のLPは1ミリも変わらない。
凍結対象を触ってよいのは「全LPに効かせたい修正(転記バグ・ecforce仕様変更への追従等)」だけで、
その場合も preview のチェックリスト全項目確認が必須。

## レシピ集

### レシピ1: チャットの文言を変える
1. `chatbot.js` の `SCENARIOS.standard` 内の該当 `msg` / `intro` を書き換える
2. `{{PRICE}}` `{{PRODUCT}}` `{{OFFER}}` はタグ側 `vars` の値に置換される変数。文言に埋め込んでよい
3. レシピ7で動作確認 → push → 反映したいLPのタグの `?v=` を+1

### レシピ2: 質問ステップを追加する
1. `SCENARIOS.standard` の配列に以下の形で挿入(順番=配列順):
```js
{ type: 'fields', key: 'newkey', intro: 'ボットの質問文', layout: 'stack',
  fields: [
    { key: 'newkey', label: '入力欄ラベル', placeholder: '例：〜', validate: 'required' },
  ] },
```
2. 確認画面に出すなら `LABELS` に `newkey: '表示名'` を追加
3. **ecforceに渡すなら** `transfer()` に `p.set('...', answers.newkey)` を追加(パラメータ名は実フォーム照合必須)
4. レシピ7で動作確認

### レシピ3: 選択肢(ボタン)ステップを追加する
```js
{ type: 'choice', key: 'newchoice', intro: '質問文',
  choices: [
    { label: 'ボタンA', value: 'a' },
    { label: 'ボタンB', value: 'b' },
  ] },
```

### レシピ4: 冒頭に画像を入れる / 在庫演出を変える(LP個別・push不要)
ecforceタグ管理でそのLPのタグを編集:
```js
opening: {
  image: 'https://…/opening.png',   // 冒頭画像。空文字なら非表示
  stockCheck: true,                  // 「ご案内枠を確認中…」演出のON/OFF
  stockGifUrl: 'https://…/stock.gif' // 演出をGIF画像にする場合
},
```

### レシピ5: 起動タイミングを変える(LP個別・push不要)
タグの `autoOpen` を変更: `'immediate'`(LP表示と同時) / `'scroll30'`(30%スクロール、数字変更可) / `'delay3000'`(3秒後、ms指定) / `'manual'`(自動起動なし)

**⚠️大原則: LPのHTMLは一切触らない。すべてタグ内で完結させる(保積さん指定)**

LP内の既存CTAボタンで起動させたい場合はタグに1行(LP編集不要):
```js
openTriggers: 'a[href="#lp-form"]',   // HugSkinのLPはCTAが全部このアンカー
```
→ CTA起動版のタグ完成形は `tags/ecforce_tag_1980_cta.html` / `_2980_cta.html` にある

### レシピ5b: フローティングバナー(ランチャー)のカスタム(LP個別・push不要)
タグで指定:
```js
launcher: false,                        // バナー自体を消す
launcherText: '🎁 初回1,980円で試す',    // 文言変更
theme: { brand: '#C8869A' },            // 色変更(チャット全体の色と連動)
```
※バナーを消す場合は autoOpen か openTriggers のどちらかで開けるようにしておくこと
(両方ないとチャットを開く手段がなくなる)

### レシピ6: 価格が違うLPを追加する(push不要)
1. `tags/ecforce_tag.html` をコピーして `vars.PRICE` 等をそのLP用に書き換え
2. ecforceタグ管理に新しいタグとして登録し、対象LPに適用
3. chatbot.js 本体は共通のまま。**シナリオごと変えたい場合だけ**レシピ2/3で別名シナリオを作り、タグの `scenario` で指定

### レシピ10: 途中に画像を入れる(複数枚OK)
`SCENARIOS.standard` の配列の好きな位置に挿入(複数枚は複数行):
```js
{ type: 'image', src: 'https://…/campaign1.png' },
{ type: 'image', src: 'https://…/campaign2.png' },
```

### レシピ11: 質問をまとめる/バラす
`fields` 配列の組み替えだけ。例: メール+電話+パスワードを1カードにする:
```js
{ type: 'fields', key: 'account', intro: 'ご連絡先を教えてください', layout: 'stack',
  fields: [
    { key: 'email', label: 'メールアドレス', inputType: 'email', inputmode: 'email', autocomplete: 'email', validate: 'email' },
    { key: 'tel', label: '電話番号', inputType: 'tel', inputmode: 'numeric', autocomplete: 'tel', validate: 'tel', norm: 'tel' },
    { key: 'password', label: 'パスワード', inputType: 'password', autocomplete: 'new-password', validate: 'password', displayAs: '••••••••' },
  ] },
```
バラす時は fields を1個ずつ別ステップに分けるだけ。**key名は変えないこと**(転記が key 名で動くため)。

### レシピ12: 質問の文言を変える
各ステップの `intro`(質問文)・`label`(入力欄名)・`placeholder`(例)・`msg` は全部自由に書き換えてOK。
`{{PRICE}}` などの変数も文中で使える。

### レシピ13: シナリオABテスト
1. `SCENARIOS.standard` を丸ごとコピーして `SCENARIOS.b = [ ... ]` として追加、文言や順番を変える
2. push 後、Bパターンにしたい LP のタグで `scenario: 'b'` を指定
3. Clarity では `hs_scenario` カスタムタグでA/B別にセッションを絞り込める(自動送信済み)
4. LP自体のABは ecforce/Squad beyond 側の既存AB機能でLPを分け、それぞれに別タグを貼る

### レシピ13b: 文言"全変え"版シナリオを安全に作る(ABテスト用・Sonnet向け完全手順)
「入力欄ラベル・選択肢・途中の発話まで全部変えたB版」を、既存LPに一切影響させずに作る手順。
**この手順の順番どおりにやれば事故らない。飛ばすと事故る**:

1. `chatbot.js` の `SCENARIOS` 内で `formplus:` の配列を丸ごとコピーし、その直下に `formplus_b:` として貼り付ける(**コピー元の formplus は1文字も触らない**)
2. `formplus_b` 側の文言を書き換える。**変えていいのは文言だけ**:
   - ✅ 変えてよい: `intro` / `msg` / `label` / `placeholder` / `note` / choicesの `label`
   - 🚫 絶対に変えない: `key` / `type` / choicesの `value` / `validate` / `norm` / fieldsの構造(増減・分割)
     (転記は `key` 名と `value` で動いている。変えるとB版LPだけ注文が壊れる)
3. **一括置換(全置換)は使わない**(コピー元の formplus まで書き換わる定番事故。B側を1箇所ずつ編集する)
4. **構文チェック(push前に必須)**:
```bash
node --check "/Users/hozumiyuuki/クロード用/Hugskin/hugskin-chatbot/chatbot.js" && echo OK
```
   エラーが出たら**絶対にpushしない**(構文エラーのpushは10分以内に全LPのチャットを止める)
5. previewで**B版を全ステップ**確認: レシピ7のサーバーを起動して
   `http://localhost:8940/preview/?scenario=formplus_b` → 最後まで入力してモックフォームに緑枠が全部入ること
6. previewで**既存版が無傷**なことも確認: `http://localhost:8940/preview/?scenario=formplus` を1周
7. push → **B版LPのタグだけ** `scenario: 'formplus_b'` を指定し `?v=` を+1(A版LPのタグは触らない)
8. ABの割り付けはecforce/Squad beyondのAB機能でLPを分ける。計測は `hs_scenario` で自動分離、
   シナリオ別ダッシュボードはレシピC(タブをコピーしてE4にシナリオ名を固定)

### レシピ14: カード入力ステップ(v3.3.0〜)
- 支払いで「クレジット」を含む選択肢を選んだ時だけ自動表示(後払いなら自動スキップ)
- 番号/有効期限(LPフォームの年selectから自動生成)/名義(自動大文字化)
- **確認画面ではマスク表示・リダイレクトモードでは絶対に送信しない**(LP内フォームへの直接転記のみ)
- カードを聞きたくない場合はシナリオから `{ type: 'card', ... }` の行を消すだけ(従来どおりお客様がフォームで入力)
- **セキュリティコード(CVV)は自動追従(v3.20.0〜)**: 既定 `cardCvv: 'auto'` = **LPのフォームにCVV欄(`#input-cc-cvv` / `input[name="cvv"]`)があれば聞き、LP側で欄を削除すれば自動で聞かなくなる**(タグ・シナリオの修正不要)。タグで強制指定も可:
```js
cardCvv: true,    // 常に聞く / false = 常に聞かない / 'auto' = LPに欄があれば聞く(既定)
```
- CVVも番号と同じ扱い: 確認画面に表示しない・計測(track)に載せない・リダイレクトURLに絶対に含めない。転記先はLPのCVV欄のみ(決済JSがトークン化するのでecforceに生値は飛ばない)

### レシピ15: 会員(登録済みメール)への対応(v3.4.0〜 2段構え)
- **既定(standard)**: 冒頭では何も聞かない(立ち上がり期は質問を増やさない方針)。送信後にecforceが「メール既登録」で弾いて戻ってきたら、チャットが**自動検知**してログイン案内を出す
- **冒頭で会員か聞きたいLP**: タグで `scenario: 'member_ask'` を指定するだけ(「ご利用は初めてですか？」ステップ入りのシナリオを同梱済み)
- ログイン画面URLは `loginUrl` で変更可

### レシピ17: チャットの×押下時に「閉じますか？」確認を出す(closeConfirm・LP個別・push不要・v3.23.0〜)
チャット内の離脱防止。×を押すと「閉じる/チャットに戻る」の確認ダイアログを挟む。
白部分(タイトル+ボタン2つ)は固定レイアウト、下のクリエイティブ画像だけ可変(空なら白部分のみ)。
タグに追加するだけ(**既定OFFなので、書いたLPだけで有効=CVRのABテストがLP単位でできる**):
```js
closeConfirm: {
  image: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/anshin.png',  // 空 or 省略で白部分だけ
  /* title: '初回限定チャットを閉じますか？', stayText: 'チャットに戻る', leaveText: '閉じる', */
},
```
- 最小は `closeConfirm: {}` だけでON(文言は既定)。文言には `{{PRICE}}` 等の変数も使える
- 注文送信後の×では出ない(自動判定)。プログラム経由の close でも出ない
- 計測: `hs_chat_close_confirm_show / _stay / _leave` が自動で飛ぶ(シートにも自動で入る)。引き止め成功率 = stay ÷ show
- **⚠️ popup.js の `'chatclose'` トリガーと併用しない**(×→確認→閉じる→さらにポップアップ、の二重引き止めになる)
- 動作確認: `preview/popup_test.html?closeconfirm`(画像あり) / `?closeconfirm&noimg`(白部分だけ)

### レシピ7: 動作確認(変更したら必ずやる)
```bash
cd /Users/hozumiyuuki/クロード用/Hugskin/hugskin-chatbot
python3 -m http.server 8940
# → http://localhost:8940/preview/ を開く
```
チェックリスト:
- [ ] チャットが自動で立ち上がる
- [ ] 全ステップを最後まで入力できる(名前→連絡先→PW→生年月日→郵便番号→住所→支払い)
- [ ] 郵便番号入力で住所が自動補完される
- [ ] 確認画面 → 「注文フォームへ進む」→ モックフォームに**全項目が緑枠で入る**(緑枠=自動入力成功)
- [ ] 生年月日・パスワード・支払い方法もモックに入っている(v2で漏れていた項目)

### レシピ8: デプロイ(GitHub Pages)
```bash
cd /Users/hozumiyuuki/クロード用/Hugskin/hugskin-chatbot
git add -A && git commit -m "変更内容" && git push
# 反映は1〜2分。その後、反映させたいLPのタグの ?v= を上げる
```

### レシピ9: 質問項目を減らす(聞かずにダミー値で転記=skip機能・LP個別・push不要)
ecforce側で必須の項目でも、チャットでは聞かずにダミー値を送ってCVを通せる。
タグの `window.HS_CHAT` に `skip` を追加するだけ(シナリオ編集・push不要):
```js
skip: {
  password:  'auto',          // ランダム生成
  birthdate: '1990/01/01',    // 固定値
  tel:       '09000000000',   // 固定値
  email:     'auto',          // 毎回ユニークなダミーアドレス
  payment:   'credit_card',   // 選択肢ステップも消せる(値を直接指定)
},
```
- skip に入れた項目は**質問ステップから自動で消える**(ステップ内の全項目が消えたらステップごと消える)
- `'auto'` = password はランダム、email は毎回ユニークなダミー
- `'{RAND}'` トークン = ユニーク文字列に置換。例 `'guest+{RAND}@hugskin.jp'`
- 質問に戻したくなったら skip からその行を消すだけ
- 動作確認は `preview/skip_test.html` (skip設定済みの偽LP)で

**⚠️ skip の注意点(重要)**
- **email を固定ダミーにしてはいけない**(ecforceが同一顧客として束ね、2件目以降の注文が事故る)。必ず `'auto'` か `'{RAND}'` 入りにする
- email をダミーにすると**注文確認メールが顧客に届かない**。フォローはLINE/SMS等の別導線が前提
- tel をダミーにすると**後払い(NP等)の与信審査に影響**し得る。後払いLPでは tel は聞くこと
- password をダミーにするとマイページに入れない(定期解約導線がマイページの場合はCS負荷を確認)

### レシピ16: LPの注文フォームを隠す(hideForm・v3.21.0〜・LP個別・push不要)
skipのダミー値をお客様に見せたくない時に使う。タグに1行足すだけ(LPのHTMLは触らない):
```js
hideForm: true,
```
チャットが起動時にLPの注文フォームを非表示にし、**必要な場面では自動で再表示する**:
- **後払いで、LPに同意チェックが実際に表示される場合のみ** → フォームを出して「同意にチェック→注文ボタン」を案内(同意と注文確定は本人操作の決まり)。**同意欄が無い後払い(現行HugSkin LPはこれ。同意checkboxはAmazon Pay区画にしか存在しない)は隠したまま自動送信で完了**(v3.21.1で判定を修正済み)
- **autoSubmit無効・転記エラーの時** → 「下のフォームから直接」案内と同時に出す
- **チャットを×で閉じた時** → チャットを使わない人の注文導線を確保
- **ecforceがエラーで弾き返した画面** → 最初から隠さない(エラーが見えないと直せないため)
- クレカ+自動送信(標準運用)のお客様は、フォームを一度も見ずに注文完了する
- 動作確認は `preview/hideform_test.html`

## LP離脱ポップアップ(popup.js・2026-07-07新設)

LPから離脱しかけた人を引き止めるポップアップ。**chatbot.jsとは完全に別ファイル**なので、
ポップアップをいくら変更してもチャット・CVは壊れない(逆も同じ)。チャットが無いLP
(Teaflex等の他ブランドLP含む)でも単体で動く。

- **出すタイミング**: `'back'`(ブラウザバック/スマホの戻る) / `'delayNNNNN'`(N ms経過) / `'chatclose'`(チャットを×で閉じた瞬間) / `'visibility'`(別タブ・別アプリから戻ってきた瞬間)。複数指定可・どれかで1回だけ表示
- **見た目は2モード**(タグの `image` の有無で自動切替):
  - **画像モード(推奨)**: `image` に画像URL(GIF可)を設定 → 「画像+その上に重ねたCTAボタン」。**画像自体は押せない**(ボタンと×だけ反応)。コピーは画像に焼き込む前提。ボタン位置・幅は `ctaBottom`/`ctaWidth` で微調整。ada-cloud式(ボタンごと焼き込んだ1枚GIFで画像全体をクリックさせる)にしたい時だけ `imageClickable: true`
  - **テキストモード**: `image` が空 → バッジ+タイトル+本文+CTAボタン(画像素材が無いLPでもすぐ出せる)
- **CTAの飛び先**: `'chat'`(チャット起動=`window.HSChat.open()`。チャット無しLPでは自動でフォームスクロールに切替) / `'form'`(注文フォームへスクロール) / `'close'`(閉じるだけ=「LPに戻る」ボタン) / URL文字列(遷移)
- **出さない条件(自動判定・設定不要)**: チャットを開いている間 / チャットで注文送信済み / フォーム入力中(フォーカス中) / 表示済み(既定はタブを閉じるまで1回)
- **チャット側の状態は dataLayer のイベント履歴から読む**(chatbot.jsのコードには一切依存しない疎結合)

### 仕組み(backトリガー)
最初のユーザー操作(タップ/スクロール/キー)で履歴に番兵を1つ積む → 「戻る」で番兵が消えた瞬間に表示。
**番兵は1つだけ=2回目の「戻る」は素直に離脱させる**(無限に引き止めるとGoogleペナルティ・UX悪化のため。この設計は変えない)。

### レシピP1: LPにポップアップを付ける(タグを貼るだけ・push不要)
1. 3パターンから選んでコピー(全部 `tags/` 内):
   - `popup_tag_A_画像全体クリック版.html` … ボタン焼き込み1枚GIF用(ada-cloud式)
   - `popup_tag_B_画像+重ねボタン版.html` … ボタン無し画像+重ねCTA(理想形)
   - `popup_tag_C_画像なしテキスト版.html` … 画像が無くても出せる白カード
   (全オプションの解説付き正本は `ecforce_tag_popup.html`)
2. ecforce管理画面 > タグ管理 > 対象LPのタグに追記(チャットのタグがある場合は**その下**。bodyの最後でもOK)
3. 文言・価格・タイミングをタグ内の `window.HS_POPUP` で調整
- チャット併設LPでは `vars` を書かなくても `window.HS_CHAT.vars` の `{{PRICE}}` 等を自動引き継ぎ
- チャット無しLPでは `vars: { PRICE: '…' }` を書き、`ctaAction` を `'form'` かURLにする

### レシピP2: 文言・画像・色を変える(タグのみ・push不要)
タグの `window.HS_POPUP` を編集するだけ。全項目と意味は `popup.js` の①DEFAULTSのコメント参照。
- **画像モード**: `image:` 画像URL(GIF可) / `ctaBottom: '7%'` ボタンの画像下端からの位置 / `ctaWidth: '78%'` ボタン幅 / `imageClickable: true` で画像全体クリック化
- **テキストモード**: `badge:` タイトル上の小ラベル / `title:` / `lines:` 本文(1要素=1行)
- 共通: `ctaText:` / `ctaAction:` / `closeText:`
- `{{PRICE}}` 等の変数を含む行は、変数未設定なら**行ごと自動非表示**(chatbotと同じルール)
- 色は `theme: { brand: '#C8869A' }`
- 画像素材はこのリポジトリの `img/` に入れてpushすれば `https://yhozumi-stack.github.io/hugskin-chatbot/img/ファイル名` で配信される

### レシピP3: 出すタイミングを変える(タグのみ・push不要)
```js
triggers: ['back', 'delay60000'],   // ブラウザバック+60秒(既定)
triggers: ['back'],                 // ブラウザバックのみ
triggers: ['delay30000'],           // 30秒経過のみ
triggers: ['back', 'chatclose'],    // バック+チャットを×で閉じた瞬間
triggers: ['back', 'visibility'],   // バック+別タブから戻ってきた瞬間
```
時間経過は、発火時にチャット操作中・フォーム入力中なら10秒おきに再判定して手が空いたら出す。

### レシピP4: 表示頻度
`oncePer: 'session'`(既定=タブを閉じるまで1回。LPの `u=` パラメータ単位で記録) / `'load'`(ページ表示ごと) / `'always'`(毎回=テスト用)

### レシピP5: 動作確認(popup.jsを変更したら必ずやる)
```bash
cd /Users/hozumiyuuki/クロード用/Hugskin/hugskin-chatbot
python3 -m http.server 8940
# → http://localhost:8940/preview/popup_test.html を開く(手順①〜⑥がページ上部に書いてある)
# URLパラメータでテストモード切替: ?img(画像モード) / ?img&clickable(ada式・画像全体クリック)
#                                   / ?backonly(バックのみ) / ?chatclose(チャット閉じで出す)
```
チェックリスト: ①5秒で出る ②タップ/スクロール後の「戻る」で出る ③その後もう一度「戻る」で普通に離脱する ④CTAでチャットが起動する ⑤チャットを開いている間は出ない ⑥フォーム入力中は出ない ⑦`?img` で画像+重ねボタンになり、画像を押しても何も起きずボタンだけ反応する

### 計測(設定変更ゼロで既存パイプラインに乗る)
イベント名を `hs_chat_popup_show` / `hs_chat_popup_cta` / `hs_chat_popup_close` にしてあるため、
既存のGTMトリガー(`hs_chat_.*`)・GA4・毎朝5時のシート集計(`hs_chat_` 前方一致)に**そのまま乗る**。
- シートのdataタブには event=`popup_show` / `popup_cta` / `popup_close` の行として自動で入る
- どのトリガーで出たかは GA4イベントパラメータ `hs_popup_trigger`(back/delay/chatclose/visibility)で分かる
- ダッシュボードで見たい場合はB列に `popup_show` 等の行を足すだけ(既存行の数式をコピー)
- **⚠️イベント名を `hs_popup_*` に変えてはいけない**(前方一致から外れて計測が全部消える)

### デプロイ(chatbot.jsと同じ方式)
`popup.js` を変更したら push → 反映したいLPのタグの `popup.js?v=` を+1(タグだけの変更ならpush不要・即時)。
配信URL: `https://yhozumi-stack.github.io/hugskin-chatbot/popup.js`(UptimeRobotの監視対象に追加するのが望ましい)

### ⚠️ 既知の限界(仕様として許容)
- **無操作で直帰する人にはbackトリガーは出ない**: Chromeは「ユーザー操作なしに積まれた履歴」を戻るボタンでスキップする仕様(back intervention)のため、番兵は初回操作後に積んでいる。LPを1秒も見ずに戻る人は引き止められない
- **iOSのスワイプバック**: BFCacheでページごと戻るため、ポップアップが間に合わない(出ない)ことがある。時間経過トリガーとの併用で補完する
- 履歴に番兵を積む都合上、ページ内アンカー(#lp-form)遷移と混在しても誤発火しないよう state で判定済み(`{hs_popup:1}` が残っている間は発火しない)

## カゴ落ちタグ(nogasazu)との連携(v3.22.0〜)
- **iframeタグは不要**(form-plus時代の遺物。あれはチャットがiframe内にあったから必要だった。今のチャットはページ内直描画なので入れる場所自体が無い)
- **LPタグ・CVタグは従来どおり設置でOK**(nogasazu側の設定変更も不要)
- チャットの入力欄はShadow DOM内でLP側の計測タグから**見えない**。その代わりエンジンが**メール・電話の確定と同時にLPフォームの実フィールドへ即転記**する(earlyLeadCapture)ので、nogasazuのLPタグ(`order[billing_address_attributes][tel01]`等のセレクタ)がその瞬間に捕捉する=**チャット途中離脱もカゴ落ち捕捉できる**(form-plusのiframeタグ相当の挙動)
- hideForm(レシピ16)と併用可(非表示フィールドでも値と input イベントは発火するため捕捉される)
- ⚠️skip機能でemail/telをダミーにしているLPでは、カゴ落ちメール/SMSがダミー宛てに飛ぶ(=届かない)。カゴ落ち施策を効かせたいLPではemail/telは聞くこと

## 計測(Clarity / GTM)
エンジンが自動で以下のイベントを発火する(Clarityカスタムイベント + dataLayer):
`hs_chat_open`(立ち上がり) / `hs_chat_step_名前`(各ステップ完了) / `hs_chat_summary_view`(確認画面) / `hs_chat_submit`(転記) / `hs_chat_close`
→ ボットの立ち上がり率・ステップ離脱はClarityでこのイベントをフィルタして見る。

## 離脱分析ダッシュボード(2026-07-06稼働開始)

データの流れ: **チャット(dataLayer) → GTM(GTM-TRRF8FDN) → GA4 → GitHub Actions(毎朝5時JST) → スプレッドシート**

### 見る場所(URL)
| 何を見る | URL | アカウント |
|---|---|---|
| ファネル表(数字の本命・毎朝5時更新) | https://docs.google.com/spreadsheets/d/1alEw24pSXbbjtwM5RBl8cCXu77ZLHTHJsTsEO70bEwM | y.hozumi1992@gmail.com |
| GA4リアルタイム(過去30分の動き) | https://analytics.google.com/analytics/web/?authuser=1#/a392481201p534388892/realtime/overview | admin@hugskin.shop |
| 離脱セッションの録画 | https://clarity.microsoft.com/projects → HugSkinプロジェクト → `hs_chat_*` イベントでフィルタ | — |

- シートの「ダッシュボード」タブ: B3/B4=期間、E3=LP(u=)、E4=シナリオ をセルで切り替えるだけ
- 「data」タブ: 生データ(date/lp/scenario/event/count/users)。**手で編集しない**(毎朝、直近3日分が洗い替えされる)

### 離脱防止ブロック(ダッシュボード行21〜31・2026-07-08新設)
- **①LPポップアップ(行21-25)**: LP流入(lp_view)→ポップ表示(表示率)→クリック(CTR)→閉じ
  - `lp_view` = GA4の `/lp` ページビュー(pull_ga4.pyが自動取得、scenario列は `(lp)` 固定)
  - **このブロックはE4(シナリオ)を無視**して期間+LP(E3)だけで絞る(lp_viewがシナリオを持たないため)
  - ※同一LPでもURLパラメータ違いで複数行になるためusersは若干の重複あり(傾向把握用の近似)
- **②チャット閉じ確認(行27-31)**: 起動→×押下(=close_confirm_show)→引き止め成功(stay÷show)→離脱
- 作成スクリプト: `analytics/add_popup_dashboard.py`(再実行すると行21-31を上書き再生成)
- トリガー別(back/delay等)に割りたい時はGA4カスタムディメンション `hs_popup_trigger` の登録が必要(未登録)

### 各種ID(問い合わせ時にそのまま使う)
- スプレッドシートID: `1alEw24pSXbbjtwM5RBl8cCXu77ZLHTHJsTsEO70bEwM`
- GA4: プロパティID `534388892` / アカウント `392481201` / 測定ID `G-E8KW5RMQV3`
- GTM: `GTM-TRRF8FDN`(タグ「GA4 - hs_chat チャットボット計測」+正規表現トリガー `hs_chat_.*`)
- GA4カスタムディメンション(イベントスコープ): `hs_event` / `hs_page` / `hs_scenario`
- SA(GA4閲覧者+シート編集者): `ecforce-switcher@hugskin-sheets.iam.gserviceaccount.com`(鍵はGitHub secret `GA4_SA_KEY`。ローカル正本=`Hugskin受注切り替え自動化/ecforce-subscription-switcher/service_account.json`、`analytics/service_account.json` にコピーあり・**gitignore済につきコミット禁止**)

### レシピA: 今すぐ手動でシートを更新する
```bash
cd /Users/hozumiyuuki/クロード用/Hugskin/hugskin-chatbot
gh workflow run analytics.yml            # 直近3日分を洗い替え
gh workflow run analytics.yml -f backfill_days=14   # 14日さかのぼって取り直す
```

### レシピB: トラブルシュート(シートが0のまま等)
1. `gh run list --workflow=analytics.yml --limit 3` で直近実行の成否を見る
2. ログに `403` / `PERMISSION_DENIED` → GA4のプロパティアクセス管理からSAが消えていないか確認(閲覧者で登録)
3. 実行成功なのに0行 → 対象期間にLPトラフィックが無いだけの可能性。GA4リアルタイムでスマホからLPを開いて `hs_chat_open` が出るか確認(**PCの自動操作ブラウザはGoogleにボット判定され503で弾かれるので実機で**)
4. データ蓄積は2026-07-06(GTM公開日)以降のみ。それ以前の日付は永遠に0で正常

### レシピC: シナリオ専用ダッシュボードを増やす(タブをコピーするだけ)
シナリオによって存在しないステップがある場合は、シナリオ別のタブを作ると見やすい:
1. 「ダッシュボード」タブを右クリック → **コピーを作成** → 名前を「ダッシュボード_standard」等に変更
2. コピー先の **E4にシナリオ名を固定**(例: `standard`)。E3でLPも固定してよい
3. そのシナリオに無いステップの行は **削除せず「行を非表示」**(右クリック→行を非表示)
   - 通過率は「直前の非ゼロステップとの比」なので0の行が挟まっても計算は正しい=消す必要がない
   - 行を**削除**するとカード/確認画面の分母参照(C16固定)がズレるので削除はしない
4. 毎朝の自動更新が書き換えるのは data タブだけなので、ダッシュボードのコピーは何枚あっても安全

### ⚠️ ダッシュボードの数式を壊さないための決まり(重要)
- dataタブの日付は**文字列**(RAW書込)。数式側は `TEXT($B$3,"YYYY-MM-DD")` の**テキスト比較**で照合している。「日付型に直そう」としてどちらか片方だけ変えると**全集計が0になる**(2026-07-06に実際に踏んだバグ)
- 通過率は「直前の非ゼロステップ」比: `LOOKUP(2,ARRAYFORMULA(1/(範囲>0)),範囲)`。**LOOKUP内の配列演算はARRAYFORMULA必須**
- ファネルの行順は本番シナリオ **formplus の質問順**(open→first_time→name→birth→sex→password→zip→addr→contact→payment→card→summary_view→submit)。first_time/sex/passwordはシナリオによって0のままで正常
- カード情報(17行目)と確認画面(18行目)の通過率の分母は**C16(支払い方法)に固定**(カードはクレカ選択者しか通らないため)。行を挿入・並べ替えするとこの参照がズレるので注意
- 質問ステップを増減したら: chatbot.js のイベントは `step_<ステップのkey名>` で飛ぶ→ダッシュボードのB列にその名前の行を足す(数式はC7:E19の既存行をコピー)

## 外形監視(UptimeRobot・2026-07-06稼働開始)

二重の監視体制。チャットが止まってもLPフォームは無傷でCVは止まらない設計なので、監視の目的は「早く気づいて機会損失を最小にする」こと。

| 監視 | 間隔 | 通知先 | 実体 |
|---|---|---|---|
| UptimeRobot(外部) | 5分 | メール + Slack #hugskin_chatbot_alert | chatbot.js配信URL と hugskin.shop の2モニター |
| healthcheck.yml(GitHub内) | 6時間 | GitHubからオーナーへメール | GitHub自体の障害時はこちらも止まる点に注意 |

- UptimeRobotアカウント: y.hozumi@triber.co.jp(**無料プラン**。ダッシュボード= https://dashboard.uptimerobot.com/monitors )
- **⚠️無料プランの制約**: Slack/Webhook連携・通知先メールの追加(Team members)は全部有料限定。そのため**Slack通知はGmail転送フィルタで実現**している:
  - 経路: UptimeRobot → y.hozumi@triber.co.jp のGmail → フィルタ(From: `uptimerobot.com`)→ Slackチャンネル専用アドレスへ自動転送 → #hugskin_chatbot_alert
  - Gmail側の設定場所: 設定 > メール転送とPOP/IMAP(転送先登録)+ フィルタとブロック中のアドレス(From条件の転送フィルタ)
  - **この転送フィルタを消すとSlack通知が止まる**(メール通知は残る)
- 公開ステータスページは意図的にOFF(社内監視用途のため。必要になれば Status pages メニューから作成可)
- 通知テスト: モニター詳細画面の「Test Notification」ボタン(Slack着弾まで確認済み 2026-07-06)
- モニターURLは全LP共通のchatbot.js 1本で足りる(LP追加時に監視の追加は不要)

## デプロイ情報
- リポジトリ: https://github.com/yhozumi-stack/hugskin-chatbot (public)
- 配信URL: `https://yhozumi-stack.github.io/hugskin-chatbot/chatbot.js`(push後1〜2分で反映)

## 残タスク(2026-07-06時点)
- [x] GitHub リポジトリ作成 + Pages 有効化 + `tags/ecforce_tag.html` のURL確定(2026-07-05完了)
- [x] 実フォーム照合(2026-07-05完了、lp?u=ug29_test にて。直接入力モードに刷新し `/shop/orders/new` リダイレクトは廃止=あのURLは404)
- [x] ecforceタグ管理へのタグ登録 + テストLP適用 + 後払いテスト注文成功(2026-07-06完了)
- [x] 離脱分析ダッシュボード構築(2026-07-06完了。GTM→GA4→シート日次更新。上の「離脱分析ダッシュボード」章を参照)
- [x] 本番LPへのタグ展開 + 実機確認(2026-07-06完了、**本番CV確認済み**)
- [x] UptimeRobot設定(2026-07-06完了。chatbot.js/hugskin.shopを5分間隔監視。無料プランはSlack直結不可のためGmail転送フィルタ経由で#hugskin_chatbot_alertへ通知。下記「外形監視」章を参照)
- [ ] ダッシュボードの実データでの表示確認(2026-07-07朝以降、シートを開くだけ)
- [ ] **離脱ポップアップ(popup.js)の本番投入**(2026-07-07ローカル検証済み・未デプロイ): ①push ②タグ登録(レシピP1) ③iOS実機でスワイプバック/戻る挙動を確認 ④UptimeRobotにpopup.js配信URLのモニター追加 ⑤ダッシュボードにpopup_show/popup_cta行を追加
- [ ] 本番form-plusの金額設定確認(確認モーダルの静的金額1,980円 vs ecforce実計算2,980円のズレを2026-07-06に発見済み)
- [ ] (モードB利用時のみ) 遷移先テンプレートへの自動入力スクリプト設置
