// Native controls for the approved TOP v7. The complete content is static HTML.
(() => {
  const keys = ['training','boxing','recovery'];
  const tabs = keys.map(key => document.getElementById('tab-' + key));
  function select(key, {focus=false, scroll=false}={}) {
    if (!keys.includes(key)) return;
    keys.forEach((item,i) => {
      const selected = key === item, panel = document.getElementById('trial-' + item);
      tabs[i].setAttribute('aria-selected', String(selected));
      tabs[i].tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
      panel.style.display = selected ? 'flex' : 'none';
    });
    if (focus) document.getElementById('tab-' + key).focus();
    if (scroll) document.getElementById('trial').scrollIntoView({block:'start'});
  }
  tabs.forEach((tab,i) => tab.addEventListener('click', () => select(keys[i])));
  document.querySelector('[role="tablist"]')?.addEventListener('keydown', e => {
    const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    const next = {ArrowRight:(current+1)%3,ArrowLeft:(current+2)%3,Home:0,End:2}[e.key];
    if (next === undefined) return;
    e.preventDefault(); select(keys[next], {focus:true});
  });
  document.querySelectorAll('a[data-trial]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    history.pushState(null,'','#trial-' + a.dataset.trial);
    select(a.dataset.trial, {scroll:true});
  }));
  const fromHash = () => {
    const match = location.hash.match(/^#trial-(training|boxing|recovery)$/);
    if (match) select(match[1], {scroll:true});
  };
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  fromHash();
  const rail = document.getElementById('voice-rail');
  const prev = document.querySelector('[aria-label="前の声へ"]');
  const next = document.querySelector('[aria-label="次の声へ"]');
  function railState() {
    if (!rail) return;
    prev.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  }
  function move(dir) {
    rail.scrollBy({left:dir * ((rail.querySelector('article')?.getBoundingClientRect().width || 320)+20),
      behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth'});
  }
  prev?.addEventListener('click', () => move(-1));
  next?.addEventListener('click', () => move(1));
  rail?.addEventListener('scroll', railState, {passive:true});
  window.addEventListener('resize', railState);
  railState();
})();
