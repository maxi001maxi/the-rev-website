/* THE REV. TOP — C ブラッシュアップ検討用
   予約・LINE はデモダイアログのみ。外部遷移・送信・計測（dataLayer）は行わない。 */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header state ---------- */
  var header = document.getElementById('header');
  var hero = document.getElementById('top');
  function updateHeader() {
    if (!header || !hero) return;
    // ヒーロー上で透明ヘッダーがH1と重ならないよう、少しでもスクロールしたら面を敷く
    header.setAttribute('data-state', window.scrollY > 24 ? 'solid' : 'over-hero');
  }
  window.addEventListener('scroll', updateHeader, { passive: true });
  window.addEventListener('resize', updateHeader);
  updateHeader();

  /* ---------- Mobile drawer ---------- */
  var toggle = header && header.querySelector('.menu-toggle');
  var drawer = document.getElementById('drawer');
  function setDrawer(open) {
    if (!toggle || !drawer) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.menu-toggle__label').textContent = open ? '閉じる' : 'メニュー';
    header.classList.toggle('is-open', open);
    if (open) {
      drawer.style.setProperty('--drawer-top', header.getBoundingClientRect().bottom + 'px');
      drawer.hidden = false;
      document.body.style.overflow = 'hidden';
      var first = drawer.querySelector('a');
      if (first) first.focus();
    } else {
      drawer.hidden = true;
      document.body.style.overflow = '';
    }
  }
  if (toggle && drawer) {
    toggle.addEventListener('click', function () {
      setDrawer(toggle.getAttribute('aria-expanded') !== 'true');
    });
    drawer.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a && a.getAttribute('href').charAt(0) === '#' && !a.hasAttribute('data-demo')) setDrawer(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setDrawer(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 961px)').addEventListener('change', function (m) {
      if (m.matches) setDrawer(false);
    });
  }

  /* ---------- Trial tabs (WAI-ARIA tabs, manual activation by click / auto by arrows) ---------- */
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    function select(i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
        if (on && !reduce) {
          panels[j].classList.remove('is-entering');
          void panels[j].offsetWidth;
          panels[j].classList.add('is-entering');
        }
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i, false); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, k = e.key, to = null;
        if (k === 'ArrowRight') to = (i + 1) % n;
        else if (k === 'ArrowLeft') to = (i - 1 + n) % n;
        else if (k === 'Home') to = 0;
        else if (k === 'End') to = n - 1;
        if (to !== null) { e.preventDefault(); select(to, true); }
      });
    });
    select(0, false);
  });

  /* ---------- Demo CTA dialog ---------- */
  var RESERVE = 'https://cl.gyms.jp/t/CC2237480443/';
  var LINE = 'https://lin.ee/UXE0bLd';
  var dialog = document.getElementById('demo-dialog');
  function fill(slot, text) {
    var el = dialog.querySelector('[data-slot="' + slot + '"]');
    if (el) el.textContent = text;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-demo]');
    if (!a || !dialog || typeof dialog.showModal !== 'function') return;
    e.preventDefault();
    var kind = a.getAttribute('data-demo');
    var placement = a.getAttribute('data-placement') || '';
    if (kind === 'reserve') {
      fill('lead', '本番では、外部の予約ページを新しいタブで開きます。予約ページでメニュー → 日時 → お客様情報 → 確認の順に進みます。');
      fill('url', RESERVE + '?utm_source=website&utm_medium=referral&utm_campaign=trial&utm_content=' + placement);
    } else {
      fill('lead', '本番では、THE REV. 公式LINEを新しいタブで開きます。料金・持ち物・来店前の質問などを相談できます（返信時間の保証はありません）。');
      fill('url', LINE);
    }
    fill('placement', placement + (/(home_trial$|home_hero_line)/.test(placement) ? '（新規候補・未観測）' : ''));
    fill('event', a.getAttribute('data-track') || '');
    if (header && header.classList.contains('is-open')) setDrawer(false);
    dialog.showModal();
  });

  /* ---------- Light reveal ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.sec-head, .svc, .mstep, .quote, .trial__layout, .prow, .person__layout, .qitem, .final__inner');
    doc.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(function (t) { t.classList.add('rv'); io.observe(t); });
  }
})();
