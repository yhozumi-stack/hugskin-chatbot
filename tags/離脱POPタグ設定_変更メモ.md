# 離脱POPタグ設定 変更メモ

このメモは、LP離脱ポップアップをecforceタグ管理で調整するときの早見表です。

基本は `tags/ecforce_tag_popup.html` をコピーして、チャットボットタグの下に追加します。
チャットボットがないLPでも、`popup.js` 単体で動きます。

---

## 1. いちばん大事な考え方

```html
<script>
window.HS_POPUP = {
  /* ここがLPごとの設定 */
};
</script>
<script src="https://yhozumi-stack.github.io/hugskin-chatbot/popup.js?v=2" defer></script>
```

- `window.HS_POPUP` の中身を変えるだけなら、GitHubへのpushは不要です。
- `popup.js` 本体を変えた時は、GitHubへpushして、タグ側の `?v=` を上げます。
- 現在の正本は `popup.js?v=2` です。

---

## 2. どのタグを使うか

| パターン | ファイル | 向いているケース |
|---|---|---|
| A. 画像全体クリック | `popup_tag_A_画像全体クリック版.html` | ボタン込みのGIF/画像を1枚で作る場合 |
| B. 画像+重ねボタン | `popup_tag_B_画像+重ねボタン版.html` | ボタン無し画像の上に、システム側CTAを重ねる場合 |
| C. 画像なしテキスト | `popup_tag_C_画像なしテキスト版.html` | 画像素材なしで白カードPOPを出す場合 |
| 正本 | `ecforce_tag_popup.html` | 全項目の説明を見たい場合 |

おすすめはBです。画像の下部にCTAボタン用の余白を作っておくと調整しやすいです。

---

## 3. 出すタイミングを変える

```js
triggers: ['back', 'delay60000'],
```

| 設定 | 意味 |
|---|---|
| `'back'` | ブラウザバック、スマホの戻る操作で表示 |
| `'delay60000'` | 60秒後に表示。数字はミリ秒 |
| `'delay30000'` | 30秒後に表示 |
| `'chatclose'` | チャットを×で閉じた瞬間に表示 |
| `'visibility'` | 別タブや別アプリから戻ってきた時に表示 |

例:

```js
triggers: ['back'],                 /* 戻る操作だけ */
triggers: ['delay30000'],           /* 30秒後だけ */
triggers: ['back', 'delay60000'],   /* 戻る操作 + 60秒後 */
```

注意:

```js
triggers: ['back', 'chatclose'],
```

`chatclose` は、チャット側の `closeConfirm` と同時に使わないでください。
×を押した時の引き止めが二重になります。

---

## 4. 画像を変える

```js
image: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/popup.png',
```

- GIFもPNGも使えます。
- 画像URLが間違っていて読めない場合は、テキストモードへ自動で切り替わります。
- その時は `hs_chat_error` が計測に飛びます。

画像を使わない場合:

```js
/* imageを書かない */
```

または

```js
image: '',
```

この場合、`badge` / `title` / `lines` の白カード表示になります。

---

## 5. 画像全体をクリックできるようにする

```js
imageClickable: true,
```

- Aパターン用です。
- 画像全体がCTAになります。
- ボタン文字も画像に焼き込む前提です。

Bパターンでは書かない:

```js
/* imageClickable は書かない */
```

Bパターンでは画像自体は押せず、重ねたCTAボタンだけ反応します。

---

## 6. 重ねボタンの位置を変える

```js
ctaBottom: '7%',
ctaWidth: '78%',
```

| 設定 | 意味 |
|---|---|
| `ctaBottom` | ボタンを画像の下端からどれくらい上に置くか |
| `ctaWidth` | ボタンの横幅 |

テストURL:

```text
http://localhost:8940/preview/popup_test.html?imgurl=画像URL&ctabottom=7&ctawidth=78
```

数字を変えながら見た目を確認します。

---

## 7. CTA文言と飛び先を変える

```js
ctaText: '{{PRICE}}で試してみる',
ctaAction: 'chat',
```

