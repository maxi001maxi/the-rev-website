// Oct17 owner resumed after replenishing the API credits; retry identical independent QC against the unchanged approved article source.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const root = 'editorial/prepublication/2026-10-18-contract-checklist';
const reportPath = root + '/FINAL_QC_RESULT.json';
const report = { content_id:'BLOG-20261018-082d82', report_version:'independent-qc-v080-source-excerpts-v2',
  checked_at:new Date().toISOString(), pass:false, issue_count:null, owner_publish_approved:false,
  publish_status:'NOT_PUBLISHED', error:null };
try {
  const source = fs.readFileSync(root+'/ARTICLE_DRAFT.md','utf8');
  report.source_sha256 = createHash('sha256').update(source).digest('hex');
  const title = source.split('\n')[0].replace(/^#\s*/,'').trim();
  const introIndex = source.indexOf('\n\n',source.indexOf('> **未公開'));
  const body = source.slice(introIndex+2).trim();
  if(introIndex<0 || !body.startsWith('「パーソナルジム') || !body.includes('12月末') || !body.includes('ジムによって料金')) throw new Error('APPROVED_REVISION_NOT_FOUND');
  const stripped = s=>s.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\n\s*\n/g,'\n');
  const price = stripped(fs.readFileSync('price.html','utf8'));
  const terms = stripped(fs.readFileSync('terms.html','utf8'));
  const p1=price.indexOf('01\nまずは体験'),p2=price.indexOf('04\nパーソナルボクシング');
  const t1=terms.indexOf('第17条'),t2=terms.indexOf('第26条',t1+2);
  if(p1<0||p2<=p1||t1<0||t2<=t1)throw new Error('OFFICIAL_SOURCES_MISSING');
  const evidence={source_price:'Official THE REV price.html, excerpt',price:price.slice(p1,p2),
    source_terms:'Official THE REV terms.html, Articles 17–25',terms:terms.slice(t1,t2),
    owner_interview:'Anonymous first-party personal trainer viewpoint: Fear and uncertainty can coexist with voluntary start. No guarantee of continued attendance, health benefits, refunds or company procedures beyond official regulations.',
    consumer_advisory:'National Consumer Affairs Center, Oct 7 2026, https://www.kokusen.go.jp/news/data/n-20261007_1.html, independently checked in previous editorial source verification; link is a supplementary external reference, not used to determine shop fees or terms.'};
  const keys=['question_resolution','understanding_gain','decision_support','concreteness_evidence','originality_readability'];
  const scoreProps=Object.fromEntries(keys.map(k=>[k,{type:'integer',minimum:0,maximum:4}]));
  const schema={type:'object',additionalProperties:false,properties:{scores:{type:'object',additionalProperties:false,properties:scoreProps,required:keys},issues:{type:'array',items:{type:'string'}},source_unverified:{type:'boolean'},reason:{type:'string'}},required:['scores','issues','source_unverified','reason']};
  if(!process.env.OPENAI_API_KEY)throw new Error('MODEL_CREDENTIAL_UNAVAILABLE');
  const resp=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6',store:false,max_output_tokens:2200,text:{format:{type:'json_schema',name:'editorial_quality_v080',strict:true,schema}},
    input:[{role:'system',content:[{type:'input_text',text:'You are an independent, critical Japanese editorial quality reviewer, not the writer and unaware of earlier evaluations. Score each of 5 axes 0-4. Audit all concrete amounts, deadlines and cancellation claims against the actual quoted official sources. Return issues ONLY for material publish-blocking problems, including material source uncertainty, legal overclaims, objectively incorrect facts or unsafe sales pressure. Put mere positive observations and OPTIONAL style improvements in the reason, not the issues list. Only set source_unverified true when material statements lack evidence. This is a brief friendly THREE-item customer guide explaining one gym, not a competitor price comparison. Do NOT fabricate sources or findings. Scores are not actual readership tests.'}]},
      {role:'user',content:[{type:'input_text',text:JSON.stringify({title,body_markdown:body,evidence})}]}]})});
  report.model='gpt-5.6';
  report.model_request_id=resp.headers.get('x-request-id')||null;
  const json=await resp.json();
  if(!resp.ok)throw new Error('QC_MODEL_ERROR '+resp.status+' '+String(json.error?.message||''));
  const reply=(json.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  const result=JSON.parse(reply);
  const scores=keys.map(k=>result.scores?.[k]);
  const total=scores.reduce((s,n)=>s+(Number.isInteger(n)?n:0),0);
  const valid=scores.every(n=>Number.isInteger(n)&&n>=0&&n<=4)&&Array.isArray(result.issues)&&typeof result.source_unverified==='boolean';
  report.scores=result.scores;report.score_total=total;report.issues=result.issues;report.issue_count=result.issues?.length??null;
  report.source_unverified=result.source_unverified;report.reason=result.reason;
  report.pass=valid&&total>=16&&scores.every(n=>n>=2)&&result.issues.length===0&&!result.source_unverified;
  report.evidence_sources=['price.html','terms.html','owner interview, anonymized'];
}catch(e){report.error=String(e.stack||e).slice(0,1800);}
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,score:report.score_total,issues:report.issues,error:report.error,source_sha256:report.source_sha256}));
