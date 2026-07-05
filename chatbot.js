/*! ============================================================
    HugSkin 獲得チャットボット v3.17.0
    ------------------------------------------------------------
    1ファイル完結・依存ゼロ。LP側は ecforce タグ管理で
    tags/ecforce_tag.html の内容を貼るだけで動く。

    ▼ このファイルの構成（編集していい場所の地図）
      ① DEFAULTS  … 既定設定。タグ側 window.HS_CHAT で上書き可 → 編集OK
      ② SCENARIOS … 会話シナリオ（文言・順番・項目）→ 編集OK
      ③ ENGINE    … 描画・進行・ecforce転記の本体 → ⚠️ 編集注意
                     （変更したら必ず preview/ で全ステップ確認すること）

    ▼ LPごとに違うもの（価格・オファー・起動方法・画像）は
      このファイルではなく「ecforceタグ管理のタグ側」で設定する。
      → 詳細は CLAUDE.md のレシピ参照
    ============================================================ */
(function () {
'use strict';

/* ============================================================
   ① DEFAULTS — 既定設定（タグ側 window.HS_CHAT で上書き）
   ============================================================ */
var DEFAULTS = {
  scenario: 'standard',            // 使うシナリオ名（SCENARIOS のキー）
  vars: {                          // シナリオ文言に {{KEY}} で差し込まれる変数
    PRODUCT: '',                   // 空ならLPの商品名ブロックから自動取得（連番 _0012 等は自動除去）
    PRICE:   '',                   // 価格はLPのHTMLに存在しないため自動取得不可。表示したい時だけタグで指定
    OFFER:   '',
  },
  /* 挨拶文の上書き(LP個別・push不要)。空ならシナリオの既定文。
     改行は \n。{{PRODUCT}}{{PRICE}}等の変数も使える
     例: greeting: 'こんにちは！✨\nいまだけ{{PRICE}}です🎁' */
  greeting: '',
  /* 各質問の文言をタグから上書き(キー=ステップkey)。
     例: texts: { name: 'お名前をどうぞ！', payment: '最後にお支払い方法を選択してください！' } */
  texts: {},
  /* 質問の直前に画像を出す(キー=ステップkey、値=画像URL)。
     例: stepImages: { payment: 'https://…/payment_promo.png' } */
  stepImages: {},
  /* 後払いを選んだ直後に表示する規約・注意文(空なら非表示)。タグで上書き可 */
  codNotice: '利用規約\n\n払込票は商品とは別に株式会社SCOREより郵送されます。発行から14日以内にコンビニでお支払いください。 代金債権とそれに付帯する個人情報は、包括的な決済サービスを提供する株式会社DGフィナンシャルテクノロジーに譲渡・提供されたうえで、さらに同社から後払い決済サービスを提供する株式会社SCOREに対し、再譲渡・提供されますので、当該第三者への譲渡・提供に同意の上、お申込みください。与信審査の結果により他のお支払い方法をご利用いただく場合もございます。 詳しくは、お支払い方法ページに記載されている【ベリトランス後払い（コンビニ後払い）】で必ず確認してください。 ご利用者が未成年の場合は、法定代理人の利用同意を得てご利用ください。\n個人情報の提供に関する問合せ先：support@hugskin.shop\n●後払い手数料：無料\n●利用限度額：55,000円（税込）',
  /* カウントダウンバー(緊急性演出)。true か {text:'…'} で有効。
     毎日23:59:59までの残り時間を表示(日付が変わるとリセット) */
  countdown: null,
  /* 確認画面のタグ調整(すべて任意。未指定なら現状の既定動作)
     例: summaryOptions: { submitLabel: '注文する →', showLaw: false, showOrderInfo: true, msg: '最終確認です' }
     同意チェックボックス関連:
       agree: true(既定=表示・チェック済) / 'unchecked'(表示・未チェックで開始) / false(非表示)
       agreeText: 同意文言の変更
       agreeLink: 「利用規約」のリンク先URL(''でリンクなし) */
  summaryOptions: {},
  agreeText: '利用規約に同意して申し込みます。\n未成年者については法定代理人の同意を得ていることを確認します。',
  agreeLink: 'https://hugskin.shop/info/customer_term',
  /* 入力欄の下に出す注意書き(キー=項目key)。シナリオ側のnoteより優先 */
  fieldNotes: {},
  /* 文言ルール: {{VAR}} を含む行は、その変数が未設定なら行ごと非表示になる。
     例: 「ただいま{{PRICE}}でご案内中です」は PRICE 未設定なら丸ごと消える */
  skip: {},                        // 質問せず転記だけする項目（LPごとにタグで設定）
                                   //   例 { tel:'09000000000', password:'auto', birthdate:'1990/01/01' }
                                   //   'auto'=自動生成(password/email) '{RAND}'=ユニーク文字列に置換
                                   //   → 詳細は CLAUDE.md レシピ9
  mode: 'float',                   // 'float'=フローティング / 'inline'=LP内に埋め込み
  inlineSelector: '#hs-chat',      // inline のとき描画する要素
  autoOpen: 'immediate',           // 'immediate' / 'scroll30'(30%スクロールで) / 'delay3000'(3秒後) / 'manual'
  opening: {
    image: '',                     // 冒頭に出す画像URL（空なら出さない）
    images: null,                  // 冒頭画像を複数枚出す場合の配列 例: ['url1','url2'] (上から順に表示)
    stockCheck: true,              // 「ご案内枠を確認中…」演出のON/OFF
    stockGifUrl: '',               // 演出をGIF画像にしたい場合のURL（空ならスピナー）
    stockTextChecking: '🔍 ご案内枠を確認しています…',
    stockTextDone: '✅ ご案内枠を確保しました！\nこのままお手続きにお進みください',
  },
  theme: {
    brand: '#C8869A', brandDark: '#a86880', brandLight: '#f9f1f4',
  },
  title: 'お申し込みサポート',
  subtitle: 'かんたん注文チャット（約1分）',
  /* オペレーター(アバター)画像。ヘッダーと吹き出し横に表示。''にすると💬絵文字 */
  avatar: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/operator.png',
  launcher: true,                  // false = 右下のフローティングバナー(ランチャー)を出さない
  launcherText: '💬 かんたん注文はこちら',   // バナーの文言(自由に変更可)
  launcherImage: '',               // バナーを画像にする場合のURL(指定すると文字の代わりに画像バナーになる)
  /* LP内の既存ボタンをチャット起動ボタンにするCSSセレクタ(LPのHTML編集不要)。
     例: openTriggers: 'a[href="#order"], .cta_btn'
     → そのボタンのクリックでチャットが開く(元のリンク動作はキャンセルされる) */
  openTriggers: '',
  typingMs: 120,                   // ボット発話前の「間」。0で完全即時
  /* 転記モード:
     'auto'     = LP内にecforce注文フォームがあれば直接入力(推奨・スクリプト設置不要)、
                  なければ ecforceOrderUrl へリダイレクト
     'redirect' = 常にリダイレクト(カート型ページ用) */
  transferMode: 'auto',
  /* チャット完了時にLPの注文ボタンを自動で押して確認画面まで進むか。
     ⚠️ LPが「確認画面を表示しない」設定の場合は即注文確定になるため false にすること。
     後払い(同意チェックが必要)の時は auto でも自動送信せず、チェックをお願いする案内になる */
  autoSubmit: true,
  ecforceOrderUrl: 'https://hugskin.shop/shop/orders/new',
  loginUrl: 'https://hugskin.shop/shop/customers/sign_in',  // 会員向けログイン画面
  paymentChoices: null,            // 支払い選択肢の手動指定(通常はLPフォームから自動生成されるので不要)
  /* 支払いボタンの表示文言をタグから変更(キー=元の文言に含まれる語、値=表示したい文言)。
     例: paymentLabels: { 'クレジット': 'クレジットカード【手数料0円】' }
     ⚠️変更後の文言にも「クレジット」「後払い」の語は残すこと(カード入力・規約表示の判定に使うため) */
  paymentLabels: {},
  zipApi: 'https://zipcloud.ibsnet.co.jp/api/search?zipcode=',
};

function deepMerge(base, over) {
  var out = {};
  var k;
  for (k in base) out[k] = base[k];
  for (k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) &&
        base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}
var CFG = deepMerge(DEFAULTS, window.HS_CHAT || {});

/* {{KEY}} を CFG.vars で置換。
   未設定(空)の変数を含む行は「行ごと」非表示にする — これにより
   価格未設定のLPでも文言が壊れない(「ただいまでご案内中」みたいにならない) */
function tpl(s) {
  return String(s).split('\n').filter(function (line) {
    var ok = true;
    line.replace(/\{\{(\w+)\}\}/g, function (_, k) {
      if (!(CFG.vars && CFG.vars[k])) ok = false;
      return '';
    });
    return ok;
  }).map(function (line) {
    return line.replace(/\{\{(\w+)\}\}/g, function (_, k) { return CFG.vars[k]; });
  }).join('\n');
}

/* ============================================================
   ② SCENARIOS — 会話シナリオ（ここを編集して文言・流れを変える）
   ------------------------------------------------------------
   step の type 一覧:
     stock        … 「枠確認中→確保」演出（opening.stockCheck=true時のみ）
     openingImage … 冒頭画像（opening.image 設定時のみ）
     image        … 画像を1枚表示 { type:'image', src:'https://…' }
                    好きな場所に何個でも挟める（複数枚は複数行書く）
     msg          … ボットの発話だけ
     fields       … 入力カード（fields配列に何項目でも。layout:'2col'で横並び）
                    → 質問の「まとめ/バラし」はこの fields 配列の組み替えだけでできる
     zip          … 郵便番号（入力後に住所を自動補完して次の住所カードへ渡す）
     birth        … 生年月日（直入力+年月日プルダウン併用。defaultYearで初期表示年）
     choice       … ボタン選択
     card         … クレジットカード入力（支払いがクレジット系の時だけ自動表示）
     summary      … 確認画面→ecforceへ転記（msg空なら口上なしでカードだけ出す）
   fields の項目定義:
     key(必須) label placeholder inputType inputmode autocomplete
     optional:true（空でもOK） validate(値→エラー文 or null) norm(正規化関数名)
   ステップ側オプション:
     enterNext:false … Enterキーで次に進まない（お名前ステップで使用。
                        苗字のIME変換確定Enterによる誤送信防止）
   文言(intro/msg/label/placeholder)はすべて自由に書き換えてOK
   ============================================================ */
var SCENARIOS = {

  standard: [
    { type: 'stock' },
    { type: 'openingImage' },
    /* 挨拶。タグの greeting で上書き可(key:'greet'がその目印) */
    { type: 'msg', key: 'greet',
      msg: 'こんにちは！✨\n{{PRODUCT}}の\nかんたん注文チャットです。\nただいま{{PRICE}}でご案内中です🎁' },

    /* お名前+フリガナ 1カード。
       enterNext:false = Enterキーで次に進まない(苗字の変換確定Enterでの誤送信防止) */
    { type: 'fields', key: 'name', intro: 'まず、お名前を教えてください', layout: 'stack',
      enterNext: false,
      fields: [
        { key: 'name_full', label: 'お名前（漢字）', placeholder: '例：山田 花子',
          autocomplete: 'name', validate: 'required', norm: 'nameSpace' },
        { key: 'kana_full', label: 'フリガナ（カタカナ）', placeholder: '例：ヤマダ ハナコ',
          validate: 'kana', norm: 'kana' },
      ] },

    { type: 'fields', key: 'contact', intro: 'ご連絡先を教えてください', layout: 'stack',
      fields: [
        { key: 'email', label: 'メールアドレス', placeholder: '例：hanako@example.com',
          inputType: 'email', inputmode: 'email', autocomplete: 'email', validate: 'email',
          note: 'ご購入前後のお客様にお得な情報をお送りする可能性がございます。' },
        { key: 'tel', label: '電話番号（ハイフン不要）', placeholder: '例：09012345678',
          inputType: 'tel', inputmode: 'numeric', autocomplete: 'tel', validate: 'tel', norm: 'tel' },
      ] },

    { type: 'fields', key: 'password', intro: 'マイページ用のパスワードを設定してください', layout: 'stack',
      fields: [
        { key: 'password', label: 'パスワード（半角英数8文字以上）',
          inputType: 'password', autocomplete: 'new-password', validate: 'password',
          displayAs: '••••••••' },
      ] },

    { type: 'choice', key: 'sex', intro: '性別を教えてください',
      choices: [
        { label: '女性', value: '2' },
        { label: '男性', value: '1' },
      ] },

    /* 生年月日: 直入力とプルダウンの両対応(どちらで入れてもOK)。年の初期値は1992 */
    { type: 'birth', key: 'birthdate', intro: '生年月日を教えてください', defaultYear: 1992 },

    { type: 'zip', key: 'zip',
      intro: 'お届け先の郵便番号を教えてください\n（住所は自動で入ります）' },

    { type: 'fields', key: 'addr', intro: 'ご住所をご確認・ご入力ください', layout: 'stack',
      fields: [
        { key: 'pref',  label: '都道府県', inputTag: 'select', validate: 'required' },
        { key: 'addr1', label: '市区町村', placeholder: '例：渋谷区神宮前', validate: 'required' },
        { key: 'addr2', label: '丁目・番地・建物名・号室', placeholder: '例：1-2-3 ハグスキンマンション201',
          validate: 'required' },
      ] },

    /* 支払い方法: LP内フォームがある場合は実フォームの選択肢から自動生成される。
       下記はフォームが見つからない場合(リダイレクトモード)のフォールバック */
    { type: 'choice', key: 'payment', intro: 'お支払い方法をお選びください',
      choices: [
        { label: 'クレジットカード', value: '21' },
        { label: '後払い（コンビニ/銀行）', value: '102' },
      ] },

    /* クレジットカード選択時のみ自動表示(後払いの時は勝手にスキップされる) */
    { type: 'card', key: 'card',
      intro: 'カード情報をご入力ください🔒\n（暗号化された注文フォームに反映されます）' },

    /* msg空 = 口上なしでいきなり最終確認カードを出す */
    { type: 'summary', msg: '',
      submitLabel: 'この内容で注文を確定する →' },
  ],

};

/* 会員判定ステップ(冒頭で会員か聞くパターン)。
   立ち上がり期は質問を増やさないため standard には入れず、
   使いたいLPだけタグで scenario: 'member_ask' を指定する。
   ※登録済みメールの検知は、送信後にecforceが弾いて戻ってきた画面を
     チャットが自動検知してログイン案内する仕組みが standard にも入っている */
var FIRST_TIME_STEP = { type: 'choice', key: 'first_time', intro: 'HugSkinのご利用は初めてですか？',
  choices: [
    { label: 'はじめて利用します', value: 'first' },
    { label: '会員です（2回目以降）', value: 'member' },
  ],
  memberMsg: '会員の方はログインしてからのご注文がスムーズです✨\n（ご登録済みのメールアドレスでは、新規のお客様用フォームからはご注文いただけません）' };
SCENARIOS.member_ask = SCENARIOS.standard.slice(0, 3).concat([FIRST_TIME_STEP], SCENARIOS.standard.slice(3));

/* form-plus完全再現シナリオ(文言・グルーピングとも 2026-07-06 に保積さんが採取した実物と同一)。
   タグで scenario: 'formplus' を指定して使う */
SCENARIOS.formplus = [
  { type: 'stock' },
  { type: 'openingImage' },

  { type: 'fields', key: 'name', layout: 'stack', enterNext: false,
    intro: 'それでは受付を開始いたします！\nお名前をご入力でクーポンが適用されます！',
    fields: [
      { key: 'name_full', label: '名前', placeholder: '例：山田 花子',
        autocomplete: 'name', validate: 'required', norm: 'nameSpace' },
      { key: 'kana_full', label: 'フリガナ', placeholder: '例：ヤマダ ハナコ',
        validate: 'kana', norm: 'kana' },
    ] },

  { type: 'birth', key: 'birthdate', withSex: true, defaultYear: 1992,
    intro: '次に生年月日と性別をご入力ください！' },

  { type: 'address', key: 'addr',
    intro: 'お届け先と電話番号をご入力ください！' },

  { type: 'fields', key: 'contact', layout: 'stack',
    intro: '注文情報を確認するための\nマイページに使用する\nメールアドレスとパスワードをご入力ください！',
    fields: [
      { key: 'email', label: 'メールアドレス', placeholder: '例：hanako@example.com',
        inputType: 'email', inputmode: 'email', autocomplete: 'email', validate: 'email',
          note: 'ご購入前後のお客様にお得な情報をお送りする可能性がございます。' },
      { key: 'password', label: 'パスワード（半角英数8文字以上）',
        inputType: 'password', autocomplete: 'new-password', validate: 'password',
        displayAs: '••••••••' },
    ] },

  { type: 'choice', key: 'payment',
    intro: '最後にお支払い方法を選択してください！',
    choices: [
      { label: 'クレジットカード', value: '21' },
      { label: '後払い（コンビニ/銀行）', value: '102' },
    ] },

  { type: 'card', key: 'card',
    intro: 'カード情報をご入力ください🔒\n（暗号化された注文フォームに反映されます）' },

  { type: 'summary', msg: '',
    submitLabel: 'この内容で注文を確定する →' },
];

/* 確認画面などで使う項目名 */
var LABELS = {
  name_full: 'お名前', kana_full: 'フリガナ',
  name_last: '姓', name_first: '名', kana_last: 'セイ', kana_first: 'メイ',
  email: 'メール', tel: '電話番号',
  password: 'パスワード', sex: '性別', birthdate: '生年月日', zip: '郵便番号',
  pref: '都道府県', addr1: '市区町村', addr2: '番地・建物',
  payment: 'お支払い', card: 'カード',
};

var PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

/* ============================================================
   ③ ENGINE — ここから下は編集注意
   ============================================================ */

/* ---------- 正規化・バリデーション ---------- */
function z2h(s) { // 全角→半角
  return String(s)
    .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[ー－―‐−]/g, '-');
}
var NORMS = {
  tel:  function (v) { return z2h(v).replace(/[-\s]/g, ''); },
  zip:  function (v) { return z2h(v).replace(/[-\s]/g, ''); },
  kana: function (v) { // ひらがな→カタカナ変換 + スペースを半角1個に正規化(ecforceは「ヤマダ ハナコ」形式)
    return v.replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); })
      .replace(/[\s　]+/g, ' ').trim();
  },
  nameSpace: function (v) { // 氏名のスペースを半角1個に正規化
    return v.replace(/[\s　]+/g, ' ').trim();
  },
  cardNum: function (v) { return z2h(v).replace(/[-\s]/g, ''); },
  cardName: function (v) { return v.replace(/[\s　]+/g, ' ').trim().toUpperCase(); },
  birth: function (v) {
    var m = z2h(v).trim().match(/^(\d{4})[\/\-年.]?(\d{1,2})[\/\-月.]?(\d{1,2})日?$/);
    if (!m) return v;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2030 || mo < 1 || mo > 12 || d < 1 || d > 31) return v;
    return y + '/' + ('0' + mo).slice(-2) + '/' + ('0' + d).slice(-2);
  },
};
var VALIDATORS = {
  required: function (v) { return v.trim() ? null : '入力してください'; },
  email:    function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : '正しいメールアドレスを入力してください'; },
  tel:      function (v) { return /^0\d{9,10}$/.test(v) ? null : '正しい電話番号を入力してください（例：09012345678）'; },
  password: function (v) { return v.length >= 8 ? null : '8文字以上で入力してください'; },
  birth:    function (v) { return /^\d{4}\/\d{2}\/\d{2}$/.test(v) ? null : '例）1990/01/15 の形式で入力してください'; },
  kana:     function (v) { return /^[ァ-ヶー ]+$/.test(v) ? null : 'カタカナで入力してください（例：ヤマダ ハナコ）'; },
  cardNum:  function (v) { return /^\d{14,16}$/.test(v) ? null : 'カード番号を正しく入力してください（ハイフン不要）'; },
  cardName: function (v) { return /^[A-Za-z .'-]+$/.test(v.trim()) ? null : 'カード名義をローマ字で入力してください（例：HANAKO YAMADA）'; },
  zip:      function (v) { return /^\d{7}$/.test(v) ? null : '郵便番号7桁で入力してください（例：1500001）'; },
};

/* ---------- 計測フック（Clarity / GTM dataLayer） ---------- */
function track(ev) {
  try { if (window.dataLayer) window.dataLayer.push({ event: 'hs_chat_' + ev }); } catch (e) {}
  try { if (window.clarity) window.clarity('event', 'hs_chat_' + ev); } catch (e) {}
}

/* ---------- 状態 ---------- */
var steps = SCENARIOS[CFG.scenario] || SCENARIOS.standard;

/* skip設定（CFG.skip）に入っている項目は質問から除外する。
   除外された項目は transfer() 時に resolveSkips() がダミー値で補完して転記する */
var SKIP = CFG.skip || {};
steps = steps.map(function (s) {
  if (s.type === 'fields') {
    var rest = s.fields.filter(function (f) { return !(f.key in SKIP); });
    if (rest.length === s.fields.length) return s;   // 除外なし→そのまま
    if (!rest.length) return null;                   // 全項目除外→ステップごと消す
    var copy = {};
    for (var k in s) copy[k] = s[k];
    copy.fields = rest;
    return copy;
  }
  if ((s.type === 'choice' || s.type === 'zip') && (s.key in SKIP)) return null;
  return s;
}).filter(Boolean);

var answers = {};
var prefill = {};          // 郵便番号API→住所カードへの受け渡し
var current = 0;
var doneCount = 0;
var started = false;
var interacted = false;    // 一度でも操作したか（モバイルでの勝手なキーボード起動防止）
var editMode = false;      // 「その項目だけ修正」中か（確認画面 or 回答バブルタップ）
var editReturned = false;  // 修正から確認画面に戻ってきた直後か（メッセージ切替用）
var editReturnIdx = null;  // 修正完了後に戻るステップindex
var pendingIdx = 0;        // いま表示中の質問のステップindex
var prefilled = false;     // 確認画面表示時にLPフォームへ先行転記済みか
var chatAgreeChecked = null;  // 確認画面の利用規約チェック状態(null=チェックUI非表示)
var totalInput = steps.filter(function (s) {
  return s.type === 'fields' || s.type === 'zip' || s.type === 'choice' || s.type === 'card' || s.type === 'birth' || s.type === 'address';
}).length;

/* ---------- Shadow DOM シェル ---------- */
var CSS = ''
+ ':host{all:initial}'
+ '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
+ '.wrap{font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP",sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}'
/* --- フローティング --- */
+ '.launcher{position:fixed;bottom:16px;right:12px;z-index:2147483000;display:flex;align-items:center;gap:8px;'
+ 'background:' + CFG.theme.brand + ';color:#fff;border:none;border-radius:99px;padding:13px 20px;'
+ 'font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.22);'
+ 'animation:hsPulse 2.4s infinite}'
+ '@keyframes hsPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}'
+ '.launcher.launcher-img{background:none;padding:0;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.25)}'
+ '.launcher.launcher-img img{display:block;max-width:min(220px,60vw);height:auto}'
+ '.panel{position:fixed;bottom:12px;right:12px;z-index:2147483001;width:min(400px,calc(100vw - 16px));'
+ 'height:min(620px,calc(100dvh - 24px));display:flex;flex-direction:column;background:' + CFG.theme.brandLight + ';'
+ 'border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.28);'
+ 'animation:hsIn .22s ease both}'
+ '@keyframes hsIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}'
+ '@media (max-width:480px){.panel{right:0;bottom:0;width:100vw;height:min(88dvh,640px);border-radius:16px 16px 0 0}}'
/* --- インライン --- */
+ '.inline-box{display:flex;flex-direction:column;background:' + CFG.theme.brandLight + ';border-radius:14px;overflow:hidden;border:1px solid rgba(0,0,0,.07)}'
/* --- 共通チャットUI --- */
+ '.hd{background:' + CFG.theme.brand + ';padding:11px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0}'
+ '.hd-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}'
+ '.hd-name{color:#fff;font-size:14px;font-weight:600}'
+ '.hd-sub{color:rgba(255,255,255,.85);font-size:11px;margin-top:1px}'
+ '.hd-close{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.9);font-size:20px;cursor:pointer;padding:4px 6px;line-height:1}'
+ '.pg{height:4px;background:rgba(0,0,0,.08);flex-shrink:0}'
+ '.pg-fill{height:100%;background:' + CFG.theme.brandDark + ';transition:width .4s cubic-bezier(.4,0,.2,1);width:0}'
+ '.msgs{flex:1;overflow-y:auto;padding:14px 12px 22px;display:flex;flex-direction:column;gap:9px;overscroll-behavior:contain}'
/* ⚠️重要: flexの仕様でoverflow:hiddenを持つ子(確認カード等)が高さ0に潰されるのを防ぐ。
   これが無いと確認画面が「高さ1px」になり、止まったように見える(2026-07-05実障害) */
+ '.msgs>*{flex-shrink:0}'
+ '.inline-box .msgs{max-height:none;overflow:visible}'
+ '.row{display:flex;align-items:flex-end;gap:8px;animation:hsUp .18s ease both}'
+ '.row.user{flex-direction:row-reverse}'
+ '@keyframes hsUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}'
+ '.av{width:28px;height:28px;border-radius:50%;background:' + CFG.theme.brand + ';display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;margin-bottom:2px}'
+ '.bb{max-width:80%;padding:9px 13px;line-height:1.6;font-size:13.5px;word-break:break-word;white-space:pre-wrap}'
+ '.bb.bot{background:#fff;color:#3a2a30;border-radius:3px 12px 12px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}'
+ '.bb.user{background:' + CFG.theme.brand + ';color:#fff;border-radius:12px 3px 12px 12px}'
+ '.row.user.editable{cursor:pointer}'
+ '.ub-ed{color:' + CFG.theme.brand + ';font-size:12px;opacity:.6;margin-bottom:4px;flex-shrink:0}'
+ '.bb img{max-width:100%;border-radius:8px;display:block}'
+ '.img-bb{max-width:88%;padding:4px;background:#fff;border-radius:3px 12px 12px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}'
/* チャット内画像はどんなサイズを入れても自動フィット(最大高さ280px・比率維持) */
+ '.img-bb img{max-width:100%;max-height:280px;width:auto;height:auto;border-radius:8px;display:block}'
/* オペレーター(アバター)画像 */
+ '.av,.hd-av{overflow:hidden}'
+ '.av img,.hd-av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}'
+ '.typing{background:#fff;border-radius:3px 12px 12px 12px;padding:11px 14px;box-shadow:0 1px 2px rgba(0,0,0,.06);display:flex;gap:5px;align-items:center}'
+ '.dot{width:6px;height:6px;border-radius:50%;background:#c8a0b0;animation:hsBlink 1.1s infinite}'
+ '.dot:nth-child(2){animation-delay:.18s}.dot:nth-child(3){animation-delay:.36s}'
+ '@keyframes hsBlink{0%,60%,100%{opacity:.3;transform:scale(.85)}30%{opacity:1;transform:scale(1)}}'
+ '.spin{width:15px;height:15px;border:2px solid rgba(0,0,0,.12);border-top-color:' + CFG.theme.brand + ';border-radius:50%;animation:hsSpin .7s linear infinite;flex-shrink:0}'
+ '@keyframes hsSpin{to{transform:rotate(360deg)}}'
+ '.stock{display:flex;align-items:center;gap:9px;background:#fff;border-radius:3px 12px 12px 12px;padding:11px 14px;box-shadow:0 1px 2px rgba(0,0,0,.06);font-size:13px;color:#3a2a30}'
/* --- 入力カード --- */
+ '.card{background:#fff;border-radius:12px;border:.5px solid rgba(0,0,0,.1);padding:13px 13px 11px;margin-left:36px;box-shadow:0 1px 4px rgba(0,0,0,.07);animation:hsUp .18s ease both}'
+ '.card label{display:block;font-size:11.5px;color:#9a7a85;font-weight:600;letter-spacing:.03em;margin-bottom:5px}'
+ '.card .fld{margin-bottom:9px}'
+ '.card input,.card select{width:100%;border:1px solid rgba(0,0,0,.14);border-radius:8px;padding:11px 12px;font-size:16px;font-family:inherit;color:#3a2a30;background:#fdfbfc;outline:none;transition:border-color .15s;-webkit-appearance:none;appearance:none}'
+ '.card input:focus,.card select:focus{border-color:' + CFG.theme.brand + ';background:#fff}'
+ '.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}'
+ '.three{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:8px}'
+ '.pick3{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:8px}'
+ '.pick{height:158px;overflow-y:auto;border:1px solid rgba(0,0,0,.14);border-radius:8px;background:#fdfbfc;overscroll-behavior:contain}'
+ '.pick button{display:block;width:100%;padding:8px 4px;border:none;background:none;font-size:14.5px;font-family:inherit;color:#3a2a30;cursor:pointer;text-align:center}'
+ '.pick button.on{background:' + CFG.theme.brand + ';color:#fff;border-radius:6px}'
+ '.mail-sug{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}'
+ '.sug{background:#fff;border:1px solid ' + CFG.theme.brand + ';color:' + CFG.theme.brand + ';border-radius:8px;padding:6px 10px;font-size:12px;font-family:inherit;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis}'
+ '.sug:active{background:' + CFG.theme.brandLight + '}'
+ '.two .fld{margin-bottom:0}'
+ '.go{display:block;width:100%;margin-top:10px;padding:12px;background:' + CFG.theme.brand + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-family:inherit;font-weight:600;cursor:pointer;transition:background .15s,transform .1s;letter-spacing:.02em}'
+ '.go:hover{background:' + CFG.theme.brandDark + '}'
+ '.go:active{transform:scale(.98)}'
+ '.go:disabled{opacity:.5;cursor:default}'
+ '.choices{display:flex;flex-wrap:wrap;gap:8px;margin-left:36px;animation:hsUp .18s ease both}'
+ '.ch{background:#fff;border:1.5px solid ' + CFG.theme.brand + ';color:' + CFG.theme.brand + ';border-radius:99px;padding:10px 18px;font-size:13.5px;font-family:inherit;cursor:pointer;transition:background .15s,color .15s,transform .1s;white-space:nowrap}'
+ '.ch:hover{background:' + CFG.theme.brand + ';color:#fff}'
+ '.ch:active{transform:scale(.96)}'
+ '.err{background:#fff5f7;border:.5px solid #f5c0cc;color:#c03050;border-radius:8px;padding:8px 12px;font-size:12.5px;margin-left:36px;animation:hsUp .15s ease both}'
/* --- 確認カード --- */
+ '.sum{background:#fff;border-radius:12px;border:.5px solid rgba(0,0,0,.1);overflow:hidden;margin-left:36px;box-shadow:0 1px 4px rgba(0,0,0,.07);animation:hsUp .18s ease both}'
+ '.sum table{width:100%;border-collapse:collapse;font-size:12.5px}'
+ '.sum td{padding:8px 13px;border-bottom:.5px solid rgba(0,0,0,.06);line-height:1.4}'
+ '.sum td:first-child{color:#9a7a85;width:92px;white-space:nowrap}'
+ '.sum td:last-child{color:#3a2a30;font-weight:500}'
+ '.sum tr:last-child td{border-bottom:none}'
+ '.sum tr.ro td{background:#fbf7f9;font-weight:600}'
+ '.sum tr.tot td{font-weight:700;font-size:13.5px;color:#3a2a30}'
+ '.law{font-size:10.5px;color:#8a7a80;line-height:1.6;padding:10px 12px;border-top:.5px solid rgba(0,0,0,.06);background:#fdfbfc;max-height:150px;overflow-y:auto}'
+ '.sum tr[data-k]{cursor:pointer}'
+ '.sum tr[data-k]:active td{background:#faf3f6}'
+ '.sum td.ed{color:' + CFG.theme.brand + ';width:28px;text-align:center;font-size:13px}'
+ '.sum .go{width:calc(100% - 20px);margin:10px}'
/* 後払い規約カード(form-plus準拠: タイトル+ピンク本文+「無料」赤字) */
+ '.law-card{margin-left:36px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:12px;box-shadow:0 1px 4px rgba(0,0,0,.07);animation:hsUp .18s ease both}'
+ '.law-title{font-size:13px;font-weight:700;color:#3a2a30;margin-bottom:8px}'
+ '.law-body{background:#fbe3e1;border-radius:8px;padding:10px 12px;font-size:11px;line-height:1.75;color:#4a3a3a}'
+ '.law-red{color:#d63030;font-weight:700}'
/* 支払い方法の全幅行ボタン(form-plus風) */
+ '.choices-pay{flex-direction:column;align-items:stretch;margin-right:12px}'
+ '.choices-pay .ch{width:100%;white-space:normal;text-align:center;padding:12px 14px;border-radius:12px}'
/* 入力欄の下の注意書き(グレー地) */
+ '.fld-note{font-size:10.5px;color:#6a5a60;background:#efeaec;border-radius:6px;padding:6px 9px;margin-top:6px;line-height:1.6}'
/* 利用規約の同意チェック(form-plus風の青枠ボックス) */
+ '.agree{display:flex;gap:10px;align-items:flex-start;margin:10px;padding:12px;border:1.5px solid #b9c8e8;border-radius:12px;background:#f6f9ff;cursor:pointer}'
+ '.agree input{width:20px;height:20px;margin-top:1px;accent-color:#2b5fd9;flex-shrink:0;cursor:pointer}'
+ '.agree span{font-size:12px;line-height:1.65;color:#2b4bb8;font-weight:600}'
+ '.agree a{color:#2b4bb8;text-decoration:underline}'
/* カウントダウンバー(form-plus風の緊急性演出) */
+ '.cdbar{background:#fff3e6;border-bottom:1px solid #f5ddc0;padding:7px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}'
+ '.cd-label{font-size:11px;color:#c05020;font-weight:700}'
+ '.cd-time{font-size:11.5px;color:#fff;background:#e05a3a;border-radius:6px;padding:3px 8px;font-weight:700;white-space:nowrap}'
/* 確認画面モーダル(form-plus風) */
+ '.modal-ov{position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:50;display:flex;padding:14px;animation:hsIn .18s ease both}'
+ '.modal-card{background:#fff;border-radius:14px;flex:1;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.3)}'
+ '.modal-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-size:14px;font-weight:700;color:#3a2a30;border-bottom:1px solid rgba(0,0,0,.08);flex-shrink:0}'
+ '.modal-x{background:none;border:none;font-size:20px;color:#9a8a90;cursor:pointer;line-height:1;padding:2px 6px}'
+ '.modal-card .sum{margin:0;border:none;border-radius:0;box-shadow:none;overflow-y:auto;flex:1;animation:none}'
+ '.inline-box{position:relative}'
/* 性別ボタン(生年月日カード内・formplusシナリオ) */
+ '.sexrow{display:flex;gap:8px}'
+ '.sexrow .ch{flex:1;text-align:center}'
+ '.sexrow .ch.on{background:' + CFG.theme.brand + ';color:#fff}'
/* 郵便番号検索ボタン(住所複合カード) */
+ '.zip-search{display:block;margin-top:6px;background:#fff;border:1px solid ' + CFG.theme.brand + ';color:' + CFG.theme.brand + ';border-radius:8px;padding:8px 12px;font-size:12.5px;font-family:inherit;cursor:pointer;width:100%}'
+ '.zip-search:active{background:' + CFG.theme.brandLight + '}';

