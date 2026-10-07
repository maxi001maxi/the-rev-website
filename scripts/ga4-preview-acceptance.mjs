// Read-only acceptance executed with Preview server-side environment. Never print credentials.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {fetchDirectGa4Dataset} from '../lib/ga4CompanyOsSync.mjs';
const dataset=await fetchDirectGa4Dataset({propertyId:process.env.GA4_PROPERTY_ID,serviceAccountRaw:process.env.GA4_SERVICE_ACCOUNT_JSON});
assert.ok(dataset.rows.length>0);
assert.equal(dataset.rows[0].metric_date,'2026-09-25');
assert.equal(dataset.rows.at(-1).data_status,'DELAYED');
assert.equal(dataset.windowMetrics.recent_7_complete_days.status,'VALUE');
const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await sb.rpc('company_os_get_ga4_morning_metrics');
assert.ifError(error);
assert.equal(data.today_partial.partial,true);
assert.equal(data.recent_7_complete_days.active_users_semantics,'period_unique_active_users');
assert.equal(data.reservation_complete.status,'UNKNOWN');
console.log(JSON.stringify({gate:'GA4_PREVIEW_READ_ONLY_ACCEPTANCE',status:'PASS',rows:dataset.rows.length,start:dataset.rows[0].metric_date,end:dataset.rows.at(-1).metric_date,eventVerifiedFrom:dataset.eventVerifiedFrom}));
