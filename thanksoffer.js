/*! ============================================================
    サンクスオファー チャット化モジュール thanksoffer.js v1.0.0
    ------------------------------------------------------------
    ecforceのサンクスオファーページ(/lp/cv_upsell)に貼るだけで動く、
    1ファイル完結・依存ゼロのモジュール。chatbot.js とは独立して動く。

    何をするか:
      注文完了直後に表示されるサンクスオファーページを「チャットの皮」で覆い、
      LP側チャット(chatbot.js + thanksOffer: true)から引き継いだ会話履歴の続きとして
      3コース選択(ベーシック/スターター/プレミアム)をチャットUIで提示する。

    仕組み(実ページ照合 2026-09-03・セッション有効状態のcv_upsellで確認):
      ・ページ検出: form#form_cv_upsell + input[name="order[take_cv_upsell_offer]"]
      ・コース表: .bg02_column_01(ベーシック/div) .bg02_column_02(スターター/a)
                  .bg02_column_03(プレミアム/a) の行画像。チャットはこの画像を
                  クローンして表に使い、タップをページの実jQueryハンドラへ中継する
                  (実ハンドラが #variant_id を 21/22 に切替え、#pseudo-confirm の
                  文言更新と .cta_box の表示まで全部やってくれる)
      ・確認表示: #pseudo-confirm(ご選択内容の確認) と .qa-caution(注意喚起文・
                  variantに追従してecforceが差し替える)をクローンして表示
      ・確定: #submit(input[type=submit]。starter_btn.png/premium_btn.png の
              背景画像ボタン)を本物のままクリック=決済・受注は全部ecforce責任範囲
      ・ベーシック: フォーム送信なし。.cta_btn.btn01 a(basic_btn.png)の遷移先
                    (LINE誘導LP)へ遷移
    フェイルセーフ: 検出条件を満たさない・途中でエラー → 何もしない/覆いを外して
                    素のサンクスオファーページに戻す(現状と同じ挙動に自動フォールバック)

    構成は popup.js と同じ2部構成:
      ①DEFAULTS … 既定設定(タグの window.HS_THANKS で上書きできる) → 編集OK
      ②ENGINE   … 描画・中継ロジック → 編集注意(触ったら preview/thanks_offer_test.html で全パターン確認)

    計測: hs_chat_thanks_* (hs_chat_前方一致なので既存のGTM/GA4/シート集計にそのまま乗る)
    ============================================================ */