var host = document.createElement('div');
host.id = 'hs-chat-host';
var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
var style = document.createElement('style');
style.textContent = CSS;
root.appendChild(style);

var wrap = document.createElement('div');
wrap.className = 'wrap';
root.appendChild(wrap);

var panelEl = null, launcherEl = null, msgsEl = null, pgFill = null;

function buildChat(container, withClose) {
  /* カウントダウンバー(タグの countdown で有効化。毎日23:59:59まで=日次リセット) */
  var cdHtml = '';
  if (CFG.countdown) {
    var cdText = (CFG.countdown && CFG.countdown.text) || 'お急ぎください！本日受付終了まで';
    cdHtml = '<div class="cdbar"><span class="cd-label">' + esc(cdText) + '</span><span class="cd-time">--:--:--</span></div>';
  }
  container.innerHTML = ''
    + cdHtml
    + '<div class="hd">'
    +   avHtml('hd-av')
    +   '<div><div class="hd-name">' + CFG.title + '</div><div class="hd-sub">' + CFG.subtitle + '</div></div>'
    +   (withClose ? '<button class="hd-close" aria-label="閉じる">×</button>' : '')
    + '</div>'
    + '<div class="pg"><div class="pg-fill"></div></div>'
    + '<div class="msgs"></div>';
  msgsEl = container.querySelector('.msgs');
  pgFill = container.querySelector('.pg-fill');
  var cdTime = container.querySelector('.cd-time');
  if (cdTime) {
    var tick = function () {
      var now = new Date();
      var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      var s = Math.max(0, Math.floor((end - now) / 1000));
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      cdTime.textContent = 'あと' + h + '時間' + ('0' + m).slice(-2) + '分' + ('0' + sec).slice(-2) + '秒';
    };
    tick();
    setInterval(tick, 1000);
  }
  var close = container.querySelector('.hd-close');
  if (close) close.addEventListener('click', closePanel);
  container.addEventListener('pointerdown', function () { interacted = true; }, true);
  /* 回答バブルのタップ → その質問だけ修正 */
  msgsEl.addEventListener('click', function (e) {
    var row = e.target && e.target.closest ? e.target.closest('.row.user[data-edit]') : null;
    if (row) startEdit(row.getAttribute('data-edit'));
  });
}

