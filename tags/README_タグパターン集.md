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

## その他よく使うもの

```js
vars: { PRICE: '初回限定 1,980円（税込）' },  /* 挨拶の価格文言(消せば価格に触れない挨拶になる) */
opening: { stockCheck: false },               /* 「ご案内枠を確認中…」演出を消す */
scenario: 'member_ask',                       /* 冒頭で会員か聞くシナリオに切替 */
skip: { sex: '2' },                           /* 質問しない項目をダミー転記(CLAUDE.mdレシピ9) */
theme: { brand: '#C8869A' },                  /* テーマカラー */
autoSubmit: false,                            /* 確定時に注文ボタンを自動で押さない */
```