(function () {
  'use strict';
  if (window.__HS_THANKS_LOADED) return;   // 二重読み込みガード
  window.__HS_THANKS_LOADED = true;

/* ============================================================
   ①DEFAULTS — 既定設定(LP個別の変更はタグの window.HS_THANKS で上書き)
   ============================================================ */
var DEFAULTS = {
  enabled: true,

  /* --- 見た目(chatbot.jsの既定と同じ) --- */
  theme: {
    brand: '#C8869A', brandDark: '#a86880', brandLight: '#f9f1f4',
  },
  title: 'お申し込みサポート',
  subtitle: 'かんたん注文チャット',
  avatar: 'https://yhozumi-stack.github.io/hugskin-chatbot/img/operator.png',

  /* --- 文言(タグで上書き可) --- */
  intro1: 'ページを閉じる前に必ずご確認ください。',   // 赤字強調で表示
  intro2: '最後に3つのコースから必ずご選択ください。\n（タップするとボタンがでます）',
  tapHint: '▲ ご希望のコースをタップしてください',
  thanksMsg: 'ご注文ありがとうございました🎉',
  restoredNote: '— ここまでのご注文のやり取り —',

  /* ベーシック選択時の遷移先。空ならページ内 .cta_btn.btn01 a の href を使う */
  basicUrl: '',

  /* 発動を特定の広告コード(u=)に限定する(段階導入・実機テスト用)。
     例: onlyU: ['test_ins29np_0810'] → このu=のテスト注文だけチャット化し、
     他のお客様には素のサンクスオファーページのまま(タグを本番ページに
     置いたまま安全にテストできる)。空配列(既定)なら全員に発動 */
  onlyU: [],

  /* --- セレクタ(実ページ照合済みの既定値。ページ改修時のみタグで上書き) --- */
  sel: {
    form:      '#form_cv_upsell',
    marker:    'input[name="order[take_cv_upsell_offer]"]',
    rowBasic:  '.bg02_column_01',
    rowStarter:'.bg02_column_02',
    rowPremium:'.bg02_column_03',
    planTitle: '.bg02_column_ttl img',
    pseudo:    '#pseudo-confirm',
    caution:   '.qa-caution',
    submit:    '#submit',
    basicBtn:  '.cta_btn.btn01 a',
    variant:   '#variant_id',
  },

  /* --- 挙動 --- */
  historyKey: 'hs_thanks_history',
  historyMaxAgeMs: 15 * 60 * 1000,   // 履歴の有効期限(15分。注文直後の遷移しか想定しない)
  rowClickWaitMs: 600,               // 行タップ中継後、ページ側の描画を待つ時間
  cautionPollMs: 500,                // 注意喚起文のvariant追従を待つポーリング間隔
  cautionPollMax: 6,                 // 同・回数(500ms×6=最大3秒)
  submitDelayMs: 900,                // お礼バブル表示から実送信までの間
  zIndex: 2147483000,
};

/* ============================================================
   ②ENGINE — ここから下は編集注意。
   触ったら必ず preview/thanks_offer_test.html で
   「履歴復元」「3コースのタップ切替」「スターター/プレミアム確定」
   「ベーシック遷移」「×で閉じる→戻る」「検出失敗時に何もしない」を全部確認すること
   ============================================================ */

/* ---------- 設定の合体(タグの window.HS_THANKS が優先) ---------- */
var USER = window.HS_THANKS || {};
var CFG = {};
(function merge() {
  var k;
  for (k in DEFAULTS) CFG[k] = DEFAULTS[k];
  for (k in USER) {
    if (k === 'theme' || k === 'sel') continue;   // 下で個別マージ
    CFG[k] = USER[k];
  }
  CFG.theme = {};
  for (k in DEFAULTS.theme) CFG.theme[k] = DEFAULTS.theme[k];
  for (k in (USER.theme || {})) CFG.theme[k] = USER.theme[k];
  CFG.sel = {};
  for (k in DEFAULTS.sel) CFG.sel[k] = DEFAULTS.sel[k];
  for (k in (USER.sel || {})) CFG.sel[k] = USER.sel[k];
})();

/* ---------- 計測(Clarity / GTM dataLayer) ----------
   hs_page は popup.js/chatbot.js と同じ「パス + u=広告コード」の短い正規形 */
function trackPage() {
  try {
    var u = new URLSearchParams(location.search).get('u') || sessionStorage.getItem('hs_u') || '';
    return location.pathname + (u ? '?u=' + u : '');
  } catch (e) { return location.pathname; }
}
function track(ev) {
  try {
    if (window.dataLayer) window.dataLayer.push({
      event: 'hs_chat_thanks_' + ev,
      hs_page: trackPage(),
    });
    if (window.clarity) window.clarity('event', 'hs_chat_thanks_' + ev);
  } catch (e) {}
}

/* ---------- 小道具 ---------- */
function qs(sel) { return document.querySelector(sel); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------- ページ検出(満たさなければ何もしない=フェイルセーフ) ---------- */
var form, marker, rowStarter, rowPremium, rowBasic, submitEl;
function detect() {
  form   = qs(CFG.sel.form);
  marker = qs(CFG.sel.marker);
  rowStarter = qs(CFG.sel.rowStarter);
  rowPremium = qs(CFG.sel.rowPremium);
  rowBasic   = qs(CFG.sel.rowBasic);
  submitEl   = qs(CFG.sel.submit);
  return !!(form && marker && rowStarter && rowPremium && submitEl);
}

/* ---------- チャットUI ---------- */
var host, shadow, wrap, msgsEl, relauncher;
var locked = false;          // CTA確定後は行タップ無効
var pickedCourse = null;

function css() {
  var T = CFG.theme;
  return ''
  + '*{margin:0;padding:0;box-sizing:border-box}'
  + '.dim{position:fixed;inset:0;background:rgba(60,40,48,.35);backdrop-filter:blur(1.5px);z-index:1}'
  + '.win{position:fixed;right:10px;bottom:12px;width:min(374px,calc(100vw - 20px));'
  +   'height:min(620px,calc(100dvh - 24px));display:flex;flex-direction:column;background:' + T.brandLight + ';'
  +   'border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(80,40,55,.35);z-index:2;'
  +   'font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif}'
  + '.hd{background:' + T.brand + ';padding:11px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0}'
  + '.hd .avi{width:34px;height:34px;border-radius:50%;overflow:hidden;background:#fff;flex-shrink:0}'
  + '.hd .avi img{width:100%;height:100%;object-fit:cover}'
  + '.hd-name{color:#fff;font-size:13.5px;font-weight:700;letter-spacing:.02em}'
  + '.hd-sub{color:rgba(255,255,255,.85);font-size:11px;margin-top:1px}'
  + '.hd .x{margin-left:auto;color:rgba(255,255,255,.9);font-size:18px;background:none;border:none;cursor:pointer;padding:4px 8px}'
  + '.msgs{flex:1;overflow-y:auto;padding:14px 12px 18px;display:flex;flex-direction:column;gap:10px}'
  + '.row{display:flex;gap:8px;align-items:flex-end;flex-shrink:0;animation:hsUp .18s ease both}'
  + '.row.user{justify-content:flex-end}'
  + '@keyframes hsUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'
  + '.av{width:28px;height:28px;border-radius:50%;overflow:hidden;background:' + T.brand + ';flex-shrink:0;margin-bottom:2px;display:flex;align-items:center;justify-content:center;font-size:13px}'
  + '.av img{width:100%;height:100%;object-fit:cover}'
  + '.bb{max-width:78%;padding:10px 13px;font-size:13.5px;line-height:1.7;white-space:pre-wrap}'
  + '.bb.bot{background:#fff;color:#3a2a30;border-radius:3px 12px 12px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}'
  + '.bb.user{background:' + T.brand + ';color:#fff;border-radius:12px 3px 12px 12px}'
  + '.bb .red{color:#d63030;font-weight:700}'
  + '.typing{display:inline-flex;gap:4px;background:#fff;border-radius:3px 12px 12px 12px;padding:13px 15px;box-shadow:0 1px 2px rgba(0,0,0,.06)}'
  + '.dot{width:6px;height:6px;border-radius:50%;background:#c8a0b0;animation:hsBlink 1.1s infinite}'
  + '.dot:nth-child(2){animation-delay:.18s}.dot:nth-child(3){animation-delay:.36s}'
  + '@keyframes hsBlink{0%,60%,100%{opacity:.3}30%{opacity:1}}'
  /* 復元した履歴(薄く表示) */
  + '.hist{opacity:.62}'
  + '.hist-note{text-align:center;font-size:10px;color:#b09aa2;letter-spacing:.05em;margin:2px 0;flex-shrink:0}'
  /* コース表(実ページの行画像をそのまま並べる) */
  + '.course{margin-left:36px;max-width:92%;flex-shrink:0;animation:hsUp .25s ease both;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(120,90,40,.25);background:#fff}'
  + '.course img{display:block;width:100%;height:auto}'
  + '.course .crow{cursor:pointer;position:relative}'
  + '.course .crow.selected::after{content:"";position:absolute;inset:0;box-shadow:inset 0 0 0 3px #d6a04f;pointer-events:none}'
  + '.tap-hint{text-align:center;font-size:10px;color:#8a6a30;padding:5px 0;letter-spacing:.05em;background:#f6ecd8}'
  /* 確認セクション(pseudo-confirm/cautionのクローン置き場) */
  + '.sec{margin-left:36px;max-width:92%;flex-shrink:0;animation:hsUp .25s ease both;display:flex;flex-direction:column;gap:10px}'
  + '.pseudo{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:12px 14px;font-size:12.5px;color:#3a2a30;line-height:1.7}'
  + '.pseudo p{margin:0 0 4px}'
  + '.pseudo .pc_head{font-weight:700;font-size:12px;color:' + T.brandDark + ';letter-spacing:.04em;border-bottom:1px solid rgba(0,0,0,.07);padding-bottom:6px;margin-bottom:8px}'
  + '.pseudo .pc_course{font-weight:800;font-size:14px}'
  + '.pseudo .pc_price_row{display:flex;justify-content:space-between;align-items:baseline;margin:4px 0}'
  + '.pseudo .pc_label{color:#9a7a85;font-size:11.5px}'
  + '.pseudo .pc_price{font-weight:800;font-size:15px}'
  + '.pseudo .pc_point_row{color:#d6305f;font-weight:700;font-size:12px;margin:2px 0}'
  + '.pseudo .pc_next{color:#6a5a60;font-size:11.5px;margin-top:4px}'
  + '.law{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:10.5px;color:#6a5a60;line-height:1.75;padding:11px 13px;max-height:150px;overflow-y:auto}'
  /* CTA(実ページのボタン画像をそのまま使う) */
  + '.cta{cursor:pointer;border:none;background:none;padding:0;display:block;width:100%}'
  + '.cta img{display:block;width:100%;height:auto}'
  + '.cta:active{transform:scale(.98)}'
  + '.cta-fallback{display:block;width:100%;border:none;cursor:pointer;font-family:inherit;color:#fff;text-align:center;'
  +   'background:linear-gradient(180deg,#d9b36a,#b5854f);border-radius:14px;padding:14px 20px;font-size:15px;font-weight:800;'
  +   'box-shadow:0 4px 12px rgba(140,100,50,.45)}'
  /* 閉じた後の再表示ボタン */
  + '.relaunch{position:fixed;right:12px;bottom:12px;z-index:2;background:' + T.brand + ';color:#fff;border:none;'
  +   'border-radius:99px;padding:12px 18px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;'
  +   'box-shadow:0 4px 14px rgba(80,40,55,.4)}';
}

function avHtml() {
  return CFG.avatar
    ? '<div class="av"><img src="' + esc(CFG.avatar) + '" alt=""></div>'
    : '<div class="av">💬</div>';
}
function scrollBottom() {
  setTimeout(function () { if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight; }, 40);
}
function botBubble(html) {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = avHtml() + '<div class="bb bot">' + html + '</div>';
  msgsEl.appendChild(row); scrollBottom();
}
function userBubble(text) {
  var row = document.createElement('div');
  row.className = 'row user';
  row.innerHTML = '<div class="bb user">' + esc(text) + '</div>';
  msgsEl.appendChild(row); scrollBottom();
}
function typing(ms) {
  var row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = avHtml() + '<div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  msgsEl.appendChild(row); scrollBottom();
  return new Promise(function (r) {
    setTimeout(function () { row.remove(); r(); }, ms);
  });
}

/* ---------- 履歴の復元 ---------- */
function restoreHistory() {
  try {
    var raw = sessionStorage.getItem(CFG.historyKey);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (!data || !data.html) return false;
    if (Date.now() - (data.ts || 0) > CFG.historyMaxAgeMs) return false;
    var hist = document.createElement('div');
    hist.className = 'hist';
    hist.style.display = 'contents';
    hist.innerHTML = data.html;
    /* 履歴内のボタン・入力は無効化(見た目だけの過去ログ) */
    hist.querySelectorAll('button, input, select, textarea, a').forEach(function (el) {
      el.disabled = true;
      el.style.pointerEvents = 'none';
      if (el.tagName === 'A') el.removeAttribute('href');
    });
    hist.querySelectorAll('*').forEach(function (el) { el.classList && el.classList.add('hist'); });
    msgsEl.appendChild(hist);
    var note = document.createElement('div');
    note.className = 'hist-note';
    note.textContent = CFG.restoredNote;
    msgsEl.appendChild(note);
    track('restore');
    return true;
  } catch (e) { return false; }
}

/* ---------- コース表(実ページの行画像をクローン) ---------- */
function rowImgSrc(rowEl) {
  var img = rowEl && rowEl.querySelector('img');
  return img ? (img.currentSrc || img.src) : '';
}
function buildCourseTable() {
  var wrapEl = document.createElement('div');
  wrapEl.className = 'course';
  var ttl = qs(CFG.sel.planTitle);
  var html = '';
  if (ttl) html += '<img src="' + esc(ttl.currentSrc || ttl.src) + '" alt="">';
  html += '<div class="crow" data-course="basic"><img src="' + esc(rowImgSrc(rowBasic)) + '" alt="ベーシックコース"></div>';
  html += '<div class="crow" data-course="starter"><img src="' + esc(rowImgSrc(rowStarter)) + '" alt="スターターコース"></div>';
  html += '<div class="crow" data-course="premium"><img src="' + esc(rowImgSrc(rowPremium)) + '" alt="プレミアムコース"></div>';
  html += '<div class="tap-hint">' + esc(CFG.tapHint) + '</div>';
  wrapEl.innerHTML = html;
  wrapEl.querySelectorAll('.crow').forEach(function (r) {
    r.addEventListener('click', function () { pickRow(r.getAttribute('data-course')); });
  });
  msgsEl.appendChild(wrapEl); scrollBottom();
  return wrapEl;
}

/* ---------- 行タップ → 確認+CTA(実ページの状態をチャットへ写す) ---------- */
var courseTableEl = null;
function highlightRow(course) {
  if (!courseTableEl) return;
  courseTableEl.querySelectorAll('.crow').forEach(function (r) {
    r.classList.toggle('selected', r.getAttribute('data-course') === course);
  });
}
function removeSection() {
  var old = msgsEl.querySelector('.sec');
  if (old) old.remove();
}

function pickRow(course) {
  if (locked) return;
  try {
    pickedCourse = course;
    highlightRow(course);
    removeSection();
    track('row_' + course);
    if (course === 'basic') return sectionBasic();
    sectionUpsell(course);
  } catch (e) { failOpen('pickRow: ' + e.message); }
}

/* ベーシック: 確認・注意喚起なし。ボタン(実ページのbasic_btn画像)のみ */
function sectionBasic() {
  var sec = document.createElement('div');
  sec.className = 'sec';
  var basicA = qs(CFG.sel.basicBtn);
  var img = basicA && basicA.querySelector('img');
  var dest = CFG.basicUrl || (basicA && basicA.href) || '';
  if (img && (img.currentSrc || img.src)) {
    sec.innerHTML = '<button class="cta" data-act="basic"><img src="' + esc(img.currentSrc || img.src) + '" alt="ベーシックコースのまま進む"></button>';
  } else {
    sec.innerHTML = '<button class="cta-fallback" data-act="basic" style="background:linear-gradient(180deg,#9a9a9a,#6b6b6b)">ベーシックコースのまま進む</button>';
  }
  sec.querySelector('[data-act="basic"]').addEventListener('click', function () {
    if (locked) return;
    locked = true;
    track('cta_basic');
    userBubble('ベーシックコースのまま進む');
    typing(700).then(function () {
      botBubble(esc(CFG.thanksMsg));
      setTimeout(function () {
        if (dest) location.href = dest;
        else failOpen('basic dest missing');
      }, CFG.submitDelayMs);
    });
  });
  msgsEl.appendChild(sec); scrollBottom();
}

/* スターター/プレミアム: 実ハンドラへ中継 → pseudo-confirm/caution/ボタン画像を写す */
function sectionUpsell(course) {
  /* 1) ページ実装の行クリックを発火(variant切替・pseudo更新・フォーム表示が走る) */
  var realRow = course === 'premium' ? rowPremium : rowStarter;
  var realImg = realRow.querySelector('img') || realRow;
  realImg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  /* 2) ページ側の描画を待ってからチャットへ写す */
  setTimeout(function () {
    try {
      if (pickedCourse !== course || locked) return;   // 待ち中に選び直された
      var sec = document.createElement('div');
      sec.className = 'sec';

      /* ご選択内容の確認(pseudo-confirm) */
      var pseudo = qs(CFG.sel.pseudo);
      var pseudoHtml = pseudo ? pseudo.innerHTML : '';
      if (pseudoHtml) sec.appendChild(cloneBlock('pseudo', pseudoHtml));

      /* 注意喚起文(.qa-caution。variant追従の再描画をポーリングで待つ) */
      var caution = qs(CFG.sel.caution);
      var lawEl = null;
      if (caution && caution.textContent.trim()) {
        lawEl = cloneBlock('law', caution.innerHTML);
        sec.appendChild(lawEl);
        pollCaution(course, lawEl);
      }

      /* コースボタン(実ページ#submitの背景画像をそのまま使う) */
      var btnImg = submitBgImage();
      var cta = document.createElement('button');
      if (btnImg) {
        cta.className = 'cta';
        cta.innerHTML = '<img src="' + esc(btnImg) + '" alt="このコースにする">';
      } else {
        cta.className = 'cta-fallback';
        cta.textContent = (course === 'premium' ? 'プレミアムコース' : 'スターターコース') + 'にする';
      }
      cta.addEventListener('click', function () {
        if (locked) return;
        locked = true;
        track('cta_' + course);
        userBubble((course === 'premium' ? 'プレミアムコース' : 'スターターコース') + 'にする');
        typing(700).then(function () {
          botBubble(esc(CFG.thanksMsg));
          setTimeout(function () {
            try {
              var s = qs(CFG.sel.submit);
              if (s) s.click(); else form.submit();
            } catch (e) { failOpen('submit: ' + e.message); }
          }, CFG.submitDelayMs);
        });
      });
      sec.appendChild(cta);

      msgsEl.appendChild(sec); scrollBottom();
    } catch (e) { failOpen('sectionUpsell: ' + e.message); }
  }, CFG.rowClickWaitMs);
}

function cloneBlock(cls, html) {
  var d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  /* クローン内のリンク・入力は無効化(表示専用) */
  d.querySelectorAll('a, button, input, select').forEach(function (el) {
    el.style.pointerEvents = 'none';
    if (el.tagName === 'A') el.removeAttribute('href');
  });
  return d;
}

/* variant切替後、ecforceが注意喚起文を差し替えるのを待って反映する */
function pollCaution(course, lawEl) {
  var want = course === 'premium' ? '6回' : '3回';
  var n = 0;
  var timer = setInterval(function () {
    n++;
    try {
      var caution = qs(CFG.sel.caution);
      if (caution && caution.textContent.indexOf(want) >= 0) {
        lawEl.innerHTML = caution.innerHTML;
        clearInterval(timer);
        return;
      }
    } catch (e) {}
    if (n >= CFG.cautionPollMax) clearInterval(timer);
  }, CFG.cautionPollMs);
}

/* #submit の背景画像URL(starter_btn.png / premium_btn.png)を取り出す */
function submitBgImage() {
  try {
    var s = qs(CFG.sel.submit);
    if (!s) return '';
    var bg = getComputedStyle(s).backgroundImage || '';
    var m = bg.match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2] : '';
  } catch (e) { return ''; }
}

/* ---------- 閉じる/戻る(フェイルセーフ兼任) ---------- */
function closeChat() {
  track('close');
  if (wrap) wrap.style.display = 'none';
  var dim = shadow.querySelector('.dim');
  if (dim) dim.style.display = 'none';
  document.documentElement.style.overflow = '';
  if (!relauncher) {
    relauncher = document.createElement('button');
    relauncher.className = 'relaunch';
    relauncher.textContent = '💬 チャットに戻る';
    relauncher.addEventListener('click', function () {
      track('reopen');
      relauncher.style.display = 'none';
      if (wrap) wrap.style.display = 'flex';
      if (dim) dim.style.display = 'block';
    });
    shadow.appendChild(relauncher);
  } else {
    relauncher.style.display = 'block';
  }
}

/* エラー時: チャットを畳んで素のページに戻す(現状挙動へのフォールバック) */
function failOpen(reason) {
  try {
    if (window.dataLayer) window.dataLayer.push({ event: 'hs_chat_error', hs_error: 'thanks: ' + String(reason).slice(0, 180) });
  } catch (e) {}
  try {
    if (host) host.remove();
    document.documentElement.style.overflow = '';
  } catch (e2) {}
}

/* ---------- 起動 ---------- */
function boot() {
  try {
    if (!CFG.enabled) return;
    /* onlyU: 指定がある時は、u=(URL / sessionStorage継承)が一致する時だけ発動 */
    if (CFG.onlyU && CFG.onlyU.length) {
      var curU = '';
      try {
        curU = new URLSearchParams(location.search).get('u') || sessionStorage.getItem('hs_u') || '';
      } catch (eU) {}
      if (CFG.onlyU.indexOf(curU) < 0) return;
    }
    if (!detect()) return;    // サンクスオファーページでなければ何もしない

    host = document.createElement('div');
    host.id = 'hs-thanks-root';
    shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = document.createElement('style');
    style.textContent = css();
    shadow.appendChild(style);

    var dim = document.createElement('div');
    dim.className = 'dim';
    shadow.appendChild(dim);

    wrap = document.createElement('div');
    wrap.className = 'win';
    wrap.innerHTML =
      '<div class="hd">'
      + (CFG.avatar ? '<div class="avi"><img src="' + esc(CFG.avatar) + '" alt=""></div>' : '')
      + '<div><div class="hd-name">' + esc(CFG.title) + '</div><div class="hd-sub">' + esc(CFG.subtitle) + '</div></div>'
      + '<button class="x" aria-label="閉じる">×</button>'
      + '</div>'
      + '<div class="msgs"></div>';
    shadow.appendChild(wrap);
    msgsEl = wrap.querySelector('.msgs');
    wrap.querySelector('.x').addEventListener('click', closeChat);

    document.body.appendChild(host);
    document.documentElement.style.overflow = 'hidden';   // 背面スクロール抑止
    track('view');

    /* 履歴復元 → 導入バブル → コース表 */
    restoreHistory();
    typing(800).then(function () {
      botBubble('<span class="red">' + esc(CFG.intro1) + '</span>');
      return typing(900);
    }).then(function () {
      botBubble(esc(CFG.intro2).replace(/\n/g, '<br>'));
      courseTableEl = buildCourseTable();
    });
  } catch (e) {
    failOpen('boot: ' + e.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
