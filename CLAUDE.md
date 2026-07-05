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
| `tags/ecforce_tag.html` | ecforceタグ管理に貼るタグの正本 | LP追加時に参照 |
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
- push しても `?v=` を上げていないLPには反映されない(バージョン固定方式)。**全LP一括反映したい時だけ全タグの `?v=` を揃えて上げる**

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

### レシピ14: カード入力ステップ(v3.3.0〜)
- 支払いで「クレジット」を含む選択肢を選んだ時だけ自動表示(後払いなら自動スキップ)
- 番号/有効期限(LPフォームの年selectから自動生成)/名義(自動大文字化)
- **確認画面ではマスク表示・リダイレクトモードでは絶対に送信しない**(LP内フォームへの直接転記のみ)
- カードを聞きたくない場合はシナリオから `{ type: 'card', ... }` の行を消すだけ(従来どおりお客様がフォームで入力)

### レシピ15: 会員(登録済みメール)への対応(v3.4.0〜 2段構え)
- **既定(standard)**: 冒頭では何も聞かない(立ち上がり期は質問を増やさない方針)。送信後にecforceが「メール既登録」で弾いて戻ってきたら、チャットが**自動検知**してログイン案内を出す
- **冒頭で会員か聞きたいLP**: タグで `scenario: 'member_ask'` を指定するだけ(「ご利用は初めてですか？」ステップ入りのシナリオを同梱済み)
- ログイン画面URLは `loginUrl` で変更可

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

## 計測(Clarity / GTM)
エンジンが自動で以下のイベントを発火する(Clarityカスタムイベント + dataLayer):
`hs_chat_open`(立ち上がり) / `hs_chat_step_名前`(各ステップ完了) / `hs_chat_summary_view`(確認画面) / `hs_chat_submit`(転記) / `hs_chat_close`
→ ボットの立ち上がり率・ステップ離脱はClarityでこのイベントをフィルタして見る。

## デプロイ情報
- リポジトリ: https://github.com/yhozumi-stack/hugskin-chatbot (public)
- 配信URL: `https://yhozumi-stack.github.io/hugskin-chatbot/chatbot.js`(push後1〜2分で反映)

## 残タスク(2026-07-05時点)
- [x] GitHub リポジトリ作成 + Pages 有効化 + `tags/ecforce_tag.html` のURL確定(2026-07-05完了)
- [x] 実フォーム照合(2026-07-05完了、lp?u=ug29_test にて。直接入力モードに刷新し `/shop/orders/new` リダイレクトは廃止=あのURLは404)
- [ ] ecforceタグ管理へのタグ登録 + テストLPへの適用(保積さん操作)
- [ ] タグ適用後のテストLPで通し確認(チャット→フォーム反映→confirm画面まで。**最終の注文確定は押さない**)
- [ ] 本番LPでのモバイル実機確認
- [ ] (モードB利用時のみ) 遷移先テンプレートへの自動入力スクリプト設置
