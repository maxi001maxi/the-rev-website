export const SOCIAL_RESEARCH_CANON = [
  'Research is a lens, not a recipe.',
  'Choose one primary decision stage per candidate: ATTENTION / INTEREST / TRUST / SELF_RELEVANCE / PREDICTABILITY_RISK_REDUCTION / VERIFICATION / TRIAL_CONSIDERATION.',
  'Use perceived risk and uncertainty reduction. High-touch service risk includes time, body, embarrassment, interpersonal fit, failure and money.',
  'Trust must include Ability, Benevolence and Integrity. Prefer demonstrated observation, adjustment, restraint and boundaries over stated expertise.',
  'Separate 良さそう from 自分も行けそう. Use predictable first steps and no-pressure process to build self-relevance and self-efficacy.',
  'Make intangible service quality visible through People / Process / Physical Evidence.',
  'Equipment content should move equipment -> why it exists -> when it is used -> service role -> what is not claimed.',
  'Local relevance means life fit, not city-name slogans. Do not invent convenience claims.',
  'Aim for Brand Response: brand memory + a natural next action.',
  'CTA follows Audience State. No CTA may be correct.',
  'Performance changes probabilities, not possibilities. Do not endlessly clone a high-view format.',
  'Before convergence, diverge across psychology-led / service-proof-led / human-first-party-led / creative-wildcard-led directions.',
  'Do not expose research labels to the user. Research should improve the idea invisibly.'
].join('\n');

const TERRITORIES=['FIRST_VISIT_PROCESS','TRAINER_JUDGMENT','STORE_SERVICE_EXPERIENCE','PEOPLE_SPACE_LOCAL','WILDCARD'];
const JOBS=['OBJECTION_REDUCTION','TRUST','SERVICE_UNDERSTANDING','TRUST','AWARENESS'];
const STATES=['EVALUATING','EVALUATING','AWARE','AWARE','AWARE'];

function compact(v,max=12000){return String(v??'').trim().slice(0,max);}
function metric(p){return p?.latest_metrics||p?.metrics||{};}

export function buildSocialCandidatePrompt(ctx={}){
  const history=(ctx.social_history||[]).slice(0,80).map((p,i)=>{
    const m=metric(p);
    return [
      String(i+1)+'. '+compact(p.published_at||p.publish_date,40)+' | '+compact(p.format||p.media_type,60)+' | '+compact(p.title||'(untitled)',180),
      'lane='+compact(p.content_lane,80)+' territory='+compact(p.territory,80)+' ownership='+compact(p.ownership,80),
      'topic='+compact(p.topic,240),
      'main_claim='+compact(p.main_claim,600),
      'caption='+compact(p.caption,700),
      'metrics views='+(m.views??'unknown')+' reach='+(m.reach??'unknown')+' saves='+(m.saves??'unknown')+' shares='+(m.shares??'unknown')+' likes='+(m.likes??'unknown')
    ].join('\n');
  }).join('\n\n');
  const blogs=(ctx.blog_history||[]).slice(0,40).map((b,i)=>String(i+1)+'. '+compact(b.title,220)+' | '+compact(b.category,80)+' | '+compact(b.publish_status||b.status,80)).join('\n');
  const memory=(ctx.social_memory||[]).slice(0,10).map((m,i)=>String(i+1)+'. '+compact(m.run_date,40)+' | job='+compact(m.business_job,100)+' | theme='+compact(m.primary_theme,220)+' | claim='+compact(m.main_claim,500)+' | reel='+compact(m.reel_decision,40)).join('\n');
  return [
    'You are THE REV. Social Director. Generate exactly five Reel B candidates for today.',
    'Current phase: STORE_AWARENESS_BUILD.',
    'Reel A = external Discovery/Knowledge. Do not make another generic food, diet or training-tip Reel.',
    'Reel B = THE REV.-owned Store/Experience/Proof.',
    'Required candidate order: 1 FIRST_VISIT_PROCESS, 2 TRAINER_JUDGMENT, 3 STORE_SERVICE_EXPERIENCE, 4 PEOPLE_SPACE_LOCAL, 5 WILDCARD.',
    'These are diversity anchors, not rigid templates.',
    'Verified facts: completely reservation-based conditioning/personal training studio in Nara/Shin-Omiya; services include personal training, personal boxing, oxygen room and DENBA Health conditioning environment.',
    'Do not claim medical treatment, healing or guaranteed physiological effects. Do not fabricate customers, results, availability, testimonials or live store conditions.',
    'Research canon follows. Use it as judgment lenses, never as a rigid recipe.',
    SOCIAL_RESEARCH_CANON,
    'Blog = SEARCH/DEPTH. Do not shorten a Blog into a Reel. Prefer real store/process/judgment/visual proof.',
    'Avoid recently published Main Claim, Visual and Service framing. If a broad topic exists, make evidence and viewing experience clearly different.',
    'Use performance as a learning signal, not an instruction to copy the winner.',
    'Ideas should usually be shootable in 5-10 minutes and become a 12-25 second Reel. Do not force customer appearance.',
    'Return exactly five candidates. Each needs title, hook, why_now, difference_from_history, estimated_shoot_minutes, customer_required, strategic_reason. Use natural Japanese.',
    'RECENT INSTAGRAM HISTORY:\n'+(history||'(none)'),
    'RECENT BLOG/EDITORIAL:\n'+(blogs||'(none)'),
    'RECENT SOCIAL MEMORY:\n'+(memory||'(none)')
  ].join('\n\n');
}