function openPanel() {
  if (CFG.mode === 'inline') return;
  if (!panelEl) {
    panelEl = document.createElement('div');
    panelEl.className = 'panel';
    wrap.appendChild(panelEl);
    buildChat(panelEl, true);
  }
  panelEl.style.display = 'flex';
  if (launcherEl) launcherEl.style.display = 'none';
  track('open');
  startFlow();
}
function closePanel() {
  if (panelEl) panelEl.style.display = 'none';
  if (launcherEl) launcherEl.style.display = 'flex';
  track('close');
}

function mount() {
  /* 商品名が未設定ならLPから自動取得(商品が変わってもタグ・シナリオの修正不要) */
  if (!CFG.vars.PRODUCT) CFG.vars.PRODUCT = readProductName();

  if (CFG.mode === 'inline') {
    var target = document.querySelector(CFG.inlineSelector);
    if (!target) { CFG.mode = 'float'; return mount(); }  // 見つからなければfloatにフォールバック
    var box = document.createElement('div');
    box.className = 'inline-box';
    wrap.appendChild(box);
    buildChat(box, false);
    target.appendChild(host);
    track('open');
    startFlow();
    return;
  }
  document.body.appendChild(host);
  if (CFG.launcher !== false) {
    launcherEl = document.createElement('button');
    if (CFG.launcherImage) {
      /* 画像バナー */
      launcherEl.className = 'launcher launcher-img';
      launcherEl.innerHTML = '<img src="' + esc(CFG.launcherImage) + '" alt="' + esc(CFG.launcherText || 'かんたん注文') + '">';
    } else {
      /* 文字バナー */
      launcherEl.className = 'launcher';
      launcherEl.textContent = CFG.launcherText;
    }
    launcherEl.addEventListener('click', function () { interacted = true; openPanel(); });
    wrap.appendChild(launcherEl);
  }

  /* メール既登録エラーで戻ってきた画面では、設定に関わらず自動で開いて案内する */
  if (detectDupEmailError()) return openPanel();

  var a = String(CFG.autoOpen || 'manual');
  if (a === 'immediate') openPanel();
  else if (a.indexOf('delay') === 0) setTimeout(openPanel, parseInt(a.slice(5), 10) || 3000);
  else if (a.indexOf('scroll') === 0) {
    var pct = parseInt(a.slice(6), 10) || 30;
    var fired = false;
    window.addEventListener('scroll', function onSc() {
      if (fired) return;
      var h = document.documentElement;
      var sc = (h.scrollTop || document.body.scrollTop) / ((h.scrollHeight - h.clientHeight) || 1) * 100;
      if (sc >= pct) { fired = true; window.removeEventListener('scroll', onSc); openPanel(); }
    }, { passive: true });
  }
  /* LP内の既存ボタンをチャット起動トリガーにする(タグのopenTriggersにCSSセレクタを書くだけ。
     LPのHTMLは一切触らない方針)。data-hs-open属性も互換のため残すが非推奨 */
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var t = e.target.closest('[data-hs-open]');
    if (!t && CFG.openTriggers) {
      try { t = e.target.closest(CFG.openTriggers); } catch (err) { /* セレクタ不正は無視 */ }
    }
    if (t) { e.preventDefault(); interacted = true; openPanel(); }
  });
}

