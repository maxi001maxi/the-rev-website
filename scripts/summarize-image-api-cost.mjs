// 画像APIの使用量の集計（台帳 editorial/image-api-ledger/*.json から）。
// 出力: 記事×版ごとの 生成回数 / QC回数 / 入力・出力トークン / 概算費用(円)。
// 概算費用は editorial/image-attempt-policy.json の単価が入っている場合のみ。未確認なら null。実請求はOpenAI管理画面が正。
import fs from 'node:fs';
import path from 'node:path';
import {estimateCostJpy} from '../lib/editorialImageApiLedger.mjs';
const dir='editorial/image-api-ledger';
const rows=[['slug','asset_version','generation_calls','qc_calls','input_tokens','output_tokens','estimated_cost_jpy','last_call_at']];
for(const f of fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>x.endsWith('.json')).sort():[]){
  const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')),calls=(d.calls||[]).filter(c=>c.status==='COMPLETED');
  const sum=k=>calls.reduce((a,c)=>a+(c.usage?.[k]||0),0);
  const cost=calls.map(c=>c.estimated_cost_jpy??estimateCostJpy(c.usage));
  rows.push([d.slug,d.asset_version,calls.filter(c=>c.kind==='generation').length,calls.filter(c=>c.kind==='qc').length,
    sum('input_tokens'),sum('output_tokens'),cost.some(x=>x==null)?null:Math.round(cost.reduce((a,b)=>a+b,0)*100)/100,calls.at(-1)?.completed_at||'']);
}
console.log(rows.map(r=>r.join(',')).join('\n'));
