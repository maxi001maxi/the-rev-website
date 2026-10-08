/* TOP v2.2 UI only. Canonical analytics remains in main.js. */
(function () {
  'use strict';
  function boot() {
    var root = document.querySelector('body.top-v22');
    if (!root) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var tabs = Array.from(document.querySelectorAll('[data-trial]'));
    var panels = Array.from(document.querySelectorAll('[data-trial-panel]'));
    function selectTrial(key) {
      tabs.forEach(function (tab) {
        var selected = tab.dataset.trial === key;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      panels.forEach(function (panel) {
        var selected = panel.dataset.trialPanel === key;
        panel.hidden = !selected;
        panel.classList.remove('reveal-switch');
        if (selected && !reduce) {
          void panel.offsetWidth;
          panel.classList.add('reveal-switch');
        }
      });
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { selectTrial(tab.dataset.trial); });
      tab.addEventListener('keydown', function (event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
          (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectTrial(tabs[next].dataset.trial);
        tabs[next].focus();
      });
    });
    selectTrial('training');
    document.querySelector('.trial-tabs').hidden = false;
    root.classList.add('top-v22-ready');

    var gallery = document.querySelector('.services');
    var controls = document.querySelector('.service-nav');
    var current = document.querySelector('#service-position');
    function step() { return gallery.querySelector('.service').getBoundingClientRect().width + 19; }
    function showPosition() {
      var index = Math.max(0, Math.min(2, Math.round(gallery.scrollLeft / step())));
      current.textContent = '0' + (index + 1) + ' / 03 · ' + ['Training', 'Boxing', 'Recovery'][index];
      controls.querySelector('[data-slide="-1"]').disabled = index === 0;
      controls.querySelector('[data-slide="1"]').disabled = index === 2;
    }
    function move(left) { gallery.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' }); }
    controls.querySelectorAll('[data-slide]').forEach(function (button) {
      button.addEventListener('click', function () { move(gallery.scrollLeft + Number(button.dataset.slide) * step()); });
    });
    gallery.addEventListener('scroll', showPosition, { passive: true });
    gallery.addEventListener('keydown', function (event) {
      if (event.target !== gallery || getComputedStyle(gallery).overflowX !== 'auto') return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      move(event.key === 'Home' ? 0 : event.key === 'End' ? gallery.scrollWidth :
        gallery.scrollLeft + (event.key === 'ArrowRight' ? step() : -step()));
    });
    if ('ResizeObserver' in window) new ResizeObserver(showPosition).observe(gallery);
    showPosition();

    var trigger = document.querySelector('.mobile-menu');
    var menu = document.querySelector('#menu-dialog');
    var fixed = document.querySelector('.rev-fixed-cta');
    var hero = document.querySelector('#hero');
    var final = document.querySelector('#contact');
    var footer = document.querySelector('.footer');
    function updateFixed() {
      var last = final.getBoundingClientRect();
      var foot = footer.getBoundingClientRect();
      fixed.hidden = menu.open || hero.getBoundingClientRect().bottom > 0 ||
        (last.top < window.innerHeight && last.bottom > 0) ||
        (foot.top < window.innerHeight && foot.bottom > 0);
    }
    trigger.addEventListener('click', function () {
      menu.showModal();
      trigger.setAttribute('aria-expanded', 'true');
      root.classList.add('menu-open');
      updateFixed();
    });
    menu.addEventListener('close', function () {
      trigger.setAttribute('aria-expanded', 'false');
      root.classList.remove('menu-open');
      updateFixed();
    });
    document.querySelector('#close-menu').addEventListener('click', function () { menu.close(); });
    menu.addEventListener('click', function (event) { if (event.target === menu) menu.close(); });
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.close();
        var href = link.getAttribute('href');
        if (href && href.charAt(0) === '#') {
          var target = document.getElementById(href.slice(1));
          if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
        }
      });
    });
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(updateFixed, { threshold: [0] });
      [hero, final, footer].forEach(function (element) { observer.observe(element); });
    } else {
      window.addEventListener('scroll', updateFixed, { passive: true });
    }
    window.addEventListener('resize', updateFixed, { passive: true });
    updateFixed();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