/* 外部API（LPのボタン等から window.HSChat.open() で呼べる） */
window.HSChat = { open: openPanel, close: closePanel };

/* ---------- チャット描画ヘルパー ---------- */
function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function scrollBottom() {
  setTimeout(function () {
    if (CFG.mode === 'inline') { host.scrollIntoView({ block: 'end', behavior: 'smooth' }); }
    else if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
  }, 40);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
/* アバターHTML: CFG.avatar に画像URLがあれば画像、無ければ💬 */
function avHtml(cls) {
  return CFG.avatar
    ? '<div class="' + cls + '"><img src="' + esc(CFG.avatar) + '" alt=""></div>'
    : '<div class="' + cls + '">💬</div>';
}
function botBubble(text) {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = avHtml('av') + '<div class="bb bot">' + esc(tpl(text)).replace(/\n/g, '<br>') + '</div>';
  msgsEl.appendChild(row); scrollBottom();
}
/* editKey を渡すと、その回答バブルはタップで「その質問だけ修正」できる */
function userBubble(text, editKey) {
  var row = document.createElement('div');
  row.className = 'row user' + (editKey ? ' editable' : '');
  if (editKey) row.setAttribute('data-edit', editKey);
  row.innerHTML = '<div class="bb user">' + esc(text) + '</div>'
    + (editKey ? '<div class="ub-ed" title="タップして修正">✎</div>' : '');
  msgsEl.appendChild(row); scrollBottom();
}
function typing() {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = avHtml('av') + '<div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  msgsEl.appendChild(row); scrollBottom();
  return row;
}
function clearCards() {
  msgsEl.querySelectorAll('.card, .choices, .err').forEach(function (e) { e.remove(); });
}
function clearErrors() { msgsEl.querySelectorAll('.err').forEach(function (e) { e.remove(); }); }
function showError(msg) {
  clearErrors();
  var el = document.createElement('div');
  el.className = 'err';
  el.textContent = '⚠ ' + msg;
  msgsEl.appendChild(el); scrollBottom();
}
function progress() { if (pgFill) pgFill.style.width = (doneCount / totalInput * 100) + '%'; }
function maybeFocus(el) { if (interacted && el) setTimeout(function () { el.focus(); }, 80); }

/* ---------- ステップ実行 ---------- */
function startFlow() {
  if (started) return;
  started = true;
  /* ABテスト用: Clarityにシナリオ名をタグ付け(セッション絞り込みに使う) */
  try { if (window.clarity) window.clarity('set', 'hs_scenario', CFG.scenario); } catch (e) {}
  /* 送信後「メール既登録」で弾かれて戻ってきた画面なら、先にログイン案内を出す */
  if (detectDupEmailError()) {
    track('dup_email_detected');
    renderLoginGuide(
      'ご入力のメールアドレスは既にご登録があるようです💡\nログインしていただくとスムーズにご注文いただけます✨',
      function () { runStep(0); },
      '別のメールアドレスで入力する'
    );
    return;
  }
  runStep(0);
}

/* key(項目キー or ステップキー)からステップindexを引く */
function stepIndexByKey(key) {
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    if (s.key === key) return i;
    if (s.type === 'fields') {
      for (var j = 0; j < s.fields.length; j++) if (s.fields[j].key === key) return i;
    }
    /* 複合カード: 住所+電話 / 生年月日+性別 の中の項目も引けるようにする */
    if (s.type === 'address' && ['zip', 'pref', 'addr1', 'addr2', 'tel'].indexOf(key) >= 0) return i;
    if (s.type === 'birth' && s.withSex && key === 'sex') return i;
  }
  return -1;
}
function summaryIndex() {
  for (var i = 0; i < steps.length; i++) if (steps[i].type === 'summary') return i;
  return steps.length;
}

/* ステップ完了後の遷移。通常は次へ、修正モードなら元いた場所へ直帰する。
   例外: 郵便番号を修正した時は住所確認を、支払いをクレジットに変えた時は
   カード入力(未入力なら)を挟んでから戻る */
function next(i) {
  var s = steps[i];
  if (editMode) {
    if (s.type === 'zip') {
      ['pref', 'addr1', 'addr2'].forEach(function (k) {
        if (prefill[k] == null && answers[k] != null) prefill[k] = answers[k];
      });
      runStep(stepIndexByKey('addr1'));
      return;
    }
    if (s.key === 'payment' && (answers.payment_label || '').indexOf('クレジット') >= 0
        && !answers.card_number && stepIndexByKey('card') > i) {
      runStep(stepIndexByKey('card'));
      return;
    }
    var back = editReturnIdx == null ? summaryIndex() : editReturnIdx;
    if (i >= back) back = i + 1;   // 修正対象がいまの質問以降なら、普通に先へ進む
    editMode = false;
    editReturnIdx = null;
    editReturned = back === summaryIndex();
    runStep(back);
    return;
  }
  runStep(i + 1);
}

/* 確認画面の行 or 過去の回答バブルのタップ → その質問だけ再表示(現在値プリフィル)。
   修正後は元いた質問(または確認画面)へ直帰する */
function startEdit(key) {
  var idx = stepIndexByKey(key);
  if (idx < 0 || editMode) return;
  editMode = true;
  editReturnIdx = pendingIdx;
  var s = steps[idx];
  if (s.type === 'fields') {
    s.fields.forEach(function (f) { if (answers[f.key] != null) prefill[f.key] = answers[f.key]; });
  }
  if (s.type === 'zip' && answers.zip) prefill.zip = answers.zip;
  if (s.type === 'birth' && answers.birthdate) prefill.birthdate = answers.birthdate;
  if (s.type === 'birth' && s.withSex && answers.sex) prefill.sex = answers.sex;
  if (s.type === 'address') {
    ['zip', 'pref', 'addr1', 'addr2', 'tel'].forEach(function (k) {
      if (answers[k] != null) prefill[k] = answers[k];
    });
  }
  if (s.type === 'card') {
    ['card_number', 'card_month', 'card_year', 'card_name'].forEach(function (k) {
      if (answers[k] != null) prefill[k] = answers[k];
    });
  }
  /* 確認画面(通常カード/モーダルどちらも)を消してから再質問する */
  wrap.querySelectorAll('.sum, .modal-ov').forEach(function (el) { el.remove(); });
  clearCards();  // 表示中の質問カードも一旦引っ込める(修正後に再表示される)
  track('edit_' + key);
  runStep(idx);
}

/* runStep本体はrunStepInner。例外が起きても無言で止まらず、
   ユーザーに再読み込みを案内し、計測(hs_chat_error)に原因を送る */
async function runStep(i) {
  try {
    await runStepInner(i);
  } catch (err) {
    try {
      if (window.dataLayer) window.dataLayer.push({ event: 'hs_chat_error', hs_error: String((err && err.message) || err).slice(0, 200) });
      if (window.clarity) window.clarity('event', 'hs_chat_error');
    } catch (e2) {}
    try { botBubble('申し訳ありません、エラーが発生しました🙏\nページを再読み込みして、もう一度お試しください'); } catch (e3) {}
  }
}

