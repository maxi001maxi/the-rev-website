/* THE REV. 下層ページ共通：スマホ下部の固定バー（トップと同じ挙動）
   先頭（.sb-hero）を過ぎたら出し、最後の案内（[data-sb-hide]）とフッターが見えている間は隠す。 */
(function () {
  'use strict';
  var bar = document.querySelector('[data-sb-bar]');
  var hero = document.querySelector('.sb-hero');
  if (!bar || !hero || !('IntersectionObserver' in window)) return;
  var hides = Array.prototype.slice.call(document.querySelectorAll('[data-sb-hide], footer'));
  var pastHero = false;
  var hidden = {};
  function update() {
    var blocked = Object.keys(hidden).some(function (k) { return hidden[k]; });
    var on = pastHero && !blocked;
    bar.classList.toggle('is-on', on);
    bar.setAttribute('aria-hidden', on ? 'false' : 'true');
    Array.prototype.forEach.call(bar.querySelectorAll('a'), function (a) { a.tabIndex = on ? 0 : -1; });
  }
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; });
    update();
  }).observe(hero);
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { hidden[e.target.__sbId] = e.isIntersecting; });
    update();
  });
  hides.forEach(function (el, i) { el.__sbId = 'h' + i; io.observe(el); });
})();
