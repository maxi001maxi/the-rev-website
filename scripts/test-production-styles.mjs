import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {verifyStyles} from './verify-production-styles.mjs';
for(const scenario of ['v7 dedicated CSS','stale CSS','truncated HTML'])test(scenario,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rev-css-'));
 try{fs.mkdirSync(path.join(root,'assets/css'),{recursive:true});
 const html='<html><link href="/assets/css/top-v7.css" rel="stylesheet"><body>approved</body></html>';
 fs.writeFileSync(path.join(root,'index.html'),html);fs.writeFileSync(path.join(root,'assets/css/top-v7.css'),'body{color:#123}');
 const fetcher=async url=>{let body=url.pathname==='/index.html'?html:'body{color:#123}';if(scenario==='stale CSS'&&url.pathname.endsWith('.css'))body='old';if(scenario==='truncated HTML'&&url.pathname.endsWith('.html'))body=html.slice(0,30);return new Response(body,{status:200});};
 const run=()=>verifyStyles({root,origin:'https://therev-lab.com',fetcher,pages:['index.html']});
 if(scenario==='v7 dedicated CSS')assert.equal((await run()).length,1);else await assert.rejects(run);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
