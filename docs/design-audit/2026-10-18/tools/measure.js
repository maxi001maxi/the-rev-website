(() => {
  const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.01; };
  const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const st = (el, props) => { const s = getComputedStyle(el); const o = {}; props.forEach(p => o[p] = s.getPropertyValue(p)); return o; };
  const txt = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const header = document.querySelector('#site-header') || document.querySelector('header.site-header');
  const out = { url: location.pathname, vw: innerWidth, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, scrollY };
  out.hOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  if (out.hOverflow) {
    out.overflowers = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1 && r.width > 0 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 8).map(e => ({ tag: e.tagName, cls: String(e.className).slice(0, 60), right: Math.round(e.getBoundingClientRect().right) }));
  }
  if (header) {
    const inner = header.querySelector('.rev-home-header-inner') || header;
    out.header = { kind: header.id === 'site-header' ? 'native' : 'legacy', cls: header.className, rect: rect(header), innerRect: rect(inner),
      style: st(header, ['position', 'background-color', 'border-bottom-color', 'border-bottom-width', 'box-shadow', 'padding-left', 'padding-right', 'backdrop-filter']),
      innerPad: st(inner, ['padding-left', 'padding-right', 'max-width']) };
    const logos = [...header.querySelectorAll('img')].filter(vis);
    out.logo = logos.map(l => ({ src: l.getAttribute('src'), rect: rect(l), opacity: getComputedStyle(l).opacity }));
    const links = [...header.querySelectorAll('nav a, .nav a')].filter(vis);
    out.links = links.map(a => ({ t: txt(a), rect: rect(a), ...st(a, ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'padding-left', 'background-color', 'border-top-color', 'border-radius']), current: a.getAttribute('aria-current') }));
    const tg = header.querySelector('#menu-toggle, .nav-toggle');
    out.toggle = tg && vis(tg) ? { rect: rect(tg), label: txt(tg), color: getComputedStyle(tg).color, bars: [...tg.querySelectorAll('span span, :scope > span')].filter(vis).map(s => ({ w: rect(s).w, h: rect(s).h, bg: getComputedStyle(s).backgroundColor })) } : null;
  }
  const hs = [...document.querySelectorAll('h1, h2, h3')].filter(vis).slice(0, 14);
  out.headings = hs.map(h => ({ tag: h.tagName, t: txt(h), rect: rect(h), ...st(h, ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'color', 'word-break', 'line-break', 'text-wrap']) }));
  const ps = [...document.querySelectorAll('main p, section p, article p')].filter(vis).filter(p => txt(p).length > 25).slice(0, 6);
  out.paras = ps.map(p => ({ t: txt(p), w: rect(p).w, ...st(p, ['font-family', 'font-size', 'line-height', 'letter-spacing', 'color', 'font-weight']) }));
  const ctas = [...document.querySelectorAll('a[data-track="reserve_click"], a[data-track="line_click"], .btn, [class*="btn"], [class*="cta"]')].filter(vis).filter(e => !e.closest('header,[role=dialog]')).slice(0, 14);
  out.ctas = ctas.map(a => ({ t: txt(a), cls: String(a.className).slice(0, 50), rect: rect(a), ...st(a, ['font-size', 'font-weight', 'letter-spacing', 'background-color', 'color', 'border-top-width', 'border-top-color', 'border-radius', 'padding-left', 'padding-top']) }));
  const footer = document.querySelector('footer');
  out.footer = footer ? { cls: footer.className, rect: rect(footer), ...st(footer, ['background-color', 'color', 'font-family', 'padding-top', 'padding-bottom']) } : null;
  const secs = [...document.querySelectorAll('main > section, body > section, main section')].filter(vis).slice(0, 24);
  out.sections = secs.map(s => ({ id: s.id, cls: String(s.className).slice(0, 40), h: Math.round(s.getBoundingClientRect().height), ...st(s, ['padding-top', 'padding-bottom', 'background-color']) }));
  out.bodyFont = st(document.body, ['font-family', 'font-size', 'line-height', 'color', 'background-color']);
  out.fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i);
  return out;
})()
