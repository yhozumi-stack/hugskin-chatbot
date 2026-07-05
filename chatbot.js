/*! ============================================================
    HugSkin 獲得チャットボット v3.3.0
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
    PRODUCT: 'HugSkin C10 ALL IN SERUM',
    PRICE:   '初回限定価格',
    OFFER:   '初回限定',
  },
  skip: {},                        // 質問せず転記だけする項目（LPごとにタグで設定）
                                   //   例 { tel:'09000000000', password:'auto', birthdate:'1990/01/01' }
                                   //   'auto'=自動生成(password/email) '{RAND}'=ユニーク文字列に置換
                                   //   → 詳細は CLAUDE.md レシピ9
  mode: 'float',                   // 'float'=フローティング / 'inline'=LP内に埋め込み
  inlineSelector: '#hs-chat',      // inline のとき描画する要素
  autoOpen: 'immediate',           // 'immediate' / 'scroll30'(30%スクロールで) / 'delay3000'(3秒後) / 'manual'
  opening: {
    image: '',                     // 冒頭に出す画像URL（空なら出さない）
    stockCheck: true,              // 「ご案内枠を確認中…」演出のON/OFF
    stockGifUrl: '',               // 演出をGIF画像にしたい場合のURL（空ならスピナー）
    stockTextChecking: '🔍 ご案内枠を確認しています…',
    stockTextDone: '✅ {{OFFER}}のご案内枠を確保しました！\nこのままお手続きにお進みください',
  },
  theme: {
    brand: '#C8869A', brandDark: '#a86880', brandLight: '#f9f1f4',
  },
  title: 'お申し込みサポート',
  subtitle: 'かんたん注文チャット（約1分）',
  launcherText: '💬 かんたん注文はこちら',
  typingMs: 120,                   // ボット発話前の「間」。0で完全即時
  /* 転記モード:
     'auto'     = LP内にecforce注文フォームがあれば直接入力(推奨・スクリプト設置不要)、
                  なければ ecforceOrderUrl へリダイレクト
     'redirect' = 常にリダイレクト(カート型ページ用) */
  transferMode: 'auto',
  ecforceOrderUrl: 'https://hugskin.shop/shop/orders/new',
  loginUrl: 'https://hugskin.shop/shop/customers/sign_in',  // 会員向けログイン画面
  paymentChoices: null,            // 支払い選択肢の手動指定(通常はLPフォームから自動生成されるので不要)
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

