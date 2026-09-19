/* ===================================================================
   THE REV. CONDITIONING LAB. — main.js
   各機能を1回だけ初期化する。重複・死コードなし。
   =================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. サイトローダー ----------
     同じタブ内で最初にサイトを表示したときだけ出す（sessionStorage）。
     表示する場合は、グラフィックが見える時間として最低 1.0 秒保持する。
     sessionStorage が使えない環境でも致命的にならないよう try/catch。 */
  function initLoader() {
    var loader = document.getElementById('site-loader');
    if (!loader) return;

    /* ロゴクリックによる再読み込みで来た場合は、
       「初回にサイトを開くときと同じローダー」をここで通常表示する。
       （遷移元では凝った演出をせず、本物のローダーを遷移先で見せる） */
    var fromBrand = false;
    try { fromBrand = sessionStorage.getItem('revBrandReload') === '1'; } catch (e) {}
    if (fromBrand) {
      try { sessionStorage.removeItem('revBrandReload'); } catch (e) {}
    } else {
      // 通常アクセス：同じタブ内で初回のみ表示
      var shown = false;
      try { shown = sessionStorage.getItem('revLoaderShown') === '1'; } catch (e) {}
      if (shown) { loader.style.display = 'none'; return; }
      try { sessionStorage.setItem('revLoaderShown', '1'); } catch (e) {}
    }

    var MIN_SHOW = 1000;
    var started = Date.now();
    var hidden = false;

    function doHide() {
      if (hidden) return;
      hidden = true;
      loader.classList.add('loaded');
      loader.style.opacity = '0';
      loader.style.pointerEvents = 'none';
      setTimeout(function () {
        loader.style.visibility = 'hidden';
        loader.style.display = 'none';
      }, 760);
    }
    function hide() {
      setTimeout(doHide, Math.max(0, MIN_SHOW - (Date.now() - started)));
    }
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide);
    setTimeout(hide, 2600);   // 読み込み失敗時も必ず解除
  }

  /* ---------- 2. ヘッダーのスクロール状態 ---------- */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var ticking = false;
    var isScrolled = null;      // 直前の状態を保持し、変化した時だけクラスを書き換える
    function apply() {
      ticking = false;
      var next = (window.pageYOffset || document.documentElement.scrollTop || 0) > 40;
      if (next === isScrolled) return;   // 変化なしなら何もしない（再描画を起こさない）
      isScrolled = next;
      if (next) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    apply();
  }

  /* ---------- 2b. ヒーロー画像のズーム ----------
     Ken Burns 方式（CSSアニメーションで自動・ゆっくり拡大）に変更。
     スクロール連動をやめたため、スクロール中の処理・再描画は一切なく、
     原理的にカクつかない。演出は assets/css/style.css の @keyframes heroKenBurns。
     JS 側では何もしない（prefers-reduced-motion への配慮も CSS 側で行う）。 */

  /* ---------- 3. reveal（スクロール表示） ---------- */
  function initReveal() {
    var items = document.querySelectorAll('.reveal, .plate');
    if (!items.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) {
        el.classList.add('in');
        el.classList.add('is-in');
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });

    Array.prototype.forEach.call(items, function (el) { io.observe(el); });

    function ensure() {
      Array.prototype.forEach.call(
        document.querySelectorAll('.reveal:not(.in), .plate:not(.is-in)'),
        function (el) {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) {
            el.classList.add('in');
            el.classList.add('is-in');
          }
        });
    }
    /* ensure() は getBoundingClientRect() で強制的にレイアウト計算を発生させるため、
       スクロールのたびに実行するとスマホで大きなカクつきの原因になる。
       表示判定は IntersectionObserver が担うので、ここでは保険として
       読み込み完了時と数回のタイマーでのみ実行する。 */
    window.addEventListener('load', ensure);
    setTimeout(ensure, 400);
    setTimeout(ensure, 1200);
    setTimeout(ensure, 2500);
  }

  /* ---------- 4. FAQ アコーディオン（ARIA 関連付け込み） ---------- */
  function initFaq() {
    var btns = document.querySelectorAll('.faq-q');
    if (!btns.length) return;
    Array.prototype.forEach.call(btns, function (btn, i) {
      var item = btn.closest('.faq-item');
      if (!item) return;
      var ans = item.querySelector('.faq-a');
      if (!ans) return;

      var id = ans.id || ('faq-answer-' + (i + 1));
      ans.id = id;
      ans.setAttribute('role', 'region');
      btn.setAttribute('aria-controls', id);
      if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');
      var labelId = btn.id || ('faq-q-' + (i + 1));
      btn.id = labelId;
      ans.setAttribute('aria-labelledby', labelId);

      btn.addEventListener('click', function () {
        var open = item.classList.toggle('open');
        ans.style.maxHeight = open ? ans.scrollHeight + 'px' : '0px';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');

        // Phase E2: FAQを「どの不安が開かれたか」として計測。
        // 回答本文や自由入力は送らず、管理されたID/Topicだけを送る。
        if (open) {
          pushTrackingEvent('faq_open', {
            faq_id: btn.dataset.faqId || ('faq_' + (i + 1)),
            faq_topic: btn.dataset.faqTopic || 'unknown'
          });
        }
      });
    });
  }

  /* ---------- 5. スマホメニュー（ドロワー） ---------- */
  function initDrawer() {
    var btn = document.querySelector('.nav-toggle');
    var drawer = document.querySelector('.rev-drawer');
    if (!btn || !drawer) return;
    var body = document.body;
    var closeBtn = drawer.querySelector('.rev-drawer-close');

    function open() {
      body.dataset.scrollY = String(window.scrollY);
      body.classList.add('drawer-open');
      body.style.position = 'fixed';
      body.style.top = (-window.scrollY) + 'px';
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      btn.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('aria-hidden', 'false');
      // 表示アニメーション完了後にフォーカスを移す（非表示中は focus が効かない）
      requestAnimationFrame(function () {
        setTimeout(function () {
          var f = getFocusableElements();
          if (f.length) f[0].focus();
        }, 60);
      });
    }
    function shut() {
      var y = parseInt(body.dataset.scrollY || '0', 10);
      body.classList.remove('drawer-open');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      window.scrollTo(0, y);
      btn.setAttribute('aria-expanded', 'false');
      drawer.setAttribute('aria-hidden', 'true');
      // ハンバーガーは drawer-open 解除後に再表示されるため、
      // 表示が戻ってからフォーカスを戻す
      requestAnimationFrame(function () {
        setTimeout(function () { btn.focus(); }, 60);
      });
    }
    btn.addEventListener('click', function () {
      if (body.classList.contains('drawer-open')) shut(); else open();
    });
    if (closeBtn) closeBtn.addEventListener('click', shut);
    Array.prototype.forEach.call(drawer.querySelectorAll('a'), function (a) {
      a.addEventListener('click', shut);
    });
    // ドロワーを開いている間、Tab フォーカスを内部で循環させる
    function getFocusableElements() {
      return Array.prototype.slice.call(
        drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter(function (el) { return el.offsetParent !== null; });
    }
    function trapFocus(e) {
      if (e.key !== 'Tab') return;
      var f = getFocusableElements();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', function (e) {
      if (!body.classList.contains('drawer-open')) return;
      if (e.key === 'Escape') { shut(); return; }
      trapFocus(e);
    });
  }

  /* ---------- 7. ブランドロゴ → ホームを再読み込み（本物のローダーは遷移先で表示） ---------- */

  function restoreHomeTop() {
    // ロゴクリックから遷移してきた場合は必ず最上部から表示する
    var forced = false;
    try { forced = sessionStorage.getItem('revForceHomeReload') === '1'; } catch (e) {}
    if (!forced) return;
    try { sessionStorage.removeItem('revForceHomeReload'); } catch (e) {}
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    requestAnimationFrame(function () { window.scrollTo(0, 0); });
    window.addEventListener('load', function () { window.scrollTo(0, 0); });
  }

  function initBrandHome() {
    var brands = document.querySelectorAll('.brand, .foot-brand, .rev-drawer-logo');
    if (!brands.length) return;

    var loader = document.getElementById('site-loader');

    // 本番(http/https)ではルート "/"、ローカル(file://)では相対パスを使う
    var isWeb = /^https?:$/.test(location.protocol);
    var homeUrl = isWeb ? '/' : 'index.html';

    /* 遷移元では凝った演出をしない。
       白い画面が挟まらないよう、背景だけの簡易カバーを即座に出して
       すぐホームへ遷移する。ロゴのフェードイン演出は遷移先の
       「本物のローダー」（初回と同じ）に任せる。 */
    function coverAndGo() {
      if (loader) {
        loader.classList.remove('loaded');
        loader.classList.add('is-brand-cover');   // ロゴは隠し、背景のみ表示
        loader.style.display = 'flex';
        loader.style.visibility = 'visible';
        loader.style.opacity = '1';
        loader.style.pointerEvents = 'auto';
      }
      // 背景カバーを一瞬見せてから遷移（白飛び防止のみが目的）
      setTimeout(function () {
        if (isWeb) { location.replace(homeUrl); }
        else { location.assign(homeUrl); }
      }, 120);
    }

    Array.prototype.forEach.call(brands, function (brand) {
      if (brand.tagName === 'A') brand.setAttribute('href', isWeb ? '/' : 'index.html');
      brand.addEventListener('click', function (event) {
        event.preventDefault();
        // 遷移先で最上部表示 & 本物のローダーを表示するフラグ
        try { sessionStorage.setItem('revForceHomeReload', '1'); } catch (e) {}
        try { sessionStorage.setItem('revBrandReload', '1'); } catch (e) {}
        coverAndGo();
      });
    });
  }

  /* ---------- 8. リカバリーページ演出 ---------- */
  function initRecoveryFx() {
    var stats = document.querySelectorAll('.sol-stats .stat, .num-col');
    if (!stats.length || reduceMotion) return;
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.2 });
    Array.prototype.forEach.call(stats, function (s) { io.observe(s); });
  }


  /* ---------- 9. 画像の先読み ----------
     lazy 画像は既定だと画面直前まで読まれず、スクロール時に
     間に合わないことがある。ビューポートの2画面手前で
     loading を eager に切り替えて先に取得させる。 */
  function initImagePrefetch() {
    var lazies = [].slice.call(document.querySelectorAll('img[loading="lazy"]'));
    if (!lazies.length) return;

    function warm(img) {
      if (img.dataset.warmed) return;
      img.dataset.warmed = '1';
      img.loading = 'eager';
      // <picture><source> がある場合も確実に取得を促す
      if (typeof img.decode === 'function') { img.decode().catch(function () {}); }
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { warm(en.target); io.unobserve(en.target); }
        });
      }, { root: null, rootMargin: '200% 0px 200% 0px', threshold: 0 });
      lazies.forEach(function (img) { io.observe(img); });
    } else {
      lazies.forEach(warm);
    }

    // 読み込み完了までのちらつきを抑える
    lazies.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) { img.classList.add('img-ready'); return; }
      img.addEventListener('load', function () { img.classList.add('img-ready'); }, { once: true });
      img.addEventListener('error', function () { img.classList.add('img-ready'); }, { once: true });
    });

    // 回線に余裕があれば、読み込み後に残り全部を先読み
    window.addEventListener('load', function () {
      var c = navigator.connection;
      if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
      setTimeout(function () { lazies.forEach(warm); }, 1500);
    });
  }

  /* ---------- 10. Insights / GTM dataLayer ----------
     Phase E2:
     - 既存data-trackイベントに共通parameterを付与
     - key section到達を section_view として1回だけ送信
     - Blogの予約CTAを canonical reserve_click にも正規化
     - 個人情報・健康情報・フォーム内容は送信しない
  ----------------------------------------------------- */

  var TRACK_EVENT_VERSION = 'e1_v1';
  var TRACK_DEFAULT_SITE_VERSION = 'pre_m1';

  function trackingPageType() {
    var p = window.location.pathname || '/';
    if (p === '/' || /\/index\.html$/.test(p)) return 'home';
    if (/\/price\.html$/.test(p)) return 'price';
    if (/\/trainer\.html$/.test(p)) return 'trainer';
    if (/\/solution\.html$/.test(p)) return 'recovery';
    if (p === '/blog/' || /\/blog\/index\.html$/.test(p)) return 'blog_index';
    if (/^\/blog\/[^/]+\/?$/.test(p)) return 'blog_article';
    if (/\/legal\.html$/.test(p)) return 'legal';
    if (/\/privacy\.html$/.test(p)) return 'privacy';
    if (/\/terms\.html$/.test(p)) return 'terms';
    if (/\/404\.html$/.test(p)) return 'not_found';
    return 'other';
  }

  function trackingSiteVersion() {
    return document.documentElement.getAttribute('data-site-version') ||
      TRACK_DEFAULT_SITE_VERSION;
  }

  function trackingBase() {
    return {
      event_version: TRACK_EVENT_VERSION,
      site_version: trackingSiteVersion(),
      page_path: window.location.pathname || '/',
      page_type: trackingPageType()
    };
  }

  function pushTrackingEvent(name, extra) {
    window.dataLayer = window.dataLayer || [];
    var payload = trackingBase();
    payload.event = name;
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        if (extra[key] !== undefined && extra[key] !== null && extra[key] !== '') {
          payload[key] = extra[key];
        }
      });
    }
    window.dataLayer.push(payload);
  }

  function trackingDestinationType(link, eventName) {
    var href = link.href || '';
    if (eventName === 'reserve_click' || /^https:\/\/cl\.gyms\.jp\//.test(href)) return 'reserve';
    if (eventName === 'line_click' || /^https:\/\/lin\.ee\//.test(href)) return 'line';
    if (eventName === 'instagram_click' || /instagram\.com/.test(href)) return 'instagram';
    if (/^https?:/.test(href) && link.hostname !== window.location.hostname) return 'external';
    return 'internal';
  }

  function initSectionTracking() {
    if (trackingPageType() !== 'home') return;

    var defs = [
      { selector: '.trust-strip', id: 'trust' },
      { selector: '#service', id: 'service' },
      { selector: '.empathy', id: 'empathy' },
      { selector: '#voice', id: 'voice' },
      { selector: '#trainer', id: 'trainer' },
      { selector: '#recovery', id: 'recovery' },
      { selector: '.trial-guide', id: 'trial' },
      { selector: '#pricing', id: 'pricing' },
      { selector: '#faq', id: 'faq' },
      { selector: '#access', id: 'access' },
      { selector: '#contact', id: 'final_cta' }
    ];

    var targets = defs.map(function (def) {
      return { el: document.querySelector(def.selector), id: def.id };
    }).filter(function (x) { return !!x.el; });

    if (!targets.length) return;

    var seen = {};
    function fire(target) {
      if (seen[target.id]) return;
      seen[target.id] = true;
      pushTrackingEvent('section_view', { section_id: target.id });
    }

    if (!('IntersectionObserver' in window)) {
      targets.forEach(fire);
      return;
    }

    var byElement = new Map();
    targets.forEach(function (target) { byElement.set(target.el, target); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.25) return;
        var target = byElement.get(entry.target);
        if (!target) return;
        fire(target);
        io.unobserve(entry.target);
      });
    }, { threshold: [0.25], rootMargin: '0px 0px -10% 0px' });

    targets.forEach(function (target) { io.observe(target.el); });
  }

  function initTrackingDataLayer() {
    window.dataLayer = window.dataLayer || [];

    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[data-track]');
      if (!link) return;

      var eventName = link.dataset.track;
      var extra = {
        placement: link.dataset.placement || 'unknown',
        component: link.dataset.component || undefined,
        destination_type: trackingDestinationType(link, eventName),
        link_url: link.href,
        link_text: (link.textContent || '').trim().slice(0, 100)
      };

      // data-track / data-placement 以外の管理済みdata-*属性も送る。
      Object.keys(link.dataset).forEach(function (key) {
        if (key === 'track' || key === 'placement' || key === 'component') return;
        var snake = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        extra[snake] = link.dataset[key];
      });

      pushTrackingEvent(eventName, extra);

      // Blog記事内の予約CTAは article_cta_click を残しつつ、
      // Website全体のBooking Intent KPI用に reserve_click も追加。
      if (eventName !== 'reserve_click' && extra.destination_type === 'reserve') {
        pushTrackingEvent('reserve_click', {
          placement: extra.placement,
          component: extra.component,
          destination_type: 'reserve',
          link_url: extra.link_url,
          link_text: extra.link_text,
          article_slug: extra.article_slug,
          cta_type: extra.cta_type,
          source_event: eventName
        });
      }
    });

    initSectionTracking();
  }

  /* Phase E2 preview acceptance marker: tracking runtime verified on preview before merge. */
  /* ---------- 起動 ---------- */
  function boot() {
    restoreHomeTop();
    initLoader();
    initHeader();
    initReveal();
    initFaq();
    initDrawer();
    initBrandHome();
    initRecoveryFx();
    initImagePrefetch();
    initTrackingDataLayer();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