const schema={
  type:'object',additionalProperties:false,required:['candidates'],
  properties:{candidates:{type:'array',minItems:5,maxItems:5,items:{
    type:'object',additionalProperties:false,
    required:['title','hook','why_now','difference_from_history','estimated_shoot_minutes','customer_required','strategic_reason'],
    properties:{
      title:{type:'string'},hook:{type:'string'},why_now:{type:'string'},difference_from_history:{type:'string'},
      estimated_shoot_minutes:{type:'integer',minimum:3,maximum:15},customer_required:{type:'boolean'},strategic_reason:{type:'string'}
    }
  }}}
};

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  for(const item of data?.output||[])for(const part of item?.content||[])if(typeof part?.text==='string'&&part.text.trim())return part.text.trim();
  return '';
}

export async function generateSocialCandidates({
  context,
  apiKey,
  gatewayToken,
  model='',
  fetchImpl=fetch
}){
  const directKey=String(apiKey||process.env.OPENAI_API_KEY||'').trim();
  const gatewayKey=String(gatewayToken||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||'').trim();
  if(!directKey&&!gatewayKey)throw new Error('SOCIAL_LLM_KEY_REQUIRED');
  const useGateway=Boolean(gatewayKey);
  const key=useGateway?gatewayKey:directKey;
  const endpoint=useGateway?'https://ai-gateway.vercel.sh/v1/responses':'https://api.openai.com/v1/responses';
  const resolvedModel=String(model||'').trim()||(useGateway?'openai/gpt-5.6-sol':'gpt-5.6');
  const res=await fetchImpl(endpoint,{
    method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:resolvedModel,store:false,reasoning:{effort:'medium'},
      input:[{role:'user',content:[{type:'input_text',text:buildSocialCandidatePrompt(context)}]}],
      text:{format:{type:'json_schema',name:'the_rev_social_reel_candidates_v05',strict:true,schema}}
    })
  });
  let data=null;try{data=await res.json();}catch{}
  if(!res.ok)throw new Error('SOCIAL_CANDIDATE_LLM_FAILED '+(data?.error?.message||res.status));
  let parsed;try{parsed=JSON.parse(outputText(data));}catch{throw new Error('SOCIAL_CANDIDATE_INVALID_JSON');}
  if(!Array.isArray(parsed?.candidates)||parsed.candidates.length!==5)throw new Error('SOCIAL_FIVE_CANDIDATES_INVALID');
  return {
    model:resolvedModel,
    provider_path:useGateway?'VERCEL_AI_GATEWAY_OIDC':'OPENAI_DIRECT',
    research_canon:'V0.4.5_CONVERSION_CREATIVE_PLAYBOOK',research_mode:'LENS_NOT_RECIPE',
    candidates:parsed.candidates.map((c,i)=>({
      title:compact(c.title,500),territory:TERRITORIES[i],business_job:JOBS[i],audience_state:STATES[i],
      hook:compact(c.hook,2000),why_now:compact(c.why_now,4000),difference_from_history:compact(c.difference_from_history,4000),
      asset_plan:'SELECTION_AFTER_CHOICE',estimated_shoot_minutes:Number(c.estimated_shoot_minutes),score:null,
      production_plan:{customer_required:Boolean(c.customer_required),strategic_reason:compact(c.strategic_reason,4000),after_selection:'shot-level storyboard / text / sound / edit / caption'}
    }))
  };
}