/* {{KEY}} を CFG.vars で置換 */
function tpl(s) {
  return String(s).replace(/\{\{(\w+)\}\}/g, function (_, k) {
    return (CFG.vars && CFG.vars[k] != null) ? CFG.vars[k] : '';
  });
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
     choice       … ボタン選択
     card         … クレジットカード入力（支払いがクレジット系の時だけ自動表示）
     summary      … 確認画面→ecforceへ転記
   fields の項目定義:
     key(必須) label placeholder inputType inputmode autocomplete
     optional:true（空でもOK） validate(値→エラー文 or null) norm(正規化関数名)
     autokanaFrom:'他のkey' … その欄に漢字を打つとフリガナが自動で入る
   文言(intro/msg/label/placeholder)はすべて自由に書き換えてOK
   ============================================================ */
var SCENARIOS = {

  standard: [
    { type: 'stock' },
    { type: 'openingImage' },
    { type: 'msg',
      msg: 'こんにちは！✨\n{{PRODUCT}}の\nかんたん注文チャットです。\nただいま{{PRICE}}でご案内中です🎁' },

    /* 会員判定: 登録済みメールでは新規注文できないため、会員はログインへ誘導 */
    { type: 'choice', key: 'first_time', intro: 'HugSkinのご利用は初めてですか？',
      choices: [
        { label: 'はじめて利用します', value: 'first' },
        { label: '会員です（2回目以降）', value: 'member' },
      ],
      memberMsg: '会員の方はログインしてからのご注文がスムーズです✨\n（ご登録済みのメールアドレスでは、新規のお客様用フォームからはご注文いただけません）' },

    /* お名前+フリガナ 1カード。漢字を入力するとフリガナが自動で入る(autokana) */
    { type: 'fields', key: 'name', intro: 'まず、お名前を教えてください', layout: 'stack',
      fields: [
        { key: 'name_full', label: 'お名前（漢字）', placeholder: '例：山田 花子',
          autocomplete: 'name', validate: 'required', norm: 'nameSpace' },
        { key: 'kana_full', label: 'フリガナ（カタカナ）', placeholder: '例：ヤマダ ハナコ',
          validate: 'kana', norm: 'kana', autokanaFrom: 'name_full' },
      ] },

    { type: 'fields', key: 'contact', intro: 'ご連絡先を教えてください', layout: 'stack',
      fields: [
        { key: 'email', label: 'メールアドレス', placeholder: '例：hanako@example.com',
          inputType: 'email', inputmode: 'email', autocomplete: 'email', validate: 'email' },
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

    { type: 'fields', key: 'birth', intro: '生年月日を教えてください', layout: 'stack',
      fields: [
        { key: 'birthdate', label: '生年月日', placeholder: '例：19900115 または 1990/01/15',
          inputmode: 'numeric', validate: 'birth', norm: 'birth' },
      ] },

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

    { type: 'summary',
      msg: 'ご入力ありがとうございます！\n内容をご確認ください ✅',
      submitLabel: 'この内容で注文フォームへ進む →' },
  ],

};

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
var editMode = false;      // 確認画面からの「その項目だけ修正」中か
var editReturned = false;  // 修正から確認画面に戻ってきた直後か（メッセージ切替用）
var totalInput = steps.filter(function (s) {
  return s.type === 'fields' || s.type === 'zip' || s.type === 'choice' || s.type === 'card';
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
+ '.inline-box .msgs{max-height:none;overflow:visible}'
+ '.row{display:flex;align-items:flex-end;gap:8px;animation:hsUp .18s ease both}'
+ '.row.user{flex-direction:row-reverse}'
+ '@keyframes hsUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}'
+ '.av{width:28px;height:28px;border-radius:50%;background:' + CFG.theme.brand + ';display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;margin-bottom:2px}'
+ '.bb{max-width:80%;padding:9px 13px;line-height:1.6;font-size:13.5px;word-break:break-word;white-space:pre-wrap}'
+ '.bb.bot{background:#fff;color:#3a2a30;border-radius:3px 12px 12px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}'
+ '.bb.user{background:' + CFG.theme.brand + ';color:#fff;border-radius:12px 3px 12px 12px}'
+ '.bb img{max-width:100%;border-radius:8px;display:block}'
+ '.img-bb{max-width:88%;padding:4px;background:#fff;border-radius:3px 12px 12px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}'
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
+ '.sum tr[data-k]{cursor:pointer}'
+ '.sum tr[data-k]:active td{background:#faf3f6}'
+ '.sum td.ed{color:' + CFG.theme.brand + ';width:28px;text-align:center;font-size:13px}'
+ '.sum .go{width:calc(100% - 20px);margin:10px}';

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
  container.innerHTML = ''
    + '<div class="hd">'
    +   '<div class="hd-av">💬</div>'
    +   '<div><div class="hd-name">' + CFG.title + '</div><div class="hd-sub">' + CFG.subtitle + '</div></div>'
    +   (withClose ? '<button class="hd-close" aria-label="閉じる">×</button>' : '')
    + '</div>'
    + '<div class="pg"><div class="pg-fill"></div></div>'
    + '<div class="msgs"></div>';
  msgsEl = container.querySelector('.msgs');
  pgFill = container.querySelector('.pg-fill');
  var close = container.querySelector('.hd-close');
  if (close) close.addEventListener('click', closePanel);
  container.addEventListener('pointerdown', function () { interacted = true; }, true);
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
  launcherEl = document.createElement('button');
  launcherEl.className = 'launcher';
  launcherEl.textContent = CFG.launcherText;
  launcherEl.addEventListener('click', function () { interacted = true; openPanel(); });
  wrap.appendChild(launcherEl);

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
  /* LP内の任意の要素から開けるフック: <a data-hs-open>今すぐ注文</a> */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-hs-open]');
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
function botBubble(text) {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<div class="av">💬</div><div class="bb bot">' + esc(tpl(text)).replace(/\n/g, '<br>') + '</div>';
  msgsEl.appendChild(row); scrollBottom();
}
function userBubble(text) {
  var row = document.createElement('div');
  row.className = 'row user';
  row.innerHTML = '<div class="bb user">' + esc(text) + '</div>';
  msgsEl.appendChild(row); scrollBottom();
}
function typing() {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<div class="av">💬</div><div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
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
  }
  return -1;
}
function summaryIndex() {
  for (var i = 0; i < steps.length; i++) if (steps[i].type === 'summary') return i;
  return steps.length;
}

/* ステップ完了後の遷移。通常は次へ、修正モードなら確認画面へ直帰する。
   例外: 郵便番号を修正した時は住所確認ステップを挟んでから確認画面へ戻る */
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
    /* 支払いをクレジットに変更した場合はカード入力(未入力なら)を挟む */
    if (s.key === 'payment' && (answers.payment_label || '').indexOf('クレジット') >= 0
        && !answers.card_number && stepIndexByKey('card') >= 0) {
      runStep(stepIndexByKey('card'));
      return;
    }
    editMode = false;
    editReturned = true;
    runStep(summaryIndex());
    return;
  }
  runStep(i + 1);
}

/* 確認画面の行タップ → その項目のステップだけ再表示(現在値プリフィル) */
function startEdit(key) {
  var idx = stepIndexByKey(key);
  if (idx < 0) return;
  editMode = true;
  var s = steps[idx];
  if (s.type === 'fields') {
    s.fields.forEach(function (f) { if (answers[f.key] != null) prefill[f.key] = answers[f.key]; });
  }
  if (s.type === 'zip' && answers.zip) prefill.zip = answers.zip;
  if (s.type === 'card') {
    ['card_number', 'card_month', 'card_year', 'card_name'].forEach(function (k) {
      if (answers[k] != null) prefill[k] = answers[k];
    });
  }
  var sumEl = msgsEl.querySelector('.sum');
  if (sumEl) sumEl.remove();
  track('edit_' + key);
  runStep(idx);
}

async function runStep(i) {
  current = i;
  if (i >= steps.length) return;
  var s = steps[i];

  /* --- 演出系 --- */
  if (s.type === 'stock') {
    if (!CFG.opening.stockCheck) return runStep(i + 1);
    var row = document.createElement('div');
    row.className = 'row';
    if (CFG.opening.stockGifUrl) {
      row.innerHTML = '<div class="av">💬</div><div class="img-bb"><img src="' + esc(CFG.opening.stockGifUrl) + '" alt=""></div>';
    } else {
      row.innerHTML = '<div class="av">💬</div><div class="stock"><div class="spin"></div><span>' + esc(tpl(CFG.opening.stockTextChecking)) + '</span></div>';
    }
    msgsEl.appendChild(row); scrollBottom();
    await delay(900);
    row.remove();
    botBubble(CFG.opening.stockTextDone);
    return runStep(i + 1);
  }
  if (s.type === 'openingImage') {
    if (CFG.opening.image) imgBubble(CFG.opening.image);
    return runStep(i + 1);
  }
  if (s.type === 'image') {
    if (s.src) imgBubble(s.src);
    return runStep(i + 1);
  }
  if (s.type === 'msg') {
    var t0 = typing(); await delay(CFG.typingMs); t0.remove();
    botBubble(s.msg);
    return runStep(i + 1);
  }
  /* カードステップは支払いがクレジット系の時だけ表示 */
  if (s.type === 'card' && (answers.payment_label || '').indexOf('クレジット') < 0) {
    return editMode ? next(i) : runStep(i + 1);
  }

  /* --- 入力系 --- */
  var t = typing(); await delay(CFG.typingMs); t.remove();

  if (s.type === 'choice') return renderChoice(s, i);
  if (s.type === 'zip')    return renderZip(s, i);
  if (s.type === 'fields') return renderFields(s, i);
  if (s.type === 'card')   return renderCard(s, i);
  if (s.type === 'summary') return renderSummary(s);
}

function imgBubble(src) {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<div class="av">💬</div><div class="img-bb"><img src="' + esc(src) + '" alt=""></div>';
  msgsEl.appendChild(row); scrollBottom();
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
  botBubble(s.intro);
  var wrapC = document.createElement('div');
  wrapC.className = 'choices';
  var choiceList = (s.key === 'payment' && (paymentChoicesFromPage() || CFG.paymentChoices)) || s.choices;
  choiceList.forEach(function (c) {
    var b = document.createElement('button');
    b.className = 'ch';
    b.textContent = c.label;
    b.addEventListener('click', function () {
      clearCards();
      answers[s.key] = c.value;
      answers[s.key + '_label'] = c.label;
      userBubble(c.label);
      if (!editMode) { doneCount++; progress(); }
      track('step_' + s.key);
      /* 会員(登録済みメール)の場合はログイン導線を出す */
      if (s.key === 'first_time' && c.value === 'member') return renderLoginGuide(s, i);
      next(i);
    });
    wrapC.appendChild(b);
  });
  msgsEl.appendChild(wrapC); scrollBottom();
}

/* 会員向けログイン誘導(登録済みメールは新規フォームでecforceに弾かれるため) */
function renderLoginGuide(s, i) {
  botBubble(s.memberMsg || '会員の方はログインしてからのご注文がスムーズです✨');
  var wrapC = document.createElement('div');
  wrapC.className = 'choices';
  var loginBtn = document.createElement('button');
  loginBtn.className = 'ch';
  loginBtn.textContent = 'ログイン画面を開く';
  loginBtn.addEventListener('click', function () {
    track('login_open');
    window.open(CFG.loginUrl, '_blank');
    botBubble('ログイン後、このページに戻って\nそのままフォームからご注文いただけます✨\nこのまま入力を続けることもできます');
    scrollBottom();
  });
  var contBtn = document.createElement('button');
  contBtn.className = 'ch';
  contBtn.textContent = 'このまま入力を続ける';
  contBtn.addEventListener('click', function () {
    clearCards();
    userBubble('このまま入力を続ける');
    track('login_skip');
    next(i);
  });
  wrapC.appendChild(loginBtn);
  wrapC.appendChild(contBtn);
  msgsEl.appendChild(wrapC); scrollBottom();
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
  botBubble(s.intro);
  var card = document.createElement('div');
  card.className = 'card';
  var inner = s.fields.map(function (f, idx) {
    return '<div class="fld"><label>' + esc(f.label) + '</label>' + fieldInputHtml(f, idx) + '</div>';
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

  /* autokana: 漢字を入力するとフリガナ欄が自動で埋まる */
  s.fields.forEach(function (f, idx) {
    if (!f.autokanaFrom) return;
    var srcIdx = -1;
    s.fields.forEach(function (x, xi) { if (x.key === f.autokanaFrom) srcIdx = xi; });
    if (srcIdx >= 0) attachAutokana(card.querySelector('#f' + srcIdx), card.querySelector('#f' + idx));
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
    userBubble(shown.join('　'));
    if (!editMode) { doneCount++; progress(); }
    track('step_' + s.key);
    next(i);
  });

  var inputs = card.querySelectorAll('input,select');
  inputs.forEach(function (inp, idx) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (idx < inputs.length - 1) inputs[idx + 1].focus();
        else goBtn.click();
      }
    });
  });
  maybeFocus(card.querySelector('input,select'));
}

