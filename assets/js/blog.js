/* ===================================================================
   THE REV. CONDITIONING LAB. — blog.js
   Blog / Column 専用の最小限のJS。目次クリックのスムーススクロールのみ。
   記事の表示自体はJSに依存しない（Markdown→静的HTML生成のみで完結）。
   =================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initTocScroll() {
    var links = document.querySelectorAll('.blog-toc-list a[href^="#"]');
    if (!links.length || reduceMotion) return;

    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function (event) {
        var id = link.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.pushState) history.pushState(null, '', '#' + id);
      });
    });
  }

  function boot() {
    initTocScroll();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