async function runStepInner(i) {
  current = i;
  if (i >= steps.length) return;
  var s = steps[i];

  /* --- 演出系 --- */
  if (s.type === 'stock') {
    if (!CFG.opening.stockCheck) return runStep(i + 1);
    var row = document.createElement('div');
    row.className = 'row';
    if (CFG.opening.stockGifUrl) {
      row.innerHTML = avHtml('av') + '<div class="img-bb"><img src="' + esc(CFG.opening.stockGifUrl) + '" alt=""></div>';
    } else {
      row.innerHTML = avHtml('av') + '<div class="stock"><div class="spin"></div><span>' + esc(tpl(CFG.opening.stockTextChecking)) + '</span></div>';
    }
    msgsEl.appendChild(row); scrollBottom();
    await delay(900);
    row.remove();
    botBubble(CFG.opening.stockTextDone);
    return runStep(i + 1);
  }
  if (s.type === 'openingImage') {
    /* 冒頭画像: images(配列)があれば順に、なければimage(1枚)を表示 */
    var imgs = CFG.opening.images && CFG.opening.images.length ? CFG.opening.images
             : (CFG.opening.image ? [CFG.opening.image] : []);
    imgs.forEach(function (src) { imgBubble(src); });
    return runStep(i + 1);
  }
  if (s.type === 'image') {
    if (s.src) imgBubble(s.src);
    return runStep(i + 1);
  }
  if (s.type === 'msg') {
    var t0 = typing(); await delay(CFG.typingMs); t0.remove();
    /* 挨拶(key:'greet')はタグの greeting 設定で上書きできる */
    botBubble(s.key === 'greet' && CFG.greeting ? CFG.greeting : s.msg);
    return runStep(i + 1);
  }
  /* カードステップは支払いがクレジット系の時だけ表示 */
  if (s.type === 'card' && (answers.payment_label || '').indexOf('クレジット') < 0) {
    return editMode ? next(i) : runStep(i + 1);
  }

  /* --- 入力系 --- */
  /* 質問の直前に画像(タグの stepImages で指定)を出す */
  if (CFG.stepImages && CFG.stepImages[s.key]) imgBubble(CFG.stepImages[s.key]);

  var t = typing(); await delay(CFG.typingMs); t.remove();

  if (!editMode) pendingIdx = i;   // 修正中でなければ「いまの質問」を記録
  if (s.type === 'choice') return renderChoice(s, i);
  if (s.type === 'zip')    return renderZip(s, i);
  if (s.type === 'fields') return renderFields(s, i);
  if (s.type === 'birth')  return renderBirth(s, i);
  if (s.type === 'address') return renderAddress(s, i);
  if (s.type === 'card')   return renderCard(s, i);
  if (s.type === 'summary') return renderSummary(s);
}

function imgBubble(src) {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = avHtml('av') + '<div class="img-bb"><img src="' + esc(src) + '" alt=""></div>';
  msgsEl.appendChild(row); scrollBottom();
}

/* 質問文: タグの texts[ステップkey] があればそれを優先(LP個別の文言上書き) */
function stepIntro(s) {
  return (CFG.texts && CFG.texts[s.key]) || s.intro;
}

/* LPの商品名ブロック(ecforce商品設定の表示)から商品名を自動取得。
   「HugSkin C10 オールインセラム【定期】_0012」→ 末尾の内部連番を除去 */
function readProductName() {
  var el = document.querySelector('tr.input_variant_ec .form_group_ec')
        || document.querySelector('.input_variant_ec .form_group_ec');
  if (!el) return '';
  return (el.innerText || '').trim().replace(/\s+/g, ' ').replace(/_\d+$/, '').trim();
}
function readQty() {
  var el = document.querySelector('[name="order[order_items_attributes][][quantity]"]');
  return el && el.value ? String(el.value) : '';
}

/* ecforce標準の注文内容テーブル(qa-*クラス)から金額・商品・注意事項を自動取得。
   2026-07-05 chat_test LPで確認した実在セレクタ:
   qa-product_name / qa-product_price / qa-product_quantity / qa-deliv_fee /
   qa-charge / qa-tax / qa-total / qa-caution(特商法・定期条件の注意喚起文) */
function qaText(name) {
  var el = document.querySelector('.qa-' + name);
  return el ? (el.innerText || '').trim() : '';
}
function readOrderSummary() {
  var total = qaText('total');
  if (!total) return null;   // テーブル未描画のLPでは従来表示にフォールバック
  return {
    product: qaText('product_name').replace(/_\d+$/, '').trim(),
    unit: qaText('product_price'),
    qty: qaText('product_quantity'),
    subtotal: qaText('subtotal'),
    ship: qaText('deliv_fee'),
    charge: qaText('charge'),
    tax: qaText('tax'),
    total: total,
    caution: qaText('caution'),
  };
}

/* LP内フォームの支払い方法selectから選択肢を自動生成
   (LPごとに支払い方法IDが違っても設定不要で追従する) */
function paymentChoicesFromPage() {
  var sel = document.querySelector('[name="order[payment_attributes][payment_method_id]"]');
  if (!sel || !sel.options) return null;
  var out = [];
  for (var i = 0; i < sel.options.length; i++) {
    var o = sel.options[i];
    if (o.value) out.push({ label: o.text.trim(), value: o.value });
  }
  return out.length ? out : null;
}

function renderChoice(s, i) {
  var it = stepIntro(s);
  if (it) botBubble(it);
  var wrapC = document.createElement('div');
  /* 支払い方法はform-plus風の全幅行ボタンにする */
  wrapC.className = s.key === 'payment' ? 'choices choices-pay' : 'choices';
  var choiceList = (s.key === 'payment' && (paymentChoicesFromPage() || CFG.paymentChoices)) || s.choices;
  /* 支払いボタンの表示文言をタグの paymentLabels で差し替え(値はそのまま) */
  if (s.key === 'payment' && CFG.paymentLabels) {
    choiceList = choiceList.map(function (c) {
      var lbl = c.label;
      for (var k in CFG.paymentLabels) {
        if (lbl.indexOf(k) >= 0) { lbl = CFG.paymentLabels[k]; break; }
      }
      return { label: lbl, value: c.value };
    });
  }
  choiceList.forEach(function (c) {
    var b = document.createElement('button');
    b.className = 'ch';
    b.textContent = c.label;
    b.addEventListener('click', function () {
      clearCards();
      answers[s.key] = c.value;
      answers[s.key + '_label'] = c.label;
      userBubble(c.label, s.key);
      if (!editMode) { doneCount++; progress(); }
      track('step_' + s.key);
      /* 後払いを選んだら規約・注意文を表示(タグの codNotice。空文字にすれば非表示)。
         デザインはform-plus準拠: 「利用規約」タイトル+ピンク本文+「無料」赤字 */
      if (s.key === 'payment' && c.label.indexOf('後払い') >= 0 && CFG.codNotice) {
        var nb = document.createElement('div');
        nb.className = 'law-card';
        nb.innerHTML = '<div class="law-title">利用規約</div>'
          + '<div class="law-body">'
          + esc(CFG.codNotice).replace(/\n/g, '<br>').replace(/：無料/g, '：<span class="law-red">無料</span>')
          + '</div>';
        msgsEl.appendChild(nb); scrollBottom();
      }
      /* 会員(登録済みメール)の場合はログイン導線を出す */
      if (s.key === 'first_time' && c.value === 'member') {
        return renderLoginGuide(s.memberMsg, function () { next(i); });
      }
      next(i);
    });
    wrapC.appendChild(b);
  });
  msgsEl.appendChild(wrapC); scrollBottom();
}

/* 会員向けログイン誘導(登録済みメールは新規フォームでecforceに弾かれるため)。
   contFn = 「このまま入力を続ける」を押した時の続きの処理 */
function renderLoginGuide(msg, contFn, contLabel) {
  botBubble(msg || '会員の方はログインしてからのご注文がスムーズです✨');
  var wrapC = document.createElement('div');
  wrapC.className = 'choices';
  var loginBtn = document.createElement('button');
  loginBtn.className = 'ch';
  loginBtn.textContent = 'ログイン画面を開く';
  loginBtn.addEventListener('click', function () {
    track('login_open');
    window.open(CFG.loginUrl, '_blank');
    botBubble('ログイン後、このページに戻って\nそのままご注文いただけます✨');
    scrollBottom();
  });
  var contBtn = document.createElement('button');
  contBtn.className = 'ch';
  contBtn.textContent = contLabel || 'このまま入力を続ける';
  contBtn.addEventListener('click', function () {
    clearCards();
    userBubble(contBtn.textContent);
    track('login_skip');
    contFn();
  });
  wrapC.appendChild(loginBtn);
  wrapC.appendChild(contBtn);
  msgsEl.appendChild(wrapC); scrollBottom();
}

/* 送信後にecforceが「メールアドレスは既に登録済み」で弾いて戻ってきた画面かを判定 */
function detectDupEmailError() {
  try {
    var t = document.body.innerText || '';
    return /(メールアドレス|Ｅメール|Eメール|email)[^\n。]{0,40}(既に|すでに)[^\n。]{0,15}(登録|使用|存在)/i.test(t);
  } catch (e) { return false; }
}

function fieldInputHtml(f, idx) {
  if (f.inputTag === 'select' && f.key === 'pref') {
    var opts = '<option value="">選択してください</option>';
    PREFS.forEach(function (p) { opts += '<option value="' + p + '">' + p + '</option>'; });
    return '<select id="f' + idx + '" autocomplete="address-level1">' + opts + '</select>';
  }
  return '<input id="f' + idx + '" type="' + (f.inputType || 'text') + '"'
    + ' placeholder="' + esc(f.placeholder || '') + '"'
    + (f.inputmode ? ' inputmode="' + f.inputmode + '"' : '')
    + (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : ' autocomplete="off"')
    + '>';
}

function renderFields(s, i) {
  botBubble(stepIntro(s));
  var card = document.createElement('div');
  card.className = 'card';
  var inner = s.fields.map(function (f, idx) {
    /* 入力欄の下の注意書き(タグのfieldNotes優先、なければシナリオのnote) */
    var note = (CFG.fieldNotes && CFG.fieldNotes[f.key]) || f.note || '';
    return '<div class="fld"><label>' + esc(f.label) + '</label>' + fieldInputHtml(f, idx)
      + (note ? '<div class="fld-note">' + esc(note) + '</div>' : '')
      + '</div>';
  }).join('');
  card.innerHTML = (s.layout === '2col' ? '<div class="two">' + inner + '</div>' : inner)
    + '<button class="go">次へ →</button>';
  msgsEl.appendChild(card); scrollBottom();

  /* 郵便番号API等からのプリフィル */
  s.fields.forEach(function (f, idx) {
    if (prefill[f.key] != null) {
      card.querySelector('#f' + idx).value = prefill[f.key];
      delete prefill[f.key];
    }
  });

  /* メール欄には @ 以降のドメインサジェストを付ける */
  s.fields.forEach(function (f, idx) {
    if ((f.inputType || '') === 'email') attachEmailSuggest(card.querySelector('#f' + idx));
  });

  var goBtn = card.querySelector('.go');
  goBtn.addEventListener('click', function () {
    clearErrors();
    var vals = [];
    for (var idx = 0; idx < s.fields.length; idx++) {
      var f = s.fields[idx];
      var v = card.querySelector('#f' + idx).value.trim();
      if (f.norm && NORMS[f.norm]) v = NORMS[f.norm](v);
      if (!f.optional || v) {
        var validator = f.validate ? VALIDATORS[f.validate] : null;
        var err = f.optional && !v ? null : (validator ? validator(v) : (v ? null : '入力してください'));
        if (err) { showError(f.label.replace(/（.*/, '') + '：' + err); return; }
      }
      vals.push({ f: f, v: v });
    }
    clearCards();
    var shown = [];
    vals.forEach(function (x) {
      answers[x.f.key] = x.v;
      if (x.v) shown.push(x.f.displayAs || x.v);
    });
    userBubble(shown.join('　'), s.key);
    if (!editMode) { doneCount++; progress(); }
    track('step_' + s.key);
    next(i);
  });

  var inputs = card.querySelectorAll('input,select');
  inputs.forEach(function (inp, idx) {
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      /* IMEの変換確定Enterでは絶対に進まない(日本語入力の誤送信防止) */
      if (e.isComposing || e.keyCode === 229) return;
      /* enterNext:false のステップ(お名前など)はEnterでは進まない */
      if (s.enterNext === false) return;
      if (idx < inputs.length - 1) inputs[idx + 1].focus();
      else goBtn.click();
    });
  });
  maybeFocus(card.querySelector('input,select'));
}

