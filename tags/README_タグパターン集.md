# タグパターン集(コピペ用チートシート)

タグの `window.HS_CHAT = { ... }` の中に、下のブロックを**組み合わせて**貼るだけ。
**LPのHTMLは一切触らない。すべてタグ内で完結**(大原則)。

完成形のタグは同じフォルダの `ecforce_tag_1980.html` 等を参照。

---

## 起動パターン(どれか1つ)

```js
/* A. 即起動+CTA再オープン(推奨・既定) — 開いてすぐ接客。閉じてもCTAで再開 */
autoOpen: 'immediate',
openTriggers: 'a[href="#lp-form"]',

/* B. CTA起動のみ — LPを読ませて、CTAボタンを押した人だけチャット */
autoOpen: 'manual',
openTriggers: 'a[href="#lp-form"]',

/* C. スクロール起動 — 30%読んだら起動(数字は自由) */
autoOpen: 'scroll30',
openTriggers: 'a[href="#lp-form"]',

/* D. 遅延起動 — 5秒後に起動 */
autoOpen: 'delay5000',
openTriggers: 'a[href="#lp-form"]',
```
※HugSkinのLPはCTAボタンが全部 `href="#lp-form"` のリンクなので、このセレクタで全CTAが起動ボタンになる

## バナー(フローティング)パターン(どれか1つ)

```js
/* A. 文字バナー(既定) */
launcher: true,
launcherText: '💬 かんたん注文はこちら',

/* B. 画像バナー — 画像URLを指定(最大幅220px、自動リサイズ) */
launcher: true,
launcherImage: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/banner.png',

/* C. バナーなし — ⚠️autoOpenかopenTriggersのどちらかは必ず残すこと(開く手段がなくなる) */
launcher: false,
```

## 冒頭画像パターン

```js
/* 1枚 */
opening: { image: 'https://…/fv.png', stockCheck: true },

/* 複数枚(上から順に表示) */
opening: {
  images: [
    'https://yhozumi-stack.github.io/hugskin-chatbot/img/chat_fv1_6980.png',
    'https://yhozumi-stack.github.io/hugskin-chatbot/img/chat_fv2_2980.jpeg',
  ],
  stockCheck: true,
},

/* 画像なし */
opening: { image: '', stockCheck: true },
```

### 画像の置き場所(気軽に差し替える手順)
1. 画像ファイルを `img/` フォルダに入れる(ファイル名は半角英数)
2. `git add -A && git commit -m "画像追加" && git push`(1〜2分で配信)
3. URLは `https://yhozumi-stack.github.io/hugskin-chatbot/img/ファイル名`
- ecforce側にアップロードした画像のURLでもOK(その場合pushも不要)
- **サムネイル(thumb_〜)ではなく元サイズ推奨**(チャット内で約330px幅に表示される)

## 確認画面の調整(任意。未指定なら既定)

```js
summaryOptions: {
  msg: '最終確認です✅',          /* 確認カードの前の一言(既定=なし) */
  submitLabel: '注文する →',      /* 確定ボタンの文言 */
  showOrderInfo: false,           /* 商品・金額ブロックを消す */
  showLaw: false,                 /* 特商法・定期条件の文を消す ⚠️確認画面スキップ運用では表示推奨 */
},
```

## 挨拶文を変える(LP個別・push不要)

```js
/* 改行は \n。{{PRODUCT}}(商品名自動)や{{PRICE}}も使える */
greeting: 'こんにちは！✨\nいまだけ{{PRICE}}でご案内中です🎁\n30秒でご注文完了します',
```
※挨拶以外の質問文・ボタン文言を変えたい時は chatbot.js の SCENARIOS を編集(CLAUDE.mdレシピ12、Sonnetで可)

## form-plus完全再現(v3.14.0〜)

```js
/* 文言・質問のまとめ方(名前+カナ/生年月日+性別/住所+電話/メール+PW)まで
   form-plusの実物と同一のシナリオ。完成形タグ= ecforce_tag_formplus_2980.html */
scenario: 'formplus',

/* 支払いボタンの表示文言を変える(キー=元の文言に含まれる語)。
   ⚠️変更後も「クレジット」「後払い」の語は残すこと(判定に使うため) */
paymentLabels: {
  'クレジット': 'クレジットカード【手数料0円】',
  '後払い': 'ベリトランス後払い（コンビニ後払い）',
},
```

## form-plus風の演出(v3.13.0〜、全部タグで完結)

```js
/* 確認画面をモーダル化(✕で閉じる/再オープン/行タップ修正対応) */
summaryOptions: { modal: true },

/* カウントダウンバー(毎日23:59:59まで・日次リセット) */
countdown: true,
countdown: { text: 'お急ぎください！本日受付終了まで' },   /* 文言を変える場合 */

/* 各質問の文言上書き(キー= name/contact/password/sex/birthdate/zip/addr/payment/card) */
texts: {
  name: 'まず、お名前を教えてください',
  payment: '最後にお支払い方法を選択してください！',
},

/* 質問の直前に画像(クレカ訴求など) */
stepImages: {
  payment: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/payment_promo.png',
},

/* 後払い選択後の規約文(既定でSCORE/DGFTの文面入り。空文字で非表示) */
codNotice: '',   /* ←消す場合。変える場合は文章をそのまま書く(改行は\n) */
```

## その他よく使うもの

```js
vars: { PRICE: '初回限定 1,980円（税込）' },  /* 挨拶の価格文言(消せば価格に触れない挨拶になる) */
opening: { stockCheck: false },               /* 「ご案内枠を確認中…」演出を消す */
scenario: 'member_ask',                       /* 冒頭で会員か聞くシナリオに切替 */
skip: { sex: '2' },                           /* 質問しない項目をダミー転記(CLAUDE.mdレシピ9) */
theme: { brand: '#C8869A' },                  /* テーマカラー */
autoSubmit: false,                            /* 確定時に注文ボタンを自動で押さない */
```
