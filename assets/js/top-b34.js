/* ===================================================================
   THE REV. トップページ（B3.4デザイン）専用スクリプト
   index.html の main.tb-main が無ければ何もしない。他ページには影響しない。
   フェードイン表示自体は assets/js/main.js の initReveal() が担う
   （.reveal クラスを使う既存の仕組みをそのまま利用）。
   =================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initTopB34() {
    var main = document.querySelector('main.tb-main');
    if (!main) return;

    // 写真デッキ（タップで次の経歴写真へ）
    var deckBtn = document.getElementById('tbDeckBtn');
    if (deckBtn) {
      var cards = Array.prototype.slice.call(deckBtn.querySelectorAll('.tb-deck-card'));
      var caps = ['ラックの前で、動きを見ながらその日の内容を決める', '2017年 出光アジア・タレント・カップ出場', '2022年 西日本新人王 ミニマム級 準優勝'];
      var dk = 0;
      var capEl = document.getElementById('tbDeckCap');
      var dotsEl = document.getElementById('tbDeckDots');
      var dots = dotsEl ? Array.prototype.slice.call(dotsEl.children) : [];
      var slot = ['translate(0,0) rotate(0deg)', 'translate(17%,-3%) scale(.9) rotate(4deg)', 'translate(30%,-6%) scale(.8) rotate(8deg)'];
      function renderDeck() {
        var n = cards.length;
        cards.forEach(function (c, i) {
          var p = (i - dk + n) % n;
          c.style.zIndex = String(n - p);
          c.style.transform = slot[p];
          c.style.filter = p ? 'saturate(.8) brightness(.94)' : 'none';
        });
        if (capEl) capEl.textContent = caps[dk] || '';
        dots.forEach(function (d, i) { d.className = i === dk ? 'on' : ''; });
        deckBtn.setAttribute('aria-label', '次の写真へ（' + (dk + 1) + '/' + cards.length + '）');
      }
      deckBtn.addEventListener('click', function () {
        dk = (dk + 1) % cards.length;
        renderDeck();
      });
    }

    // 初回体験タブ
    var tabs = Array.prototype.slice.call(main.querySelectorAll('.tb-tab'));
    var panels = Array.prototype.slice.call(main.querySelectorAll('.tb-trial-set'));
    function selectTab(i) {
      tabs.forEach(function (t, idx) {
        var on = idx === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function (p, idx) { p.hidden = idx !== i; });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { selectTab(i); });
      t.addEventListener('keydown', function (e) {
        var i2 = i;
        if (e.key === 'ArrowRight') i2 = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') i2 = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') i2 = 0;
        else if (e.key === 'End') i2 = tabs.length - 1;
        else return;
        e.preventDefault();
        tabs[i2].focus();
        selectTab(i2);
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll('[data-tab-goto]'), function (a) {
      a.addEventListener('click', function () {
        var i = parseInt(a.getAttribute('data-tab-goto'), 10);
        if (!isNaN(i) && tabs[i]) selectTab(i);
      });
    });

    // 利用した方の声（横スクロールカルーセル）
    var track = document.getElementById('tbVoicesTrack');
    if (track) {
      var prevBtn = document.getElementById('tbVoicesPrev');
      var nextBtn = document.getElementById('tbVoicesNext');
      var counterEl = document.getElementById('tbVoicesCounter');
      var vcCards = Array.prototype.slice.call(track.children);
      var total = vcCards.length;
      function visCount() { return window.innerWidth >= 1000 ? 2 : 1; }
      function currentIndex() {
        var step = vcCards[0].getBoundingClientRect().width + 16;
        return Math.round(track.scrollLeft / step);
      }
      function updateCounter() {
        var vis = visCount();
        var i = Math.min(currentIndex(), Math.max(0, total - vis));
        if (counterEl) {
          counterEl.textContent = vis > 1 ? (i + 1) + '–' + Math.min(total, i + vis) + ' / ' + total : (i + 1) + ' / ' + total;
        }
        if (prevBtn) prevBtn.disabled = i <= 0;
        if (nextBtn) nextBtn.disabled = i >= total - vis;
      }
      function goTo(i) {
        var vis = visCount();
        var maxI = Math.max(0, total - vis);
        i = Math.max(0, Math.min(maxI, i));
        var step = vcCards[0].getBoundingClientRect().width + 16;
        track.scrollTo({ left: i * step, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      if (prevBtn) prevBtn.addEventListener('click', function () { goTo(currentIndex() - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { goTo(currentIndex() + 1); });
      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex() + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex() - 1); }
      });
      var scrollTimer = null;
      track.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(updateCounter, 80);
      }, { passive: true });
      window.addEventListener('resize', updateCounter);
      updateCounter();
    }

    // 姿勢ナビ・レポートサンプルのライトボックス
    var lb = document.getElementById('tbLightbox');
    if (lb) {
      var lbImg = document.getElementById('tbLightboxImg');
      var lbCap = document.getElementById('tbLightboxCap');
      var lbClose = document.getElementById('tbLightboxClose');
      var lastFocus = null;
      function openLb(src, alt, label) {
        lastFocus = document.activeElement;
        lbImg.src = src; lbImg.alt = alt || '';
        lbCap.textContent = label ? (label + '（サンプル）') : '';
        lb.setAttribute('aria-label', label || '拡大表示');
        lb.classList.add('open');
        lbClose.focus();
      }
      function closeLb() {
        lb.classList.remove('open');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }
      Array.prototype.forEach.call(main.querySelectorAll('[data-lb-src]'), function (btn) {
        btn.addEventListener('click', function () {
          openLb(btn.getAttribute('data-lb-src'), btn.getAttribute('data-lb-alt'), btn.getAttribute('data-lb-label'));
        });
      });
      lbClose.addEventListener('click', closeLb);
      lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && lb.classList.contains('open')) closeLb();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTopB34);
  } else {
    initTopB34();
  }
})();