/* 生年月日カード: 年/月/日の数字リストが最初から見えるスクロール選択式。
   年はdefaultYear(1992)が選択済み+リスト中央に表示。月と日を選ぶと自動で次へ進む。
   withSex:true で性別ボタンも同じカードに入る(form-plus風グルーピング) */
function renderBirth(s, i) {
  var it = stepIntro(s);
  if (it) botBubble(it);
  var card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
      '<div class="fld"><label>生年月日（タップで選択）</label><div class="pick3">'
    + '<div class="pick" id="pk-y"></div><div class="pick" id="pk-m"></div><div class="pick" id="pk-d"></div>'
    + '</div></div>'
    + (s.withSex ? '<div class="fld"><label>性別</label><div class="sexrow">'
      + '<button type="button" class="ch" data-sex="2">女性</button>'
      + '<button type="button" class="ch" data-sex="1">男性</button>'
      + '</div></div>' : '')
    + '<button class="go">次へ →</button>';
  msgsEl.appendChild(card); scrollBottom();

  var sel = { y: null, m: null, d: null, sex: null, sexLabel: '' };
  if (prefill.birthdate) {
    var p = prefill.birthdate.split('/');
    if (p.length === 3) { sel.y = +p[0]; sel.m = +p[1]; sel.d = +p[2]; }
    delete prefill.birthdate;
  }
  if (s.withSex && prefill.sex) { sel.sex = prefill.sex; delete prefill.sex; }
  if (!sel.y) sel.y = s.defaultYear || 1992;   // 年は初期選択済み

  /* 性別ボタン(withSex時) */
  if (s.withSex) {
    var sexBtns = card.querySelectorAll('.sexrow .ch');
    for (var sb = 0; sb < sexBtns.length; sb++) {
      (function (btn) {
        if (sel.sex === btn.getAttribute('data-sex')) btn.classList.add('on');
        btn.addEventListener('click', function () {
          for (var x = 0; x < sexBtns.length; x++) sexBtns[x].classList.remove('on');
          btn.classList.add('on');
          sel.sex = btn.getAttribute('data-sex');
          sel.sexLabel = btn.textContent;
          maybeDone();
        });
      })(sexBtns[sb]);
    }
  }

  function buildCol(el, from, to, unit, key) {
    for (var v = from; v <= to; v++) {
      (function (val) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = val + unit;
        if (sel[key] === val) b.className = 'on';
        b.addEventListener('click', function () {
          var btns = el.querySelectorAll('button');
          for (var x = 0; x < btns.length; x++) btns[x].className = '';
          b.className = 'on';
          sel[key] = val;
          maybeDone();
        });
        el.appendChild(b);
      })(v);
    }
  }
  var pkY = card.querySelector('#pk-y'), pkM = card.querySelector('#pk-m'), pkD = card.querySelector('#pk-d');
  buildCol(pkY, 1930, 2010, '年', 'y');
  buildCol(pkM, 1, 12, '月', 'm');
  buildCol(pkD, 1, 31, '日', 'd');

  /* 選択済みの値をリスト中央に見せる */
  [pkY, pkM, pkD].forEach(function (col) {
    var on = col.querySelector('.on');
    if (on) col.scrollTop = Math.max(0, on.offsetTop - col.clientHeight / 2 + on.offsetHeight / 2);
  });

  function submit() {
    clearErrors();
    if (!sel.y || !sel.m || !sel.d) { showError('生年月日を選択してください'); return; }
    if (s.withSex && !sel.sex) { showError('性別を選択してください'); return; }
    var v = sel.y + '/' + ('0' + sel.m).slice(-2) + '/' + ('0' + sel.d).slice(-2);
    clearCards();
    answers.birthdate = v;
    if (s.withSex) {
      answers.sex = sel.sex;
      answers.sex_label = sel.sexLabel || (sel.sex === '2' ? '女性' : '男性');
    }
    userBubble(v + (s.withSex ? '　' + answers.sex_label : ''), 'birthdate');
    if (!editMode) { doneCount++; progress(); }
    track('step_birth');
    next(i);
  }
  /* 全部揃ったら自動で次へ(年は初期選択済みなので月+日(+性別)タップで進む) */
  function maybeDone() { if (sel.y && sel.m && sel.d && (!s.withSex || sel.sex)) submit(); }
  card.querySelector('.go').addEventListener('click', submit);
}

/* 住所+電話番号の複合カード(form-plus風グルーピング)。
   郵便番号(7桁で自動検索/検索ボタンも有り)→都道府県・市区町村に自動反映。
   番地・建物、電話番号まで1カードで入力する */
function renderAddress(s, i) {
  var it = stepIntro(s);
  if (it) botBubble(it);
  var card = document.createElement('div');
  card.className = 'card';
  var prefOpts = '<option value="">選択してください</option>';
  PREFS.forEach(function (p) { prefOpts += '<option value="' + p + '">' + p + '</option>'; });
  card.innerHTML =
      '<div class="fld"><label>郵便番号（ハイフン不要）</label>'
    + '<input id="ad-zip" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="例：1500001">'
    + '<button type="button" class="zip-search">郵便番号から住所を検索</button></div>'
    /* ▼住所以下は郵便番号を入れるまで隠しておく(form-plusと同じ段階表示) */
    + '<div id="ad-rest" style="display:none">'
    + '<div class="fld"><label>都道府県</label><select id="ad-pref" autocomplete="address-level1">' + prefOpts + '</select></div>'
    + '<div class="fld"><label>市区町村</label><input id="ad-city" type="text" placeholder="例：渋谷区神宮前"></div>'
    + '<div class="fld"><label>番地・建物名など</label><input id="ad-banchi" type="text" placeholder="例：1-2-3 ハグスキンマンション201"></div>'
    + '<div class="fld"><label>電話番号（ハイフン不要）</label>'
    + '<input id="ad-tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="例：09012345678"></div>'
    + '<button class="go">次へ →</button>'
    + '</div>';
  msgsEl.appendChild(card); scrollBottom();

  var zipIn = card.querySelector('#ad-zip'), prefSel = card.querySelector('#ad-pref');
  var cityIn = card.querySelector('#ad-city'), banchiIn = card.querySelector('#ad-banchi');
  var telIn = card.querySelector('#ad-tel');
  var searchBtn = card.querySelector('.zip-search');
  var restEl = card.querySelector('#ad-rest');

  var revealed = false;
  function reveal(focusTarget) {
    if (!revealed) { revealed = true; restEl.style.display = ''; scrollBottom(); }
    if (focusTarget && interacted) setTimeout(function () { focusTarget.focus(); }, 80);
  }

  /* 修正時のプリフィル(既に住所があるなら最初から全部見せる) */
  var hadPrefill = false;
  if (prefill.zip)   { zipIn.value = prefill.zip; delete prefill.zip; hadPrefill = true; }
  if (prefill.pref)  { prefSel.value = prefill.pref; delete prefill.pref; hadPrefill = true; }
  if (prefill.addr1) { cityIn.value = prefill.addr1; delete prefill.addr1; hadPrefill = true; }
  if (prefill.addr2) { banchiIn.value = prefill.addr2; delete prefill.addr2; hadPrefill = true; }
  if (prefill.tel)   { telIn.value = prefill.tel; delete prefill.tel; hadPrefill = true; }
  if (hadPrefill) reveal();

  var searching = false;
  function doSearch() {
    var z = NORMS.zip(zipIn.value);
    if (!/^\d{7}$/.test(z) || searching) return;
    searching = true;
    searchBtn.textContent = '検索中…';
    fetch(CFG.zipApi + z).then(function (res) { return res.json(); }).then(function (j) {
      if (j && j.results && j.results[0]) {
        prefSel.value = j.results[0].address1;
        cityIn.value = (j.results[0].address2 || '') + (j.results[0].address3 || '');
      }
    }).catch(function () {}).then(function () {
      searching = false;
      searchBtn.textContent = '郵便番号から住所を検索';
      reveal(banchiIn);   // 検索が終わったら(失敗しても手入力用に)住所欄を開く
    });
  }
  searchBtn.addEventListener('click', doSearch);
  var autoZip = '';
  zipIn.addEventListener('input', function () {
    var z = NORMS.zip(zipIn.value);
    if (/^\d{7}$/.test(z) && z !== autoZip) { autoZip = z; doSearch(); }  // 7桁で自動検索
  });

  card.querySelector('.go').addEventListener('click', function () {
    clearErrors();
    var z = NORMS.zip(zipIn.value);
    var tel = NORMS.tel(telIn.value);
    var err = VALIDATORS.zip(z)
      || (!prefSel.value ? '都道府県を選択してください' : null)
      || (!cityIn.value.trim() ? '市区町村を入力してください' : null)
      || (!banchiIn.value.trim() ? '番地・建物名を入力してください' : null)
      || (VALIDATORS.tel(tel) ? '電話番号：' + VALIDATORS.tel(tel) : null);
    if (err) { showError(err); return; }
    clearCards();
    answers.zip = z;
    answers.pref = prefSel.value;
    answers.addr1 = cityIn.value.trim();
    answers.addr2 = banchiIn.value.trim();
    answers.tel = tel;
    userBubble('〒' + z.slice(0, 3) + '-' + z.slice(3) + '　' + answers.pref + answers.addr1 + answers.addr2 + '\n📞 ' + tel, 'addr');
    if (!editMode) { doneCount++; progress(); }
    track('step_addr');
    next(i);
  });
  maybeFocus(zipIn);
}

/* クレジットカード入力カード。
   ⚠️ カード情報は確認画面ではマスク表示、リダイレクトモードでは絶対に送らない。
   LP内フォームのカード欄(VeriTrans)に直接転記するだけで、外部送信は一切しない。 */
function renderCard(s, i) {
  botBubble(stepIntro(s));
  var card = document.createElement('div');
  card.className = 'card';
  /* 有効期限の年: LP実フォームのselect(下2桁)から選択肢を拝借、無ければ生成 */
  var pageYear = document.querySelector('[name="order[payment_attributes][source_attributes][year]"]');
  var years = [];
  if (pageYear && pageYear.options && pageYear.options.length) {
    for (var yi = 0; yi < pageYear.options.length; yi++) {
      if (pageYear.options[yi].value) years.push(pageYear.options[yi].value);
    }
  } else {
    var base = new Date().getFullYear() % 100;
    for (var y = 0; y < 15; y++) years.push(String(base + y));
  }
  var mOpts = '<option value="">月</option>';
  for (var m = 1; m <= 12; m++) mOpts += '<option value="' + m + '">' + m + '月</option>';
  var yOpts = '<option value="">年</option>';
  years.forEach(function (yv) { yOpts += '<option value="' + yv + '">20' + yv + '年</option>'; });

  card.innerHTML =
      '<div class="fld"><label>カード番号（ハイフン不要）</label>'
    + '<input id="cc-num" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="例：4111xxxxxxxxxxxx"></div>'
    + '<div class="fld"><label>有効期限</label><div class="two">'
    + '<div><select id="cc-month" autocomplete="cc-exp-month">' + mOpts + '</select></div>'
    + '<div><select id="cc-year" autocomplete="cc-exp-year">' + yOpts + '</select></div>'
    + '</div></div>'
    + '<div class="fld"><label>カード名義（ローマ字）</label>'
    + '<input id="cc-name" type="text" autocomplete="cc-name" placeholder="例：HANAKO YAMADA"></div>'
    + '<button class="go">次へ →</button>';
  msgsEl.appendChild(card); scrollBottom();

  /* 修正時のプリフィル */
  if (prefill.card_number) { card.querySelector('#cc-num').value = prefill.card_number; delete prefill.card_number; }
  if (prefill.card_month)  { card.querySelector('#cc-month').value = prefill.card_month; delete prefill.card_month; }
  if (prefill.card_year)   { card.querySelector('#cc-year').value = prefill.card_year; delete prefill.card_year; }
  if (prefill.card_name)   { card.querySelector('#cc-name').value = prefill.card_name; delete prefill.card_name; }

  card.querySelector('.go').addEventListener('click', function () {
    clearErrors();
    var num = NORMS.cardNum(card.querySelector('#cc-num').value);
    var mo = card.querySelector('#cc-month').value;
    var yr = card.querySelector('#cc-year').value;
    var nm = NORMS.cardName(card.querySelector('#cc-name').value);
    var err = VALIDATORS.cardNum(num) || (!mo || !yr ? '有効期限を選択してください' : null) || VALIDATORS.cardName(nm);
    if (err) { showError(err); return; }
    clearCards();
    answers.card_number = num;
    answers.card_month = mo;
    answers.card_year = yr;
    answers.card_name = nm;
    userBubble('カード末尾 ' + num.slice(-4) + '　' + mo + '/20' + yr, 'card');
    if (!editMode) { doneCount++; progress(); }
    track('step_card');  /* 値は絶対に送らない */
    next(i);
  });
  maybeFocus(card.querySelector('#cc-num'));
}

