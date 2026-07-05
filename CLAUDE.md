# HugSkin 獲得チャットボット — 運用マニュアル

ecforce LP に埋め込む新規獲得用チャットボット。1ファイル(`chatbot.js`)完結・依存ゼロ・ビルド不要。
**このマニュアルはSonnet等の低モデルでの運用を前提に、コピペで済む手順(レシピ)として書いてある。**

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
タグの `autoOpen` を変更: `'immediate'`(LP表示と同時) / `'scroll30'`(30%スクロール、数字変更可) / `'delay3000'`(3秒後、ms指定) / `'manual'`(ランチャーボタンのみ)
LP内の任意のボタンから開く場合は、その要素に `data-hs-open` 属性を付けるだけ。

### レシピ6: 価格が違うLPを追加する(push不要)
1. `tags/ecforce_tag.html` をコピーして `vars.PRICE` 等をそのLP用に書き換え
2. ecforceタグ管理に新しいタグとして登録し、対象LPに適用
3. chatbot.js 本体は共通のまま。**シナリオごと変えたい場合だけ**レシピ2/3で別名シナリオを作り、タグの `scenario` で指定

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
- [ ] **ecforce実フォーム照合**: 本番 `https://hugskin.shop/shop/orders/new` の name 属性一覧を取得し、`transfer()` と `ecforce/orders_new_autofill.html` のフィールド名と照合(特に生年月日がselectか、後払いの `payment_kind` の値が `cod` か)
- [ ] orders/new テンプレートへの自動入力スクリプト設置(ecforce管理画面)
- [ ] 本番LPでのモバイル実機確認