/* 漢字入力中のIME変換前の「よみ」を拾ってフリガナ欄に自動転記する。
   仕組み: IME変換中(composition中)のひらがな状態を記録し、確定時に追記。
   ユーザーがフリガナ欄を直接編集したら自動転記は停止する。 */
function attachAutokana(src, dst) {
  if (!src || !dst) return;
  var fixed = '';    // 確定済みのよみ
  var pending = '';  // 変換中のよみ(ひらがな)
  var manual = false;
  dst.addEventListener('input', function () { manual = true; });
  src.addEventListener('compositionupdate', function (e) {
    var d = e.data || '';
    if (d && /^[ぁ-ゖー\s　]+$/.test(d)) pending = d;
  });
  src.addEventListener('compositionend', function () {
    if (pending && !manual) {
      fixed = (fixed + ' ' + pending).trim();
      dst.value = NORMS.kana(fixed);
    }
    pending = '';
  });
  src.addEventListener('input', function () {
    if (!src.value) { fixed = ''; pending = ''; if (!manual) dst.value = ''; }
  });
}

/* クレジットカード入力カード。
   ⚠️ カード情報は確認画面ではマスク表示、リダイレクトモードでは絶対に送らない。
   LP内フォームのカード欄(VeriTrans)に直接転記するだけで、外部送信は一切しない。 */
