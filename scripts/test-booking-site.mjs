import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {verifyBookingMenus} from '../lib/bookingSiteQa.mjs';
const menus=['ジム','リカバリー','ボクシング'].map(x=>({name:'【初回体験】'+x}));
async function fixture(html,fn){const b=await chromium.launch({headless:true,args:['--no-sandbox']});try{const p=await b.newPage();await p.route('**/*',r=>r.fulfill({body:'<meta charset="utf-8">'+html,contentType:'text/html; charset=utf-8'}));await p.goto('https://booking.test/');await fn(p);}finally{await b.close();}}
function cards({missing=false,calendar=true,delayed=false}={}){return `<input type="hidden"><div id="app">${menus.slice(0,missing?2:3).map((m,i)=>`<div class="menu_header" onclick="pick(${i})">${m.name}</div>`).join('')}</div><script>const names=${JSON.stringify(menus.map(m=>m.name))};function pick(i){document.querySelector('#app').innerHTML='<h2>'+names[i]+'</h2><div class=main_table_wrapper></div>'+${JSON.stringify(calendar?'<table><tr><th>時間</th></tr></table>':'')};${calendar?`setTimeout(()=>document.querySelector('#app').insertAdjacentHTML('beforeend','<table><tr><td>09:00</td></tr></table>'),${delayed?200:0});`:''}}</script>`;}
test('current cards open real time tables outside old wrapper without visible input/select',()=>fixture(cards(),async p=>{const r=await verifyBookingMenus(p,menus,{returnUrl:'https://booking.test/',timeout:5000});assert.equal(r.length,3);assert(r.every(x=>x.calendar_visible));}));
test('previous native select remains supported',()=>fixture(`<select>${menus.map(m=>`<option>${m.name}</option>`).join('')}</select>`,async p=>{const r=await verifyBookingMenus(p,menus,{timeout:5000});assert(r.every(x=>x.control==='native_select'));}));
test('missing actual menu fails instead of accepting public API data alone',()=>fixture(cards({missing:true}),p=>assert.rejects(()=>verifyBookingMenus(p,menus,{returnUrl:'https://booking.test/',timeout:300}),/Timeout/)));
test('menu that cannot open calendar fails without submitting a reservation',()=>fixture(cards({calendar:false}),p=>assert.rejects(()=>verifyBookingMenus(p,menus,{returnUrl:'https://booking.test/',timeout:300}),/Timeout/)));

test('asynchronous time cells in a separate body table are awaited',()=>fixture(cards({delayed:true}),async p=>{const r=await verifyBookingMenus(p,menus,{returnUrl:'https://booking.test/',timeout:5000});assert.equal(r.length,3);}));
