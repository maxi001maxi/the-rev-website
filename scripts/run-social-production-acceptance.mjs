import fs from 'node:fs';
import vm from 'node:vm';

const inputPath=process.argv[2];
if(!inputPath) throw new Error('Usage: node scripts/run-social-production-acceptance.mjs <input.json>');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const gasSource=fs.readFileSync(new URL('../editorial/gas/SocialDirector_v0.5_ONE_PASTE.gs',import.meta.url),'utf8');

const normalizeRows=(value)=>{
  if(Array.isArray(value)) return value;
  if(Array.isArray(value?.result)) return value.result;
  if(Array.isArray(value?.rows)) return value.rows;
  if(typeof value?.result==='string'){
    const text=value.result;
    const start=text.indexOf('[');
    const end=text.lastIndexOf(']');
    if(start>=0 && end>start){
      try {
        const parsed=JSON.parse(text.slice(start,end+1));
        if(Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }
  return [];
};
const editorialRows=normalizeRows(input.editorial_history);
const priorRuns=normalizeRows(input.prior_social_runs);

const canonicalHistory=(input.social_history||[]).map(row=>({
  published_at: row.date,
  format: row.format,
  media_type: row.format,
  caption: row.caption||'',
  title: row.title||null,
  topic: row.topic||null,
  angle: row.angle||null,
  main_claim: row.main_claim||null,
  content_lane: row.content_lane||null,
  territory: row.territory||null,
  ownership: row.ownership||null,
  source: 'METRICOOL',
  latest_metrics:{
    views:row.views??null,
    reach:row.reach??null,
    likes:row.likes??null,
    saves:row.saves??null,
    shares:row.shares??null,
    comments:row.comments??null,
    follows:row.follows??null
  }
}));

let capturedCtx=null;
const sandbox={
  console, JSON, String, Number, Array, Object, Date, Error, Math,
  ss_:()=>({getSheetByName:(name)=>({name})}),
  getObjectsWithRow_:(sheet)=>{
    if(sheet?.name==='21_WEB_BLOG_OUTPUT') return editorialRows.map(x=>({
      title:x.title,
      target_keyword:x.category||'',
      status:x.publish_status||''
    }));
    return [];
  },
  getTargetWeekStart_:()=>new Date(input.target_date+'T00:00:00+09:00'),
  buildM6Context_:()=>({
    target_date:input.target_date,
    phase:input.phase,
    verified_facts:input.verified_facts||[],
    first_party_interview:input.first_party||[],
    prior_social_runs:priorRuns,
    explicit_constraints:input.explicit_constraints||{},
    weekly_editorial_brief:{
      source:'LIVE_ACCEPTANCE_INPUT',
      target_date:input.target_date
    }
  }),
  generateBlogTopicCandidates_:(ctx,count)=>{
    capturedCtx=JSON.parse(JSON.stringify(ctx));
    return Array.from({length:count},(_,i)=>({
      title_candidate:'CAPTURE_ONLY_'+(i+1),
      why_now:'capture',
      unique_angle:'capture',
      preview_lead:'capture',
      total_score:1
    }));
  }
};
vm.createContext(sandbox);
vm.runInContext(gasSource,sandbox,{filename:'SocialDirector_v0.5_ONE_PASTE.gs'});

sandbox.socialV05HistoryFreshness_=()=>({ok:true,days:2,reason:'FRESH',latest:new Date('2026-10-04T02:45:06+09:00')});
sandbox.socialV05CanonicalHistory_=()=>canonicalHistory;

// Execute the real production function once to capture the exact context it sends
// into generateBlogTopicCandidates_.
sandbox.socialV05GenerateFive_();
if(!capturedCtx) throw new Error('PRODUCTION_CONTEXT_CAPTURE_FAILED');

const apiKey=String(process.env.OPENAI_API_KEY||'').trim();
if(!apiKey) throw new Error('OPENAI_API_KEY_REQUIRED');
const model=String(process.env.SOCIAL_CANDIDATE_MODEL||'gpt-5.6').trim();

const system=[
  'You are the candidate-generation model behind THE REV. Social Director.',
  'Use only the supplied production context. Do not invent current customer activity, unverified business facts, medical outcomes, or unpublished performance.',
  'Generate exactly five distinct Reel B candidate concepts.',
  'The production context contains the active research canon. Follow it as a decision lens, not a rigid template.',
  'Do not simply summarize Blog content. Reel B must show THE REV. through people, process, judgment, experience, space, local life-fit, boundaries, or distinctive brand treatment.',
  'Avoid semantic duplication with actual Instagram history, especially identical main claim + visual + service role.',
  'Candidate order must intentionally diversify: 1 FIRST_VISIT_PROCESS, 2 TRAINER_JUDGMENT, 3 STORE_SERVICE_EXPERIENCE, 4 PEOPLE_SPACE_LOCAL, 5 WILDCARD.',
  'Write natural Japanese. Do not expose theory names or research labels in user-facing titles.',
  'Return only the requested JSON.'
].join('\n');

const schema={
  type:'object',
  additionalProperties:false,
  required:['candidates'],
  properties:{
    candidates:{
      type:'array',
      minItems:5,maxItems:5,
      items:{
        type:'object',
        additionalProperties:false,
        required:['title_candidate','why_now','unique_angle','preview_lead','audience_question','selection_reason','local_angle','notes','score_breakdown','total_score','portfolio_final_score'],
        properties:{
          title_candidate:{type:'string'},
          why_now:{type:'string'},
          unique_angle:{type:'string'},
          preview_lead:{type:'string'},
          audience_question:{type:'string'},
          selection_reason:{type:'string'},
          local_angle:{type:'string'},
          notes:{type:'string'},
          score_breakdown:{
            type:'object',
            additionalProperties:false,
            required:['business_relevance','distinctiveness','trust_conversion','visual_proof','brand_fit'],
            properties:{
              business_relevance:{type:'number'},
              distinctiveness:{type:'number'},
              trust_conversion:{type:'number'},
              visual_proof:{type:'number'},
              brand_fit:{type:'number'}
            }
          },
          total_score:{type:'number'},
          portfolio_final_score:{type:'number'}
        }
      }
    }
  }
};

const response=await fetch('https://api.openai.com/v1/responses',{
  method:'POST',
  headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({
    model,
    reasoning:{effort:'medium'},
    instructions:system,
    input:[{
      role:'user',
      content:[{type:'input_text',text:JSON.stringify(capturedCtx)}]
    }],
    text:{format:{type:'json_schema',name:'the_rev_social_reel_candidates',strict:true,schema}}
  })
});
const data=await response.json();
if(!response.ok) throw new Error('OPENAI_'+response.status+' '+JSON.stringify(data).slice(0,2000));
let outputText=String(data.output_text||'').trim();
if(!outputText){
  for(const item of data.output||[]){
    for(const part of item.content||[]){
      if(part.type==='output_text' && part.text){ outputText=part.text; break; }
    }
    if(outputText) break;
  }
}
if(!outputText) throw new Error('OPENAI_OUTPUT_TEXT_MISSING');
const parsed=JSON.parse(outputText);
if(!Array.isArray(parsed.candidates)||parsed.candidates.length!==5) throw new Error('OPENAI_FIVE_CANDIDATES_INVALID');

const rawCandidates=parsed.candidates.map(c=>({
  ...c,
  total_score:Number(c.total_score||Object.values(c.score_breakdown||{}).reduce((a,b)=>a+Number(b||0),0)),
  portfolio_final_score:Number(c.portfolio_final_score||c.total_score||0)
}));

// Execute the exact production function a second time, now with the real model output.
// The final mapping / lane assignment / shooting-minute defaults are therefore the
// production GAS function itself, not reimplemented in this harness.
sandbox.generateBlogTopicCandidates_=(_ctx,count)=>{
  if(count!==5) throw new Error('UNEXPECTED_COUNT');
  return rawCandidates;
};
const result=sandbox.socialV05GenerateFive_();

const acceptance={
  generated_at:new Date().toISOString(),
  source_function:'socialV05GenerateFive_',
  source_file:'editorial/gas/SocialDirector_v0.5_ONE_PASTE.gs',
  model,
  input_path:inputPath,
  research_canon:input.research_canon,
  research_mode:input.research_mode,
  context_checks:{
    social_posts:canonicalHistory.length,
    editorial_rows:editorialRows.length,
    verified_facts:(input.verified_facts||[]).length,
    first_party:(input.first_party||[]).length,
    prior_social_runs:priorRuns.length,
    direction_contains_research_canon:String(capturedCtx?.weekly_editorial_brief?.direction||'').toLowerCase().includes('v0.4.5_conversion_creative_playbook'),
    direction_contains_lens_principle:String(capturedCtx?.weekly_editorial_brief?.direction||'').includes('Research is a lens, not a recipe')
  },
  result
};

fs.mkdirSync('editorial/social/acceptance',{recursive:true});
fs.writeFileSync('editorial/social/acceptance/live-output-2026-10-06.json',JSON.stringify(acceptance,null,2));
console.log('SOCIAL_PRODUCTION_ACCEPTANCE_BEGIN');
console.log(JSON.stringify(acceptance));
console.log('SOCIAL_PRODUCTION_ACCEPTANCE_END');
