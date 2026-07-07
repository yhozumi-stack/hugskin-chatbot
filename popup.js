/*! ============================================================
    LP離脱ポップアップ popup.js v1.0.0
    ------------------------------------------------------------
    ecforce LP にタグを貼るだけで動く、1ファイル完結・依存ゼロの
    離脱防止ポップアップ。chatbot.js とは独立して動く(無くても動く)。

    出すタイミング(triggers):
      'back'       … ブラウザバック(スマホの戻る操作)をした瞬間
      'delay60000' … LP表示から60秒後(数字はms・変更可)
      'chatclose'  … チャットボットを×で閉じた瞬間
      'visibility' … 別タブ/別アプリから戻ってきた瞬間

    見た目は2モード(imageの有無で自動切替):
      画像モード   … image を設定 → 画像(GIF可)+その上に重ねたCTAボタン。
                     画像自体は押せない(ボタンと×だけ反応)。
                     ada-cloud式の「ボタン焼き込み1枚GIF・画像全体クリック」に
                     したい時だけ imageClickable: true
      テキストモード … image が空 → バッジ+タイトル+本文+CTAボタン

    CTAの飛び先(ctaAction):
      'chat' … チャットボットを起動(window.HSChat.open()。無ければフォームへスクロール)
      'form' … LP内の注文フォームへスクロール
      'close' … 閉じるだけ(「LPに戻る」ボタンにする時)
      'https://…' … URL遷移

    計測: イベント名を hs_chat_popup_* にしてあるので、既存の
    GTMトリガー(hs_chat_.*)・GA4・毎朝のシート集計(hs_chat_前方一致)に
    設定変更ゼロでそのまま乗る。

    構成は chatbot.js と同じ2部構成:
      ①DEFAULTS … 既定設定(タグの window.HS_POPUP で上書きできる) → 編集OK
      ②ENGINE   … 表示・トリガー・計測ロジック → 編集注意(触ったら preview/popup_test.html で全パターン確認)
    ============================================================ */
