// Shared current-location state and native v7 navigation. No prototype router.
(() => {
  const path = location.pathname.replace(/index\.html$/, '');
  function markCurrent() {
    document.querySelectorAll('header a[href], [role="dialog"] nav a[href]').forEach(a => {
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const targetPath = url.pathname.replace(/index\.html$/, '');
      const samePage = targetPath === path || (targetPath === '/blog/' && path.startsWith('/blog/'));
      const active = samePage &&
        (url.hash ? url.hash === location.hash : path !== '/');
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  markCurrent();
  window.addEventListener('hashchange', markCurrent);
  const header = document.querySelector('#site-header');
  const button = document.querySelector('#menu-toggle');
  const drawer = document.querySelector('.rev-native-drawer');
  if (!header || !button || !drawer) return; // Existing pages use main.js drawer.
  let savedY = 0;
  const focusable = () => [...drawer.querySelectorAll('a[href],button')].filter(el => el.getClientRects().length);
  function close(restoreFocus = true) {
    if (drawer.hidden) return;
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('rev-menu-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo({top:savedY, behavior:'instant'});
    if (restoreFocus && button.getClientRects().length) button.focus({preventScroll: true});
  }
  button.addEventListener('click', () => {
    savedY = window.scrollY;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('rev-menu-open');
    document.body.style.position = 'fixed';
    document.body.style.top = -savedY + 'px';
    document.body.style.width = '100%';
    focusable()[0]?.focus({preventScroll: true});
  });
  drawer.querySelector('[data-menu-close]')?.addEventListener('click', () => close());
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => close(false)));
  document.addEventListener('keydown', e => {
    if (drawer.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key !== 'Tab') return;
    const items = focusable(), first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus({preventScroll: true}); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus({preventScroll: true}); }
  });
  const updateHeader = () => header.classList.toggle('rev-is-scrolled', scrollY > 24);
  window.addEventListener('scroll', updateHeader, {passive:true});
  window.addEventListener('pageshow', event => {if(event.persisted) close(false); updateHeader();});
  window.addEventListener('resize', () => {if(innerWidth >= 1400) close(false);});
  updateHeader();
})();
