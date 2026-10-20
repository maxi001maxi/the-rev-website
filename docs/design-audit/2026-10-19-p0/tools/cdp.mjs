// Minimal CDP driver for headless Chrome (no npm deps). Analytics hosts are blocked
// so the audit does not pollute GA4/GTM data.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch(profileDir, port = 9333) {
  fs.mkdirSync(profileDir, { recursive: true });
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--force-color-profile=srgb', '--lang=ja-JP', 'about:blank'
  ], { stdio: 'ignore' });
  let list;
  for (let i = 0; i < 50; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch {}
    await sleep(200);
  }
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
    else if (msg.method) listeners.forEach(l => l(msg));
  };
  let alive = true; ws.onclose = () => { alive = false; pending.forEach(p => p.rej(new Error('ws closed'))); pending.clear(); };
  proc.on('exit', () => { alive = false; });
  const send = (method, params = {}) => new Promise((res, rej) => { if (!alive) return rej(new Error('chrome dead')); const i = ++id; const t = setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('timeout ' + method)); } }, 60000); pending.set(i, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = fn => listeners.push(fn);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*google-analytics.com*', '*analytics.google.com*', '*doubleclick.net*', '*connect.facebook.net*', '*clarity.ms*'] });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  return { send, on, isAlive: () => alive, close: () => { try { ws.close(); } catch {} proc.kill(); } };
}

export async function evaluate(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

export async function setViewport(c, width, height) {
  const mobile = width <= 768;
  await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  await c.send('Emulation.setUserAgentOverride', { userAgent: mobile
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', acceptLanguage: 'ja-JP' });
}

export async function goto(c, url) {
  const loaded = new Promise(res => { const l = m => { if (m.method === 'Page.loadEventFired') res(); }; c.on(l); });
  await c.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(9000)]);
  await evaluate(c, 'document.fonts ? document.fonts.ready.then(()=>true) : true');
  await sleep(1800);
}

export async function shot(c, file, { full = false, quality = 72 } = {}) {
  let params = { format: 'jpeg', quality };
  if (full) {
    const h = await evaluate(c, 'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
    const w = await evaluate(c, 'document.documentElement.clientWidth');
    params = { ...params, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, 16000), scale: 1 } };
  }
  const r = await c.send('Page.captureScreenshot', params);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}

export async function click(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

export async function key(c, k, opts = {}) {
  const map = { Escape: 27, Tab: 9, Enter: 13 };
  const base = { key: k, code: k, windowsVirtualKeyCode: map[k], nativeVirtualKeyCode: map[k], modifiers: opts.shift ? 8 : 0 };
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

export { sleep };
export const withTimeout = (p, ms, label = 'op') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('watchdog ' + label)), ms))]);