/* メール入力の @ 以降にドメイン候補チップを出す(タップで補完) */
var MAIL_DOMAINS = ['gmail.com', 'yahoo.co.jp', 'icloud.com', 'docomo.ne.jp', 'au.com', 'ezweb.ne.jp', 'softbank.ne.jp', 'outlook.jp', 'hotmail.co.jp'];
function attachEmailSuggest(inp) {
  if (!inp) return;
  var box = document.createElement('div');
  box.className = 'mail-sug';
  inp.parentElement.appendChild(box);
  inp.addEventListener('input', function () {
    box.innerHTML = '';
    var v = inp.value;
    var at = v.indexOf('@');
    if (at < 1) return;
    var local = v.slice(0, at), dom = v.slice(at + 1);
    MAIL_DOMAINS.filter(function (d) { return d.indexOf(dom) === 0 && d !== dom; }).slice(0, 4)
      .forEach(function (d) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sug';
        b.textContent = local + '@' + d;
        b.addEventListener('click', function () {
          inp.value = local + '@' + d;
          box.innerHTML = '';
          inp.focus();
        });
        box.appendChild(b);
      });
    scrollBottom();
  });
}

function renderZip(s, i) {
  botBubble(stepIntro(s));
  var card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="fld"><label>郵便番号（ハイフン不要）</label>'
    + '<input id="zipin" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="例：1500001"></div>'
    + '<button class="go">次へ →</button>';
  msgsEl.appendChild(card); scrollBottom();

  var goBtn = card.querySelector('.go');
  var zipIn = card.querySelector('#zipin');
  if (prefill.zip != null) { zipIn.value = prefill.zip; delete prefill.zip; }

  goBtn.addEventListener('click', async function () {
    clearErrors();
    var z = NORMS.zip(zipIn.value);
    var err = VALIDATORS.zip(z);
    if (err) { showError(err); return; }
    goBtn.disabled = true; goBtn.textContent = '住所を検索中…';
    answers.zip = z;

    var found = null;
    try {
      var res = await fetch(CFG.zipApi + z);
      var j = await res.json();
      if (j && j.results && j.results[0]) {
        found = { pref: j.results[0].address1, city: (j.results[0].address2 || '') + (j.results[0].address3 || '') };
      }
    } catch (e) { /* API失敗時は手入力にフォールバック */ }

    clearCards();
    userBubble('〒' + z.slice(0, 3) + '-' + z.slice(3), 'zip');
    if (!editMode) { doneCount++; progress(); }
    track('step_zip');

    if (found) {
      prefill.pref = found.pref;
      prefill.addr1 = found.city;
      botBubble('「' + found.pref + found.city + '」ですね！\n番地・建物名をご入力ください✨');
    }
    next(i);
  });
  zipIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goBtn.click(); } });
  /* 7桁入力されたら「次へ」を押さなくても自動で住所検索して進む */
  var autoFired = false;
  zipIn.addEventListener('input', function () {
    if (autoFired) return;
    var z = NORMS.zip(zipIn.value);
    if (/^\d{7}$/.test(z)) { autoFired = true; goBtn.click(); }
  });
  maybeFocus(zipIn);
}

async function renderSummary(s) {
  progress();
  /* タグの summaryOptions でシナリオ設定を上書きできる(LP個別・push不要) */
  var so = CFG.summaryOptions || {};
  var sumMsg = so.msg != null ? so.msg : s.msg;
  /* 口上は出さず、いきなり最終確認カードを表示する(msgを設定した場合のみ発話) */
  if (editReturned) botBubble('修正を反映しました✅');
  else if (sumMsg) botBubble(sumMsg);
  editReturned = false;

  /* 確認画面を出す前にLPフォームへ先に転記する。
     これによりecforceが実計算した注文内容テーブル(qa-*)が描画され、
     本物の合計額・特商法文を確認画面に表示できる(手数料の変動等も反映) */
  var localForm = CFG.transferMode !== 'redirect' ? findLocalForm() : null;
  if (localForm) {
    var t = typing();
    try { resolveSkips(); fillLocalForm(localForm); prefilled = true; } catch (e) {}
    /* ecforceのAJAX再計算を待つ。qa-totalが描画されるまで最大4.5秒ポーリングし、
       その間ecforceの再描画で支払いセレクトが初期値に戻されていたら黙って直す */
    var waited = 0;
    while (waited < 4500) {
      await delay(400); waited += 400;
      var selP = localForm.querySelector('[name="order[payment_attributes][payment_method_id]"]');
      if (selP && answers.payment && selP.value !== answers.payment) selP.value = answers.payment;
      if (qaText('total')) break;
    }
    t.remove();
  }
  var rows = '';
  /* ご注文内容: ecforceの注文内容テーブル(qa-*)から自動取得。
     商品・価格・オファーが変わってもタグ/シナリオの修正なしで追従する
     (タグで summaryOptions: { showOrderInfo: false } にすると非表示にできる) */
  var os = so.showOrderInfo === false ? null : readOrderSummary();
  if (os) {
    if (os.product) rows += '<tr class="ro"><td>商品</td><td>' + esc(os.product) + '</td><td></td></tr>';
    if (os.unit) rows += '<tr class="ro"><td>単価</td><td>' + esc(os.unit) + (os.qty ? '　× ' + esc(os.qty) : '') + '</td><td></td></tr>';
    if (os.subtotal) rows += '<tr class="ro"><td>小計</td><td>' + esc(os.subtotal) + '</td><td></td></tr>';
    if (os.ship) rows += '<tr class="ro"><td>送料</td><td>' + esc(os.ship) + '</td><td></td></tr>';
    if (os.charge) rows += '<tr class="ro"><td>手数料</td><td>' + esc(os.charge) + '</td><td></td></tr>';
    if (os.tax) rows += '<tr class="ro"><td>消費税</td><td>' + esc(os.tax) + '</td><td></td></tr>';
    rows += '<tr class="ro tot"><td>合計</td><td>' + esc(os.total) + '</td><td></td></tr>';
  } else {
    /* テーブルが無いLPでは従来のフォールバック表示 */
    var prod = CFG.vars.PRODUCT || readProductName();
    var qty = readQty();
    if (prod) rows += '<tr class="ro"><td>商品</td><td>' + esc(prod) + (qty && qty !== '1' ? '　× ' + esc(qty) : '') + '</td><td></td></tr>';
    if (CFG.vars.PRICE) rows += '<tr class="ro"><td>価格</td><td>' + esc(CFG.vars.PRICE) + '</td><td></td></tr>';
  }
  ['name_full', 'kana_full', 'name_last', 'name_first', 'kana_last', 'kana_first', 'email', 'tel', 'password', 'sex', 'birthdate', 'zip', 'pref', 'addr1', 'addr2'].forEach(function (k) {
    if (!answers[k]) return;
    var v = k === 'password' ? '••••••••' : answers[k];
    if (k === 'zip') v = '〒' + v.slice(0, 3) + '-' + v.slice(3);
    if (k === 'sex') v = answers.sex_label || v;
    rows += '<tr data-k="' + k + '"><td>' + LABELS[k] + '</td><td>' + esc(v) + '</td><td class="ed">✎</td></tr>';
  });
  if (answers.payment_label) rows += '<tr data-k="payment"><td>' + LABELS.payment + '</td><td>' + esc(answers.payment_label) + '</td><td class="ed">✎</td></tr>';
  /* カードはマスク表示(クレジット選択時のみ) */
  if (answers.card_number && (answers.payment_label || '').indexOf('クレジット') >= 0) {
    rows += '<tr data-k="card"><td>' + LABELS.card + '</td><td>**** **** **** ' + esc(answers.card_number.slice(-4))
      + '（' + esc(answers.card_month) + '/20' + esc(answers.card_year) + '）</td><td class="ed">✎</td></tr>';
  }

  /* 利用規約の同意チェック(確定ボタンの上)。
     agree: true=表示・チェック済(既定) / 'unchecked'=未チェックで開始 / false=非表示 */
  var agreeShow = so.agree !== false;
  var agreeChecked = so.agree !== 'unchecked';
  var agreeHtml = '';
  if (agreeShow) {
    var at = esc(so.agreeText || CFG.agreeText).replace(/\n/g, '<br>');
    if (CFG.agreeLink) {
      at = at.replace('利用規約', '<a href="' + esc(CFG.agreeLink) + '" target="_blank" rel="noopener">利用規約</a>');
    }
    agreeHtml = '<label class="agree"><input type="checkbox" id="hs-agree"' + (agreeChecked ? ' checked' : '') + '><span>' + at + '</span></label>';
  }

  var card = document.createElement('div');
  card.className = 'sum';
  card.innerHTML = '<table>' + rows + '</table>'
    /* 特商法・定期条件の注意喚起(ecforceのqa-cautionを転記。最終確認画面の表示義務対応。
       タグで summaryOptions: { showLaw: false } にすると非表示にできる) */
    + (os && os.caution && so.showLaw !== false ? '<div class="law">' + esc(os.caution).replace(/\n/g, '<br>') + '</div>' : '')
    + agreeHtml
    + '<button class="go">' + esc(so.submitLabel || s.submitLabel || '注文フォームへ進む →') + '</button>';

  if (so.modal) {
    /* form-plus風: チャット窓に重なるモーダルで確認画面を出す
       (タグで summaryOptions: { modal: true }) */
    var container = msgsEl.parentElement;
    var ov = document.createElement('div');
    ov.className = 'modal-ov';
    var mc = document.createElement('div');
    mc.className = 'modal-card';
    mc.innerHTML = '<div class="modal-hd"><span>ご注文内容の確認</span><button class="modal-x" aria-label="閉じる">×</button></div>';
    mc.appendChild(card);
    ov.appendChild(mc);
    container.appendChild(ov);
    mc.querySelector('.modal-x').addEventListener('click', function () { ov.remove(); });
    /* チャット側には再オープン用ボタンを置いておく(✕で閉じた時用) */
    var reW = document.createElement('div');
    reW.className = 'choices';
    var reB = document.createElement('button');
    reB.className = 'ch';
    reB.textContent = 'ご注文内容を確認する →';
    reB.addEventListener('click', function () { container.appendChild(ov); });
    reW.appendChild(reB);
    msgsEl.appendChild(reW); scrollBottom();
  } else {
    msgsEl.appendChild(card); scrollBottom();
    /* 確認カードは高さがあるため、描画後にもう一度確実にスクロールする(見落とし防止) */
    setTimeout(function () {
      scrollBottom();
      try { card.scrollIntoView({ block: 'end' }); } catch (e) {}
    }, 400);
  }
  track('summary_view');
  /* 行タップ → その項目だけ修正 */
  card.querySelector('table').addEventListener('click', function (e) {
    var tr = e.target && e.target.closest ? e.target.closest('tr[data-k]') : null;
    if (tr) startEdit(tr.getAttribute('data-k'));
  });
  /* 同意チェックが外れている間は確定ボタンを押せない */
  var goEl = card.querySelector('.go');
  var agreeEl = card.querySelector('#hs-agree');
  chatAgreeChecked = agreeEl ? agreeEl.checked : null;
  if (agreeEl) {
    goEl.disabled = !agreeEl.checked;
    agreeEl.addEventListener('change', function () {
      chatAgreeChecked = agreeEl.checked;
      goEl.disabled = !agreeEl.checked;
    });
  }
  goEl.addEventListener('click', function () {
    this.textContent = '転送中…'; this.disabled = true;
    transfer();
  });
}