(function () {
  'use strict';
  if (window.__HS_POPUP_LOADED) return;   // 二重読み込みガード
  window.__HS_POPUP_LOADED = true;

/* ============================================================
   ①DEFAULTS — 既定設定(ここを直接編集してもよいが、
   LP個別の変更はタグの window.HS_POPUP で上書きするのが原則)
   ============================================================ */
var DEFAULTS = {
  enabled: true,

  /* 出すタイミング。複数指定OK。どれかが発火したら1回表示
     'back'=ブラウザバック / 'delayNNNNN'=N ms経過 /
     'chatclose'=チャットを×で閉じた瞬間 / 'visibility'=別タブから戻ってきた瞬間 */
  triggers: ['back', 'delay60000'],

  /* --- 見た目(すべてタグで上書き可) --- */
  /* imageを設定すると「画像+重ねCTAボタン」の画像モードになり、
     badge/title/linesは使われない(コピーは画像に焼き込む前提) */
  image: '',                              // 画像URL(GIF可)。空ならテキストモード
  imageClickable: false,                  // trueで画像全体をCTA化(ada-cloud式のボタン焼き込みGIF用)
  ctaBottom: '7%',                        // 画像モード: ボタンの画像下端からの位置
  ctaWidth: '78%',                        // 画像モード: ボタンの幅
  title: 'ちょっとお待ちください！',
  /* 本文。1要素=1行。{{PRICE}}等の変数を含む行は、その変数が
     未設定なら行ごと非表示(chatbot.jsと同じルール) */
  lines: [
    'ただいま初回限定 {{PRICE}} でご案内しています。',
    'このページを閉じると、次回は通常価格でのご案内になる場合があります。',
  ],
  ctaText: '今すぐ試してみる',
  ctaAction: 'chat',                      // 'chat' / 'form' / 'close'(閉じてLPに戻る) / 'https://…'
  closeText: '今回は見送る',              // 下の小さい閉じるリンク。空文字で非表示(×は常に出る)
  badge: '',                              // タイトル上の小さいラベル(例: '初回限定')。空なら非表示

  /* --- 表示頻度 --- */
  oncePer: 'session',   // 'session'=タブを閉じるまで1回 / 'load'=ページ表示ごとに1回 / 'always'=毎回(テスト用)

  /* --- 変数 --- */
  /* {{VAR}} の置換値。空のままなら、同じタグ内の window.HS_CHAT.vars
     (チャットボットの設定)から自動で引き継ぐので、チャット併設LPでは
     二重に書かなくてよい */
  vars: {},

  /* --- 色 --- */
  theme: {
    brand: '#C8869A',   // CTAボタン・バッジの色(チャットと合わせてある)
    text:  '#4a3b40',
  },

  /* --- 上級者向け(通常は触らない) --- */
  zIndex: 2147482900,   // チャットのパネル(…3001)より下 = チャットが開けばポップアップより前に出る
  formSelector: 'input[name="order[billing_address_attributes][name01]"]',  // 'form'スクロール先の検出用(chatbot.jsと同じ判定)
  delayRetryMs: 10000,  // 時間経過トリガーが出せない状況(チャット操作中等)だった時の再判定間隔
};

/* ============================================================
   ②ENGINE — ここから下は編集注意。
   触ったら必ず preview/popup_test.html で
   「時間経過」「ブラウザバック」「CTA→チャット起動」「×で閉じる」を全部確認すること
   ============================================================ */

/* ---------- 設定の合体(タグの window.HS_POPUP が優先) ---------- */
var USER = window.HS_POPUP || {};
var CFG = {};
(function merge() {
  var k;
  for (k in DEFAULTS) CFG[k] = DEFAULTS[k];
  for (k in USER) {
    if (k === 'theme' || k === 'vars') continue;   // 下で個別マージ
    CFG[k] = USER[k];
  }
  CFG.theme = {};
  for (k in DEFAULTS.theme) CFG.theme[k] = DEFAULTS.theme[k];
  for (k in (USER.theme || {})) CFG.theme[k] = USER.theme[k];
  /* vars: タグのHS_POPUP.vars > HS_CHAT.vars(チャット設定から自動引き継ぎ) */
  CFG.vars = {};
  var chatVars = (window.HS_CHAT && window.HS_CHAT.vars) || {};
  for (k in chatVars) CFG.vars[k] = chatVars[k];
  for (k in (USER.vars || {})) CFG.vars[k] = USER.vars[k];
})();

/* ---------- 計測(Clarity / GTM dataLayer) ----------
   イベント名は hs_chat_popup_show / hs_chat_popup_cta / hs_chat_popup_close。
   hs_chat_ 前方一致なので GTM・GA4・シート集計に設定変更なしで乗る。
   シート側では event = popup_show / popup_cta / popup_close の行になる */
function track(ev, trig) {
  try {
    if (window.dataLayer) window.dataLayer.push({
      event: 'hs_chat_' + ev,
      hs_event: ev,
      hs_scenario: (window.HS_CHAT && window.HS_CHAT.scenario) || '(popup)',
      hs_page: location.pathname + location.search,
      hs_popup_trigger: trig || '',
    });
  } catch (e) {}
  try { if (window.clarity) window.clarity('event', 'hs_chat_' + ev); } catch (e) {}
}

/* ---------- {{VAR}}置換(chatbot.jsと同じルール) ----------
   変数を含む行は、その変数が未設定なら行ごと消す(文言が壊れない) */
function fillVars(line) {
  var missing = false;
  var out = String(line).replace(/\{\{(\w+)\}\}/g, function (_, name) {
    var v = CFG.vars[name];
    if (v === undefined || v === null || v === '') { missing = true; return ''; }
    return v;
  });
  return missing ? null : out;
}

/* ---------- 表示済み管理 ---------- */
var SHOWN_KEY = 'hs_popup_shown::' + (function () {
  try { return new URLSearchParams(location.search).get('u') || location.pathname; }
  catch (e) { return location.pathname; }
})();
var shownThisLoad = false;
function alreadyShown() {
  if (CFG.oncePer === 'always') return false;
  if (shownThisLoad) return true;                       // 'load' はここまで
  if (CFG.oncePer === 'session') {
    try { return sessionStorage.getItem(SHOWN_KEY) === '1'; } catch (e) { return false; }
  }
  return false;
}
function markShown() {
  shownThisLoad = true;
  if (CFG.oncePer === 'session') {
    try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch (e) {}
  }
}

/* ---------- 出してよい状況かの判定 ----------
   chatbot.js には触らず、dataLayer のイベント履歴からチャットの状態を読む
   (open/close の最後のどちらが新しいかで開閉を判定) */
function chatIsOpen() {
  var dl = window.dataLayer;
  if (!dl || !dl.length) return false;
  for (var i = dl.length - 1; i >= 0; i--) {
    var ev = dl[i] && dl[i].event;
    if (ev === 'hs_chat_open') return true;
    if (ev === 'hs_chat_close') return false;
  }
  return false;
}
function chatSubmitted() {   // チャット経由で注文送信済み → もう引き止めない
  var dl = window.dataLayer;
  if (!dl || !dl.length) return false;
  for (var i = dl.length - 1; i >= 0; i--) {
    if (dl[i] && dl[i].event === 'hs_chat_submit') return true;
  }
  return false;
}
function formFocused() {     // LPフォーム入力中は邪魔しない
  var a = document.activeElement;
  return !!(a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName));
}
function showable() {
  return CFG.enabled && !alreadyShown() && !chatIsOpen() && !chatSubmitted() && !formFocused();
}

/* ---------- DOM生成(Shadow DOMでLPのCSSと完全隔離) ---------- */
var host = null, shadow = null;
function buildCss() {
  var b = CFG.theme.brand, t = CFG.theme.text;
  return ''
  + ':host{all:initial}'
  + '.ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:' + CFG.zIndex + ';'
  +   'display:flex;align-items:center;justify-content:center;padding:20px;'
  +   'font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;'
  +   'animation:hspIn .22s ease both}'
  + '@keyframes hspIn{from{opacity:0}to{opacity:1}}'
  + '@keyframes hspUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}'
  + '.card{background:#fff;border-radius:16px;width:min(340px,100%);max-height:min(80vh,640px);overflow:auto;'
  +   'box-shadow:0 12px 40px rgba(0,0,0,.25);position:relative;animation:hspUp .26s ease both;color:' + t + '}'
  + '.x{position:absolute;top:8px;right:8px;width:32px;height:32px;border:none;border-radius:50%;'
  +   'background:rgba(0,0,0,.35);color:#fff;font-size:17px;line-height:32px;text-align:center;cursor:pointer;padding:0}'
  + '.img{display:block;width:100%;height:auto;border-radius:16px 16px 0 0}'
  /* 画像モード: 画像だけのカード+重ねCTA(画像は押せない。ボタンと×だけ反応) */
  + '.imgcard{background:transparent;overflow:visible;max-height:none;box-shadow:none}'
  + '.imgcard .img{border-radius:16px;pointer-events:none;max-height:76vh;width:auto;max-width:100%;'
  +   'margin:0 auto;box-shadow:0 12px 40px rgba(0,0,0,.25)}'
  + '.imgcard.clickable .img{pointer-events:auto;cursor:pointer}'
  + '.ctaover{position:absolute;left:50%;transform:translateX(-50%);bottom:' + CFG.ctaBottom + ';'
  +   'width:' + CFG.ctaWidth + ';margin:0;animation:hspPulse 1.6s ease-in-out infinite}'
  + '@keyframes hspPulse{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.04)}}'
  + '.laterbar{text-align:center;padding:2px 0 0}'
  + '.laterbar .later{color:#eee;text-shadow:0 1px 3px rgba(0,0,0,.5)}'
  + '.body{padding:20px 20px 18px;text-align:center}'
  + '.badge{display:inline-block;background:' + b + ';color:#fff;font-size:11px;font-weight:700;'
  +   'border-radius:999px;padding:3px 12px;margin-bottom:8px}'
  + '.title{font-size:18px;font-weight:700;line-height:1.4;margin:0 0 10px}'
  + '.line{font-size:13.5px;line-height:1.7;margin:0 0 6px}'
  + '.cta{display:block;width:100%;border:none;border-radius:999px;background:' + b + ';color:#fff;'
  +   'font-size:15.5px;font-weight:700;padding:14px 10px;margin:14px 0 0;cursor:pointer;'
  +   'box-shadow:0 4px 14px rgba(0,0,0,.18)}'
  + '.cta:active{transform:scale(.98)}'
  + '.later{display:inline-block;margin-top:12px;font-size:12px;color:#999;background:none;border:none;'
  +   'text-decoration:underline;cursor:pointer;padding:4px}';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function removePopup() {
  if (host && host.parentNode) host.parentNode.removeChild(host);
  host = null; shadow = null;
}

function show(trigger) {
  if (host) return;             // 表示中なら何もしない
  markShown();

  host = document.createElement('div');
  host.setAttribute('data-hs-popup', '');
  shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var style = document.createElement('style');
  style.textContent = buildCss();
  shadow.appendChild(style);

  var ov = document.createElement('div');
  ov.className = 'ov';

  var html;
  var cta = fillVars(CFG.ctaText) || 'ご案内を見る';
  if (CFG.image) {
    /* 画像モード: 画像(GIF可)+重ねCTAボタン。画像自体は押せない。
       imageClickable:true なら ada-cloud式(画像全体がCTA・重ねボタンなし) */
    html = '<div class="card imgcard' + (CFG.imageClickable ? ' clickable' : '') + '">'
      + '<button class="x" type="button" aria-label="閉じる">✕</button>'
      + '<img class="img" src="' + esc(CFG.image) + '" alt="">'
      + (CFG.imageClickable ? '' : '<button class="cta ctaover" type="button">' + esc(cta) + '</button>')
      + (CFG.closeText ? '<div class="laterbar"><button class="later" type="button">' + esc(CFG.closeText) + '</button></div>' : '')
      + '</div>';
  } else {
    /* テキストモード: バッジ+タイトル+本文+CTA */
    html = '<div class="card">'
      + '<button class="x" type="button" aria-label="閉じる">✕</button>'
      + '<div class="body">';
    var badge = CFG.badge ? fillVars(CFG.badge) : null;
    if (badge) html += '<span class="badge">' + esc(badge) + '</span>';
    var title = fillVars(CFG.title);
    if (title) html += '<p class="title">' + esc(title) + '</p>';
    (CFG.lines || []).forEach(function (line) {
      var v = fillVars(line);
      if (v) html += '<p class="line">' + esc(v) + '</p>';
    });
    html += '<button class="cta" type="button">' + esc(cta) + '</button>';
    if (CFG.closeText) html += '<br><button class="later" type="button">' + esc(CFG.closeText) + '</button>';
    html += '</div></div>';
  }
  ov.innerHTML = html;
  shadow.appendChild(ov);
  document.body.appendChild(host);

  track('popup_show', trigger);

  function close() { track('popup_close', trigger); removePopup(); }
  ov.querySelector('.x').addEventListener('click', close);
  var later = ov.querySelector('.later');
  if (later) later.addEventListener('click', close);
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

  function onCta() {
    track('popup_cta', trigger);
    removePopup();
    doCta();
  }
  var ctaEl = ov.querySelector('.cta');
  if (ctaEl) ctaEl.addEventListener('click', onCta);
  if (CFG.image && CFG.imageClickable) ov.querySelector('.img').addEventListener('click', onCta);
}

/* ---------- CTAの飛び先 ---------- */
function scrollToForm() {
  var el = null;
  try { el = document.querySelector(CFG.formSelector); } catch (e) {}
  if (!el) el = document.querySelector('#lp-form');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function doCta() {
  var a = CFG.ctaAction;
  if (a === 'chat') {
    if (window.HSChat && window.HSChat.open) window.HSChat.open();
    else scrollToForm();      // チャット未設置LPではフォームへ
  } else if (a === 'form') {
    scrollToForm();
  } else if (a === 'close') {
    /* 「LPに戻る」ボタン: 閉じるだけ(removePopup済みなので何もしない) */
  } else if (/^https?:\/\//.test(String(a))) {
    location.href = a;
  }
}

/* ---------- トリガー1: ブラウザバック ----------
   仕組み: 最初のユーザー操作(タップ/スクロール/キー)で履歴に番兵を1つ積む。
   「戻る」で番兵が消えた瞬間(popstate)にポップアップを出す。
   番兵は1つだけ = 2回目の「戻る」は素直に離脱させる(無限に引き止めない)。
   ※ユーザー操作後に積むのは、Chromeが「操作なしで積まれた履歴」を
     戻るボタンでスキップする仕様(back intervention)への対応。
     LPを一切触らず直帰する人にはこのトリガーは発火しない(仕様) */
var backArmed = false;
function armBackTrigger() {
  if (backArmed) return;
  backArmed = true;
  try { history.pushState({ hs_popup: 1 }, '', location.href); } catch (e) { return; }
  window.addEventListener('popstate', function (e) {
    /* 番兵の上に別の履歴(ページ内アンカー等)が積まれ、そこから番兵に
       戻ってきただけの時は state が {hs_popup:1} で来る → 何もしない */
    if (e.state && e.state.hs_popup) return;
    /* 番兵が消えた = 離脱の意思。出せる状況なら1回だけ出す。
       出せない/出し終わっている時は何もしない = 次の「戻る」で普通に離脱 */
    if (showable()) show('back');
  });
}
function setupBack() {
  var opts = { once: true, passive: true };
  window.addEventListener('pointerdown', armBackTrigger, opts);
  window.addEventListener('scroll', armBackTrigger, opts);
  window.addEventListener('keydown', armBackTrigger, opts);
}

/* ---------- トリガー2: 時間経過 ----------
   'delay60000' = 60秒後。その瞬間チャット操作中・フォーム入力中なら
   delayRetryMs おきに再判定して、手が空いたタイミングで出す */
function setupDelay(ms) {
  function attempt() {
    if (alreadyShown()) return;                     // 他トリガーで表示済みなら終了
    if (document.hidden || !showable()) {
      setTimeout(attempt, CFG.delayRetryMs);
      return;
    }
    show('delay');
  }
  setTimeout(attempt, ms);
}

/* ---------- トリガー3: チャットを×で閉じた瞬間 ----------
   dataLayer.push をラップして hs_chat_close を検知する(chatbot.js非依存)。
   閉じるアニメーションが済んでから出すため少し待つ */
function setupChatClose() {
  var dl = window.dataLayer = window.dataLayer || [];
  var orig = dl.push.bind(dl);
  dl.push = function () {
    var r = orig.apply(null, arguments);
    try {
      var o = arguments[0];
      if (o && o.event === 'hs_chat_close') {
        setTimeout(function () { if (showable()) show('chatclose'); }, 400);
      }
    } catch (e) {}
    return r;
  };
}

/* ---------- トリガー4: 別タブ/別アプリから戻ってきた瞬間 ---------- */
function setupVisibility() {
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && showable()) show('visibility');
  });
}

/* ---------- 起動 ---------- */
function boot() {
  if (!CFG.enabled) return;
  var trigs = CFG.triggers || [];
  for (var i = 0; i < trigs.length; i++) {
    var t = String(trigs[i]);
    if (t === 'back') setupBack();
    else if (t.indexOf('delay') === 0) setupDelay(parseInt(t.slice(5), 10) || 60000);
    else if (t === 'chatclose') setupChatClose();
    else if (t === 'visibility') setupVisibility();
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