| 設定 | 意味 |
|---|---|
| `'chat'` | チャットを開く。チャットがないLPではフォームへスクロール |
| `'form'` | LP内フォームへスクロール |
| `'close'` | POPを閉じるだけ |
| `'https://...'` | 指定URLへ遷移 |

例:

```js
ctaAction: 'chat',
ctaAction: 'form',
ctaAction: 'https://hugskin.shop/lp?...',
```

---

## 8. 下の「今回は見送る」を変える

```js
closeText: '今回は見送る',
```

消す場合:

```js
closeText: '',
```

右上の×は常に出ます。

---

## 9. 表示頻度を変える

```js
oncePer: 'session',
```

| 設定 | 意味 |
|---|---|
| `'session'` | タブを閉じるまで1回。本番向き |
| `'load'` | ページ表示ごとに1回 |
| `'always'` | 毎回表示。テスト用 |

本番では基本:

```js
oncePer: 'session',
```

テストでは:

```js
oncePer: 'always',
triggers: ['delay5000'],
```

---

## 10. 価格や変数を使う

チャット併設LPでは、チャットタグの `window.HS_CHAT.vars` から自動で引き継ぎます。

```js
vars: {
  PRICE: '2,980円（税込）',
},
```

チャットがないLPでは、POPタグ側に書きます。

```js
vars: {
  PRICE: '初回2,980円（税込）',
},
```

文言で使う:

```js
ctaText: '{{PRICE}}で試してみる',
lines: [
  'ただいま初回限定 {{PRICE}} でご案内しています。',
],
```

変数が未設定の行は、自動で行ごと非表示になります。

---

## 11. 色を変える

```js
theme: {
  brand: '#C8869A',
},
```

CTAボタンやバッジの色が変わります。

---

## 12. POPを一時停止する

```js
enabled: false,
```

タグを残したまま停止したい時に使います。

---

## 13. 出ない条件

次の状態では自動で出ません。

- チャットを開いている間
- チャットで注文送信済み
- LPフォーム入力中
- すでに表示済み

`back` トリガーは、最初のタップ・スクロール・キー入力後に有効になります。
ページを一切触らずすぐ戻る人には出ないことがあります。これはブラウザ仕様への対応です。

---

## 14. 計測イベント

POP側で飛ぶイベント:

| イベント | 意味 |
|---|---|
| `hs_chat_popup_show` | POP表示 |
| `hs_chat_popup_cta` | CTAクリック |
| `hs_chat_popup_close` | ×または見送るで閉じた |
| `hs_chat_error` | 画像URL読み込み失敗など |

GA4やシートでは、`hs_chat_` を除いた名前で見えます。

| シート上のevent | 意味 |
|---|---|
| `popup_show` | POP表示 |
| `popup_cta` | CTAクリック |
| `popup_close` | POP閉じ |

イベント名を `hs_popup_*` に変えないでください。
既存GTMの `hs_chat_.*` 条件から外れて、計測に乗らなくなります。

---

## 15. チャット内の閉じ確認との違い

LP離脱POP:

```js
window.HS_POPUP = {
  triggers: ['back', 'delay60000'],
};
```

- LPから離脱しそうな時に出す。
- `popup.js` が担当。
- チャットがなくても動く。

チャット内の閉じ確認:

```js
window.HS_CHAT = {
  closeConfirm: {
    image: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/anshin.png',
  },
};
```

- チャットの×を押した時に出す。
- `chatbot.js` が担当。
- チャットタグ内に書く。

同じLPで両方を使う場合でも、POP側の `triggers` に `'chatclose'` は入れないでください。

---

## 16. 本番前チェック

- `popup.js?v=2` になっているか
- 画像URLが本番用になっているか
- Bパターンの場合、画像下部にボタン用の余白があるか
- `triggers` が本番用になっているか
- `oncePer: 'session'` になっているか
- CTA先が `chat` / `form` / URL のどれか意図通りか
- `closeConfirm` と `chatclose` を二重にしていないか
- iPhone実機で戻る操作を確認したか
- GA4リアルタイムまたはClarityで `hs_chat_popup_*` が見えるか