/* ---------- ecforce への転記 ----------
   【モードA: LP内フォーム直接入力(推奨・既定)】
     ecforceのLP一体型注文フォーム(action=/lp)がこのページにあれば、
     そこへ直接入力してスクロール誘導する。スクリプト設置不要。
     フィールド名は 2026-07-05 に hugskin.shop/lp?u=ug29_test の実フォームで照合済:
       order[billing_address_attributes][name01/kana01/zip01/prefecture_id/addr01/addr02/tel01]
       order[email] / order[customer_attributes][email/password/sex_id/birth(1i)(2i)(3i)]
       order[payment_attributes][payment_method_id](select・値は数値ID)
     ※カード番号・後払い同意チェックは扱わない(お客様自身がフォームで入力/同意)
   【モードB: リダイレクト(フォールバック)】
     LP内にフォームが無い場合、ecforceOrderUrl へURLパラメータ付き遷移。
     遷移先に ecforce/orders_new_autofill.html の設置が必要。 */
function randStr(n) {
  var chars = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
/* skip項目をダミー値で補完する（質問はしていないが、ecforce側で必須の項目を埋める）
   - 'auto'    … password=ランダム / email=毎回ユニークなダミー（固定にすると
                 ecforceで同一顧客に注文が束ねられ2件目以降が事故るため必ずユニーク化）
   - '{RAND}'  … 値の中のこのトークンをユニーク文字列に置換
                 例 'guest+{RAND}@hugskin.jp' */
function resolveSkips() {
  var uniq = Date.now().toString(36) + randStr(4);
  for (var key in SKIP) {
    if (answers[key]) continue;   // 何らかの理由で回答済みなら上書きしない
    var v = SKIP[key];
    if (v === 'auto') {
      if (key === 'password')       v = 'Hs' + randStr(10);
      else if (key === 'email')     v = 'hs-' + uniq + '@example.com';
      else if (key === 'tel')       v = '09000000000';
      else if (key === 'birthdate') v = '1990/01/01';
      else v = '';
    }
    v = String(v).replace(/\{RAND\}/g, uniq);
    if (key === 'tel' || key === 'zip') v = NORMS.zip(v);
    if (key === 'birthdate') v = NORMS.birth(v);
    answers[key] = v;
  }
}

function findLocalForm() {
  var el = document.querySelector('[name="order[billing_address_attributes][name01]"]');
  return el ? (el.form || el.closest('form')) : null;
}

/* フィールドへ値を設定。
   ⚠️イベントは最小限にする: ecforceはchangeイベントでAJAX再計算・セクション再描画を
   行うため、全項目でchangeを乱発するとAJAXが競合してセレクトが初期値に巻き戻る
   (2026-07-05 支払い方法が21に戻る実障害の原因)。
   テキスト系はinputのみ、select系のみchangeを発火する */
function setField(scope, name, val) {
  if (val == null || val === '') return;
  var el = scope.querySelector('[name="' + name + '"]');
  if (!el) return;
  el.value = val;
  var ev = el.tagName === 'SELECT' ? 'change' : 'input';
  el.dispatchEvent(new Event(ev, { bubbles: true }));
}
/* イベントを一切発火させずに値だけ入れる(送信直前の再固定用) */
function setSilent(scope, name, val) {
  if (val == null || val === '') return;
  var el = scope.querySelector('[name="' + name + '"]');
  if (el) el.value = val;
}

/* silent=true にするとイベントを一切発火させず値だけ入れる。
   (送信直前の最終固定用。ecforceのAJAX再描画による値の巻き戻し対策) */
function fillLocalForm(form, silent) {
  var put = silent ? setSilent : setField;
  /* 氏名・カナは半角スペース区切り(実フォームのplaceholder「山田 花子」「ヤマダ ハナコ」に準拠) */
  var join = function (a, b) { return [a, b].filter(Boolean).join(' '); };
  var nameVal = answers.name_full || join(answers.name_last, answers.name_first);
  var kanaVal = answers.kana_full || join(answers.kana_last, answers.kana_first);
  put(form, 'order[billing_address_attributes][name01]', nameVal ? NORMS.nameSpace(nameVal) : '');
  put(form, 'order[billing_address_attributes][kana01]', kanaVal ? NORMS.kana(kanaVal) : '');
  put(form, 'order[billing_address_attributes][zip01]', answers.zip);
  if (answers.pref) {
    var prefId = PREFS.indexOf(answers.pref) + 1;   // PREFS はJISコード順 → index+1 = prefecture_id
    if (prefId > 0) put(form, 'order[billing_address_attributes][prefecture_id]', String(prefId));
  }
  put(form, 'order[billing_address_attributes][addr01]', answers.addr1);
  put(form, 'order[billing_address_attributes][addr02]', answers.addr2);
  put(form, 'order[billing_address_attributes][tel01]', answers.tel);
  put(form, 'order[email]', answers.email);
  put(form, 'order[customer_attributes][email]', answers.email);
  put(form, 'order[customer_attributes][password]', answers.password);
  put(form, 'order[customer_attributes][sex_id]', answers.sex);
  if (answers.birthdate) {
    var b = answers.birthdate.split('/');
    put(form, 'order[customer_attributes][birth(1i)]', String(+b[0]));
    put(form, 'order[customer_attributes][birth(2i)]', String(+b[1]));  // selectの値はゼロ埋めなし
    put(form, 'order[customer_attributes][birth(3i)]', String(+b[2]));
  }
  put(form, 'order[payment_attributes][payment_method_id]', answers.payment);

  /* カード情報(クレジット選択時のみ)。LP内のVeriTransフォーム欄への直接転記のみで
     外部送信・URLパラメータ化は一切しない */
  if (answers.card_number && (answers.payment_label || '').indexOf('クレジット') >= 0) {
    put(form, 'order[payment_attributes][source_attributes][number]', answers.card_number);
    put(form, 'order[payment_attributes][source_attributes][month]', answers.card_month);
    put(form, 'order[payment_attributes][source_attributes][year]', answers.card_year);
    put(form, 'order[payment_attributes][source_attributes][name]', answers.card_name);
    var sec = form.querySelector('[name="order[payment_attributes][source_attributes][security_code]"]');
    if (sec && answers.card_sec) put(form, 'order[payment_attributes][source_attributes][security_code]', answers.card_sec);
  }
  /* 後払い同意チェックは意図的に触らない(お客様自身が同意する) */

  if (silent) return;

  /* ecforce側のJS(郵便番号自動補完・AJAX再描画)が非同期で
     住所欄をクリアしたり支払いセレクトを初期値に戻したりするため、
     少し待ってから値だけをサイレント再セットする(イベント発火なし=AJAX再誘発なし) */
  setTimeout(function () { fillLocalForm(form, true); }, 900);
}

/* 転記も例外時に無言で止まらないようにする */
function transfer() {
  try {
    transferInner();
  } catch (err) {
    try {
      if (window.dataLayer) window.dataLayer.push({ event: 'hs_chat_error', hs_error: 'transfer: ' + String((err && err.message) || err).slice(0, 200) });
      if (window.clarity) window.clarity('event', 'hs_chat_error');
    } catch (e2) {}
    botBubble('申し訳ありません、転記中にエラーが発生しました🙏\nお手数ですが、下のフォームから直接ご注文いただくか、\nページを再読み込みしてもう一度お試しください');
    var sbtn = wrap.querySelector('.sum .go');
    if (sbtn) { sbtn.disabled = false; sbtn.textContent = 'もう一度試す →'; }
  }
}

function transferInner() {
  resolveSkips();

  /* モードA: LP内フォームへ直接入力 */
  var localForm = CFG.transferMode !== 'redirect' ? findLocalForm() : null;
  if (localForm) {
    /* 確認画面表示時に先行転記済みならイベント再発火を避ける(AJAX競合防止)。
       未転記(リダイレクト設定変更等)の場合のみ通常転記 */
    if (!prefilled) fillLocalForm(localForm);
    track('fill_local');
    var sbtn = wrap.querySelector('.sum .go');

    /* 後払いで同意チェックが表示されている場合は自動送信せず、チェックをお願いする */
    var consentEl = localForm.querySelector('[name="order[payment_attributes][source_attributes][consent]"]');
    var isCredit = (answers.payment_label || '').indexOf('クレジット') >= 0;
    var needsConsent = !isCredit && consentEl && !consentEl.checked && !!consentEl.offsetParent;

    if (CFG.autoSubmit && !needsConsent) {
      if (sbtn) sbtn.textContent = '送信しています…';
      botBubble('ありがとうございます！\nご注文を送信しています✨');
      track('auto_submit');
      setTimeout(function () {
        /* クリックと同じtickで全値をサイレント最終固定
           (この間にecforceのAJAXは割り込めない=巻き戻された値でも確実に直る) */
        try { fillLocalForm(localForm, true); } catch (e) {}
        /* チャットの確認画面で利用規約に同意済みなら、LP側の同意チェックにも反映する
           (お客様が明示的にチェックした同意の転記。チャット側が未表示/未同意なら触らない) */
        try {
          if (chatAgreeChecked === true) {
            var lpAgree = localForm.querySelector('input[name="agree"]');
            if (lpAgree && !lpAgree.checked) {
              lpAgree.checked = true;
              lpAgree.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        } catch (e2) {}
        var submit = localForm.querySelector('input[type=submit], button[type=submit]');
        if (submit) submit.click(); else localForm.submit();
      }, prefilled ? 500 : 1300);
      return;
    }

    if (sbtn) sbtn.textContent = '反映しました ✅';
    botBubble(needsConsent
      ? 'ご入力内容を注文フォームに反映しました✅\nフォームの「後払いの同意」にチェックを入れて、\n注文ボタンを押してください✨'
      : 'ご入力内容をこのページの注文フォームに反映しました✅\nフォームの内容をご確認のうえ、そのままお手続きを完了してください✨');
    setTimeout(function () {
      localForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (CFG.mode === 'float') setTimeout(closePanel, 600);
    }, 1400);
    return;
  }

  /* モードB: リダイレクト */
  var p = new URLSearchParams();
  /* ⚠️ リダイレクトモードではカード情報は絶対にURLに載せない */
  if (answers.name_full)  p.set('order[billing_address][name01]', NORMS.nameSpace(answers.name_full));
  if (answers.name_last)  p.set('order[billing_address][name01]', answers.name_last);
  if (answers.name_first) p.set('order[billing_address][name02]', answers.name_first);
  if (answers.email)      p.set('order[email]', answers.email);
  if (answers.password)   p.set('order[password]', answers.password);
  if (answers.tel) {
    var tel = answers.tel;
    p.set('order[billing_address][tel01]', tel.slice(0, 3));
    p.set('order[billing_address][tel02]', tel.slice(3, 7));
    p.set('order[billing_address][tel03]', tel.slice(7));
  }
  if (answers.birthdate) {
    var b = answers.birthdate.split('/');
    p.set('order[customer][birth_year]', b[0]);
    p.set('order[customer][birth_month]', b[1]);
    p.set('order[customer][birth_day]', b[2]);
  }
  if (answers.zip) {
    p.set('order[billing_address][zipcode01]', answers.zip.slice(0, 3));
    p.set('order[billing_address][zipcode02]', answers.zip.slice(3));
  }
  if (answers.pref)  p.set('order[billing_address][pref]', answers.pref);
  if (answers.addr1) p.set('order[billing_address][addr01]', answers.addr1);
  if (answers.addr2) p.set('order[billing_address][addr02]', answers.addr2);
  if (answers.payment) p.set('order[payment_kind]', answers.payment);
  p.set('from_chatbot', '1');
  track('submit');
  window.location.href = CFG.ecforceOrderUrl + '?' + p.toString();
}

/* ---------- 起動 ---------- */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

})();
