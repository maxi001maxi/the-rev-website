import { createClient } from '@supabase/supabase-js';
import { syncDirectGa4ToCompanyOs } from '../lib/ga4CompanyOsSync.mjs';

function required(name){
  const value=String(process.env[name]||'').trim();
  if(!value) throw new Error(`GA4_BOOTSTRAP_MISSING_${name}`);
  return value;
}

if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'production') {
  console.log('[ga4-bootstrap] skip: not production');
  process.exit(0);
}

const supabase=createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  {auth:{persistSession:false,autoRefreshToken:false}}
);

const {count,error}=await supabase
  .from('company_os_ga4_daily_metrics')
  .select('*',{count:'exact',head:true});

if(error) throw new Error(`GA4_BOOTSTRAP_COUNT_FAILED: ${error.message}`);

if((count||0)>0){
  console.log(`[ga4-bootstrap] skip: existing_rows=${count}`);
  process.exit(0);
}

console.log('[ga4-bootstrap] first sync starting');
const result=await syncDirectGa4ToCompanyOs({supabase});
if(!result?.ok) throw new Error(`GA4_BOOTSTRAP_SYNC_FAILED: ${result?.error||'unknown'}`);
console.log(`[ga4-bootstrap] PASS rows=${result.rowsUpserted} range=${result.minDate}..${result.maxDate}`);
