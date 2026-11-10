/* ===================================================================
   THE REV. トップページ（B3.4デザイン）専用スクリプト
   index.html の main.tb-main が無ければ何もしない。他ページには影響しない。
   main 内のマークアップは参照版 THE REV Top B3.4.1-final.dc.html の描画結果から生成しており、
   ここでは参照版 Component の state 変化（ヒーローのループ、導入アニメ、リビール、
   当日の流れ、トレーナー写真、利用者の声、体験タブ、姿勢分析の拡大）を同じ値で再現する。
   =================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(.2,.7,.2,1)';
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---- ヒーロー：動画 → 受付 → フロア（動画は再生時間、写真は5秒） ---- */
  function initHero(main) {
    var media = $('[data-fv-img]', main);
    if (!media) return;
    var vid = $('video[data-fv-video]', media);
    var slides = { v: $('[data-slide="v"]', media), r: $('[data-slide="r"]', media), f: $('[data-slide="f"]', media) };
    var dots = {}; $$('[data-dot]', main).forEach(function (d) { dots[d.getAttribute('data-dot')] = d; });
    var vidOk = false, n = 0, lastReplay = -1;
    function list() { return vidOk ? ['v', 'r', 'f'] : ['r', 'f']; }
    function render() {
      var L = list(), cur = L[n % L.length];
      ['v', 'r', 'f'].forEach(function (k) {
        if (slides[k]) slides[k].style.opacity = k === cur ? '1' : '0';
        var d = dots[k];
        if (d) {
          d.style.display = L.indexOf(k) < 0 ? 'none' : '';
          d.style.width = k === cur ? '18px' : '6px';
          d.style.opacity = k === cur ? '1' : '0.35';
        }
      });
      if (vidOk && cur === 'v' && !reduce && lastReplay !== n) {
        lastReplay = n;
        try { vid.currentTime = 0; } catch (e) {}
        var p = vid.play(); if (p && p.catch) p.catch(function () {});
      }
    }
    function step() {
      var L = vidOk ? 3 : 2, cur = n % L;
      var dur = vid && vid.duration ? Math.round(vid.duration * 1000) : 5600;
      setTimeout(function () {
        if (!reduce && !document.hidden) { n++; render(); }
        step();
      }, vidOk && cur === 0 ? dur : 5000);
    }
    if (vid) {
      vid.muted = true;
      var ok = function () { if (!vidOk) { vidOk = true; render(); } };
      if (vid.readyState >= 2) ok(); else vid.addEventListener('loadeddata', ok, { once: true });
      if (reduce) vid.pause(); else { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
    }
    render();
    step();
  }

  /* ---- 導入：写真が下から開き、見出しが1行ずつ上がる ---- */
  function intro(main) {
    if (reduce) return;
    $$('[data-fv-img]', main).forEach(function (el) {
      el.style.clipPath = 'inset(0 0 100% 0)'; el.style.transform = 'scale(1.04)';
      el.style.transition = 'clip-path 1.2s ' + EASE + ' .1s, transform 1.8s ' + EASE + ' .1s';
      el.getBoundingClientRect();
      setTimeout(function () { el.style.clipPath = 'inset(0 0 0 0)'; el.style.transform = 'none'; }, 40);
    });
    $$('[data-line]', main).forEach(function (el, i) {
      el.style.transform = 'translateY(105%)';
      el.style.transition = 'transform .9s ' + EASE + ' ' + (0.45 + i * 0.12) + 's';
      el.getBoundingClientRect();
      setTimeout(function () { el.style.transform = 'none'; }, 40);
    });
  }

  /* ---- リビール：画面の下にある要素だけ、入ったときにふわっと出す ---- */
  function reveals(main) {
    if (reduce || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight;
    var els = $$('[data-rv]', main).filter(function (el) { return el.getBoundingClientRect().top > vh * 0.9; });
    els.forEach(function (el) {
      var slow = el.hasAttribute('data-slow');
      el.style.opacity = '0';
      el.style.transform = slow ? 'translateY(10px)' : 'translateY(18px)';
      el.style.transition = slow ? 'opacity 1.4s ease, transform 1.6s ' + EASE : 'opacity .7s ' + EASE + ', transform .7s ' + EASE;
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'none'; io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---- リカバリー「当日の過ごし方」：スクロールに合わせて線が伸び、カードが出る ---- */
  function initFlow(main) {
    var fl = $('[data-rflow]', main);
    if (!fl) return;
    var lis = $$('li', fl), n = lis.length;
    function tick() {
      var vh = window.innerHeight, r = fl.getBoundingClientRect();
      var pos = reduce ? n : Math.max(0, Math.min(1, (vh * 0.78 - r.top) / Math.max(1, r.height))) * n;
      lis.forEach(function (li, i) {
        var shown = pos > i + 0.05;
        var card = $('[data-rcard]', li), dot = $('[data-rdot]', li), line = $('[data-rline]', li), arrow = $('[data-rarrow]', li);
        if (card) { card.style.opacity = shown ? '1' : '0'; card.style.transform = shown ? 'none' : 'translate(14px,10px)'; }
        if (dot) dot.style.transform = shown ? 'scale(1)' : 'scale(.55)';
        var fill = Math.max(0, Math.min(1, (pos - i - 0.35) / 0.65));
        if (line) line.style.transform = 'scaleY(' + fill + ')';
        if (arrow) arrow.style.opacity = fill > 0.97 ? '1' : '0';
      });
    }
    var t = 0;
    window.addEventListener('scroll', function () { if (!t) t = setTimeout(function () { t = 0; tick(); }, 16); }, { passive: true });
    window.addEventListener('resize', tick);
    tick();
  }

  /* ---- トレーナー：写真の束をタップで送る ---- */
  function initDeck(main) {
    var btn = $('[data-deck]', main);
    if (!btn) return;
    var cards = $$('[data-card]', btn), cap = $('[data-deck-cap]', main), dots = $$('[data-ddot]', main);
    var DESC = ['ラックの前で、動きを見ながらその日の内容を決める', '2017年 出光アジア・タレント・カップ出場', '2022年 西日本新人王 ミニマム級 準優勝'];
    var SLOT = ['translate(0,0) rotate(0deg)', 'translate(17%,-3%) scale(.9) rotate(4deg)', 'translate(30%,-6%) scale(.8) rotate(8deg)'];
    var nC = cards.length, dk = 0;
    function render() {
      cards.forEach(function (c, i) {
        var p = (i - dk + nC) % nC;
        c.style.zIndex = String(nC - p);
        c.style.transform = SLOT[p];
        c.setAttribute('aria-hidden', p ? 'true' : 'false');
        c.style.boxShadow = p ? '0 8px 18px -10px rgba(29,27,24,.35)' : '0 20px 36px -18px rgba(29,27,24,.55)';
        c.style.filter = p ? 'saturate(.8) brightness(.94)' : 'none';
      });
      btn.setAttribute('aria-label', '次の写真へ（' + (dk + 1) + '/' + nC + '）');
      if (cap) cap.textContent = DESC[dk];
      dots.forEach(function (d, i) { d.style.width = i === dk ? '18px' : '6px'; d.style.opacity = i === dk ? '1' : '0.3'; });
    }
    btn.addEventListener('click', function () { dk = (dk + 1) % nC; render(); });
  }

  /* ---- 利用者の声：横スクロールのカルーセル（1000px以上は2枚表示） ---- */
  function initVoices(main) {
    var track = $('[data-vtrack]', main);
    if (!track) return;
    var cards = $$('[data-vcard]', track), prev = $('[data-vprev]', main), next = $('[data-vnext]', main), count = $('[data-vcount]', main);
    var n = cards.length, i = 0;
    function vis() { return window.innerWidth >= 1000 ? 2 : 1; }
    function maxI() { return Math.max(0, n - vis()); }
    function render() {
      var v = vis(), m = maxI();
      i = Math.min(i, m);
      cards.forEach(function (c, j) {
        var cur = j >= i && j < i + v;
        c.setAttribute('aria-hidden', cur ? 'false' : 'true');
        c.style.opacity = cur ? '1' : '0.55';
        $$('a', c).forEach(function (a) { a.setAttribute('tabindex', cur ? '0' : '-1'); });
      });
      if (count) count.textContent = v > 1 ? (i + 1) + '–' + (i + v) + ' / ' + n : (i + 1) + ' / ' + n;
      if (prev) { prev.disabled = i === 0; prev.style.opacity = i === 0 ? '0.35' : '1'; }
      if (next) { next.disabled = i >= m; next.style.opacity = i >= m ? '0.35' : '1'; }
    }
    function go(k) {
      k = Math.max(0, Math.min(maxI(), k));
      var c = cards[k];
      if (c) track.scrollTo({ left: c.offsetLeft - cards[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
      i = k; render();
    }
    if (prev) prev.addEventListener('click', function () { go(i - 1); });
    if (next) next.addEventListener('click', function () { go(i + 1); });
    track.addEventListener('keydown', function (e) {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    });
    track.addEventListener('scroll', function () {
      var c0 = cards[0]; if (!c0) return;
      var step = c0.getBoundingClientRect().width + 16, m = maxI();
      var k = Math.round(track.scrollLeft / step);
      if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) k = m;
      k = Math.max(0, Math.min(m, k));
      if (k !== i) { i = k; render(); }
    }, { passive: true });
    window.addEventListener('resize', render);
    render();
  }

  /* ---- 初回体験：3メニューのタブ ---- */
  function initTabs(main) {
    var tabs = $$('[role="tab"]', main);
    if (!tabs.length) return;
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    function set(k, focus) {
      tabs.forEach(function (t, i) {
        var on = i === k;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
        t.style.background = on ? '#1d1b18' : '#fbfaf7';
        t.style.color = on ? '#f8f6f1' : '#1d1b18';
        t.style.border = on ? '1.5px solid #1d1b18' : '1.5px solid rgba(29,27,24,.22)';
        t.style.boxShadow = on ? '0 2px 8px rgba(29,27,24,.18)' : 'none';
        var dot = t.querySelector('span'); if (dot) dot.style.background = on ? 'currentColor' : 'transparent';
        if (panels[i]) panels[i].hidden = !on;
      });
      if (focus) tabs[k].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { set(i); });
      t.addEventListener('keydown', function (e) {
        var k = i;
        if (e.key === 'ArrowRight') k = (i + 1) % 3; else if (e.key === 'ArrowLeft') k = (i + 2) % 3;
        else if (e.key === 'Home') k = 0; else if (e.key === 'End') k = 2; else return;
        e.preventDefault(); set(k, true);
      });
    });
    $$('[data-gotab]', main).forEach(function (a) {
      a.addEventListener('click', function () { set(+a.getAttribute('data-gotab')); });
    });
  }

  /* ---- 姿勢分析：画像の拡大表示 ---- */
  function initLightbox(main) {
    var dlg = $('[data-lb-dialog]', main);
    if (!dlg) return;
    var img = $('[data-lb-img]', dlg), label = $('[data-lb-label]', dlg), close = $('[data-lb-close]', dlg), last = null;
    var BASE = '/assets/images/top-b34/posture/';
    var P = [
      ['正面', 'front.jpg', 'サンプル：正面からの立ち姿に、関節の位置と線を重ねた画像'],
      ['横', 'side.jpg', 'サンプル：横からの立ち姿に、関節の位置と線を重ねた画像'],
      ['気になるポイント', 'points.jpg', 'サンプル：重心のズレ、猫背・反り腰、X脚・O脚の傾向を示した表示'],
      ['レポート1ページ目', 'report-p1.jpg', 'サンプル：姿勢分析レポートの1ページ目']
    ];
    function open(i) {
      last = document.activeElement;
      var p = P[i]; if (!p) return;
      img.src = BASE + p[1]; img.alt = p[2];
      label.textContent = '姿勢分析：' + p[0];
      dlg.setAttribute('aria-label', '姿勢分析：' + p[0]);
      dlg.style.display = 'flex';
      close.focus();
    }
    function shut() {
      if (dlg.style.display === 'none') return;
      dlg.style.display = 'none';
      if (last && last.focus) last.focus();
    }
    $$('[data-lb]', main).forEach(function (b) { b.addEventListener('click', function () { open(+b.getAttribute('data-lb')); }); });
    dlg.addEventListener('click', shut);
    close.addEventListener('click', shut);
    img.addEventListener('click', function (e) { e.stopPropagation(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
  }

  function init() {
    var main = document.querySelector('main.tb-main');
    if (!main) return;
    // ヒーローは v7 の固定ヘッダーの下まで敷く。オフセットは実際のヘッダーの高さに合わせる
    var hdr = document.getElementById('site-header');
    var syncHdr = function () { if (hdr && hdr.offsetHeight) main.style.setProperty('--tb-hdr', hdr.offsetHeight + 'px'); };
    syncHdr();
    window.addEventListener('resize', syncHdr);
    initHero(main);
    setTimeout(function () { intro(main); reveals(main); initFlow(main); }, 30);
    initDeck(main);
    initVoices(main);
    initTabs(main);
    initLightbox(main);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