function renderCard(s, i) {
  botBubble(s.intro);
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
    userBubble('カード末尾 ' + num.slice(-4) + '　' + mo + '/20' + yr);
    if (!editMode) { doneCount++; progress(); }
    track('step_card');  /* 値は絶対に送らない */
    next(i);
  });
  maybeFocus(card.querySelector('#cc-num'));
}

function renderZip(s, i) {
  botBubble(s.intro);
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
    userBubble('〒' + z.slice(0, 3) + '-' + z.slice(3));
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
  maybeFocus(zipIn);
}

async function renderSummary(s) {
  progress();
  botBubble(editReturned
    ? '修正を反映しました✅\nもう一度ご確認ください\n（行をタップするとその項目だけ修正できます）'
    : s.msg + '\n（行をタップするとその項目だけ修正できます）');
  editReturned = false;
  var rows = '';
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

  var card = document.createElement('div');
  card.className = 'sum';
  card.innerHTML = '<table>' + rows + '</table><button class="go">' + esc(s.submitLabel || '注文フォームへ進む →') + '</button>';
  msgsEl.appendChild(card); scrollBottom();
  track('summary_view');
  /* 行タップ → その項目だけ修正 */
  card.querySelector('table').addEventListener('click', function (e) {
    var tr = e.target && e.target.closest ? e.target.closest('tr[data-k]') : null;
    if (tr) startEdit(tr.getAttribute('data-k'));
  });
  card.querySelector('.go').addEventListener('click', function () {
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

function setField(scope, name, val) {
  if (val == null || val === '') return;
  var el = scope.querySelector('[name="' + name + '"]');
  if (!el) return;
  el.value = val;
  ['input', 'change'].forEach(function (ev) { el.dispatchEvent(new Event(ev, { bubbles: true })); });
}

function fillLocalForm(form) {
  /* 氏名・カナは半角スペース区切り(実フォームのplaceholder「山田 花子」「ヤマダ ハナコ」に準拠) */
  var join = function (a, b) { return [a, b].filter(Boolean).join(' '); };
  var nameVal = answers.name_full || join(answers.name_last, answers.name_first);
  var kanaVal = answers.kana_full || join(answers.kana_last, answers.kana_first);
  setField(form, 'order[billing_address_attributes][name01]', nameVal ? NORMS.nameSpace(nameVal) : '');
  setField(form, 'order[billing_address_attributes][kana01]', kanaVal ? NORMS.kana(kanaVal) : '');
  setField(form, 'order[billing_address_attributes][zip01]', answers.zip);
  if (answers.pref) {
    var prefId = PREFS.indexOf(answers.pref) + 1;   // PREFS はJISコード順 → index+1 = prefecture_id
    if (prefId > 0) setField(form, 'order[billing_address_attributes][prefecture_id]', String(prefId));
  }
  setField(form, 'order[billing_address_attributes][addr01]', answers.addr1);
  setField(form, 'order[billing_address_attributes][addr02]', answers.addr2);
  setField(form, 'order[billing_address_attributes][tel01]', answers.tel);
  setField(form, 'order[email]', answers.email);
  setField(form, 'order[customer_attributes][email]', answers.email);
  setField(form, 'order[customer_attributes][password]', answers.password);
  setField(form, 'order[customer_attributes][sex_id]', answers.sex);
  if (answers.birthdate) {
    var b = answers.birthdate.split('/');
    setField(form, 'order[customer_attributes][birth(1i)]', String(+b[0]));
    setField(form, 'order[customer_attributes][birth(2i)]', String(+b[1]));  // selectの値はゼロ埋めなし
    setField(form, 'order[customer_attributes][birth(3i)]', String(+b[2]));
  }
  setField(form, 'order[payment_attributes][payment_method_id]', answers.payment);

  /* カード情報(クレジット選択時のみ)。LP内のVeriTransフォーム欄への直接転記のみで
     外部送信・URLパラメータ化は一切しない */
  if (answers.card_number && (answers.payment_label || '').indexOf('クレジット') >= 0) {
    setField(form, 'order[payment_attributes][source_attributes][number]', answers.card_number);
    setField(form, 'order[payment_attributes][source_attributes][month]', answers.card_month);
    setField(form, 'order[payment_attributes][source_attributes][year]', answers.card_year);
    setField(form, 'order[payment_attributes][source_attributes][name]', answers.card_name);
    var sec = form.querySelector('[name="order[payment_attributes][source_attributes][security_code]"]');
    if (sec && answers.card_sec) setField(form, 'order[payment_attributes][source_attributes][security_code]', answers.card_sec);
  }
  /* 後払い同意チェックは意図的に触らない(お客様自身が同意する) */

  /* ecforce側LPの郵便番号自動補完JSが zip01 のinputイベントに反応して
     非同期で住所欄を上書き(addr02をクリア)することがあるため、
     少し待ってから住所3欄を再セットする(実LP ug29_test で実測した挙動) */
  setTimeout(function () {
    if (answers.pref) {
      var pid = PREFS.indexOf(answers.pref) + 1;
      if (pid > 0) setField(form, 'order[billing_address_attributes][prefecture_id]', String(pid));
    }
    setField(form, 'order[billing_address_attributes][addr01]', answers.addr1);
    setField(form, 'order[billing_address_attributes][addr02]', answers.addr2);
  }, 900);
}

function transfer() {
  resolveSkips();

  /* モードA: LP内フォームへ直接入力 */
  var localForm = CFG.transferMode !== 'redirect' ? findLocalForm() : null;
  if (localForm) {
    fillLocalForm(localForm);
    track('fill_local');
    var sbtn = msgsEl.querySelector('.sum .go');
    if (sbtn) sbtn.textContent = '反映しました ✅';
    botBubble('ご入力内容をこのページの注文フォームに反映しました✅\nフォームの内容をご確認のうえ、そのままお手続きを完了してください✨');
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
