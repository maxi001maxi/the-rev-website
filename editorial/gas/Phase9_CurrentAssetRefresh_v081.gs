/**
 * THE REV. asset ledger v081 — replace live Phase9_CurrentAssetRefresh_v068.gs.
 * Keep the existing scheduledEditorialAssetLedgerSyncV068 trigger (15 minutes).
 * Source-only updates and derived views; never publishes articles or GBP posts.
 */
function v068StatusBaseUrl_(){
 const configured=String(PropertiesService.getScriptProperties().getProperty('EDITORIAL_STATUS_BASE_URL')||'').trim();
 return (configured||'https://the-rev-website-git-main-htrmaxi0101-9305s-projects.vercel.app').replace(/\/+$/,'');
}
function v068StatusRequest_(contentId){
 const secret=v065BridgeSecret_();if(!secret)throw new Error('v0.6.8 BLOCKED. EDITORIAL_BRIDGE_SECRET is missing.');
 const url=v068StatusBaseUrl_()+'/api/integrations/editorial-status/?content_id='+encodeURIComponent(String(contentId||'').trim());
 const r=v065FetchJson_(url,{method:'get',headers:{Authorization:'Bearer '+secret}});
 if(r.code===404&&r.json&&r.json.error==='not_found')return {ok:false,code:404,status:'NOT_FOUND'};
 if(r.code<200||r.code>=300||!r.json||r.json.ok!==true)throw new Error('v0.6.8 Editorial status failed: HTTP '+r.code+' / '+String((r.json&&r.json.message)||r.body||'').slice(0,1200));
 return {ok:true,code:r.code,json:r.json};
}
function v068QaSummary_(q){
 if(!q)return '';if(typeof q==='string')return q;const p=[];
 if(q.pass===true)p.push('PASS');else if(q.pass===false)p.push('FAIL');
 if(q.article_visual_relevance!==undefined)p.push('relevance='+q.article_visual_relevance);
 if(q.main_claim_visualization!==undefined)p.push('claim='+q.main_claim_visualization);
 if(q.typography_harmony!==undefined)p.push('type='+q.typography_harmony);
 if(q.gbp_aspect_ratio_pass!==undefined)p.push('GBP 4:3='+(q.gbp_aspect_ratio_pass?'PASS':'FAIL'));return p.join(' / ');
}
function v068GbpQaSummary_(q){
 if(!q)return '';if(typeof q==='string')return q;const p=[];
 if(q.pass===true)p.push('PASS');else if(q.pass===false)p.push('FAIL');
 if(q.aspect_ratio_pass!==undefined)p.push('4:3='+(q.aspect_ratio_pass?'PASS':'FAIL'));
 if(q.safe_area_pass!==undefined)p.push('safe='+(q.safe_area_pass?'PASS':'FAIL'));
 if(q.copy_legible!==undefined)p.push('copy='+(q.copy_legible?'PASS':'FAIL'));return p.join(' / ');
}
function v068SyncRecentArticleAssets_(){
 const bsh=ss_().getSheetByName('25_WEB_PUBLISH_BRIDGE');if(!bsh)return {status:'BRIDGE_SHEET_MISSING'};
 const rows=v081AssetRefreshRows_(bsh);let synced=0,errors=0;
 rows.forEach(row=>{try{
  const result=v068StatusRequest_(String(row.content_id||'').trim());if(!result.ok)return;
  const payload=result.json||{},a=payload.article||{};
  setObjectRow_(bsh,row.__row,{
   site_draft_id:String(a.id||row.site_draft_id||''),review_url:String(payload.review_url||row.review_url||''),editor_url:String(payload.editor_url||row.editor_url||''),title:String(a.title||row.title||''),slug:String(a.slug||row.slug||''),
   image_status:String(a.image_status||''),thumbnail_path:String(a.thumbnail||''),og_image_path:String(a.og_image||''),image_strategy:String(a.image_strategy||row.image_strategy||''),image_updated_at:a.image_updated_at||new Date(),image_render_version:String(a.image_render_version||''),image_qa:v068QaSummary_(a.image_qa),image_style_template:String(a.image_style_template||''),image_headline_short:String(a.image_headline_short||''),image_asset_version:String(a.image_asset_version||''),
   gbp_image_status:String(a.gbp_image_status||''),gbp_image_path:String(a.gbp_image||''),gbp_image_asset_version:String(a.gbp_image_asset_version||''),gbp_image_updated_at:a.gbp_image_checked_at||new Date(),gbp_image_notes:v068GbpQaSummary_(a.gbp_image_qa)
  });synced++;
 }catch(e){errors++;setObjectRow_(bsh,row.__row,{gbp_image_notes:'SYNC ERROR: '+String(e&&e.message||e).slice(0,500)});}});
 if(typeof v067RefreshGbpPostsFromBridge_==='function')v067RefreshGbpPostsFromBridge_();
 return {status:errors?'PARTIAL':'OK',checked:rows.length,synced:synced,errors:errors};
}
function v068SortArticleImagesNewestFirst_(){return v081RepairArticleImageView_();}
function scheduledEditorialAssetLedgerSyncV068(){
 const assets=v068SyncRecentArticleAssets_();
 const ledger=typeof scheduledEditorialHumanLedgerSyncV063==='function'?scheduledEditorialHumanLedgerSyncV063():null;
 const sort=v068SortArticleImagesNewestFirst_();
 return {status:'SUCCESS',version:'v0.6.8',assets:assets,ledger:ledger,sort:sort,auto_publish:false};
}
function v081RepairArticleImageView_(){
 const sh=ss_().getSheetByName('記事別画像');if(!sh)return {status:'SHEET_MISSING'};
 const formulas=v081ImageSheetFormulas_(),current=sh.getRange(2,1,1,15).getFormulas()[0];
 const repair=current.some((v,i)=>v!==formulas[i]);
 if(repair){sh.getRange(2,1,Math.max(500,sh.getLastRow()-1),15).clearContent();sh.getRange(2,1,1,15).setFormulas([formulas]);}
 sh.showColumns(15);sh.setFrozenRows(1);sh.setFrozenColumns(2);
 sh.getRange(1,1).setNote('表示専用。最新記事は2行目。行挿入・直接ソート禁止。元データを更新し、15分の同期で数式位置を自動修復します。画像完成と記事公開は別の状態です。');
 SpreadsheetApp.flush();return {status:repair?'REPAIRED':'VERIFIED',latest_id:sh.getRange(2,3).getDisplayValue(),formula_row:2,auto_publish:false};
}
function repairArticleImageViewV081(){Logger.log(JSON.stringify(v081RepairArticleImageView_()));}
function v081AssetRefreshRows_(bsh){
 const ss=ss_(),known={};getObjectsWithRow_(bsh).forEach(r=>{if(r.content_id)known[String(r.content_id)]=true;});
 ['21_WEB_BLOG_OUTPUT','22_GBP_POST','26_DAILY_EDITORIAL_QUEUE'].forEach(name=>{
  const sh=ss.getSheetByName(name);if(!sh)return;
  getObjectsWithRow_(sh).forEach(r=>{
   const id=String(name==='22_GBP_POST'?r.parent_blog_id:r.content_id||'').trim();
   if(!id||known[id]||id.indexOf('BLOG-LEGACY-')===0)return;
   const found=v068StatusRequest_(id);if(!found.ok)return;const a=found.json.article||{};
   appendObjectRow_(bsh,{synced_at:r.generated_at||r.created_at||new Date(),week_start:r.week_start,content_id:id,bridge_status:'REVIEW_REQUIRED',title:a.title||r.title||r.blog_title||'',site_draft_id:a.id||'',review_url:found.json.review_url||'',editor_url:found.json.editor_url||'',slug:a.slug||'',action:'asset_input_discovery',notes:'画像一覧への同期用。テーマ承認・公開を表しません。'});known[id]=true;
  });
 });
 const rows=getObjectsWithRow_(bsh).filter(r=>/^BLOG-[0-9]{8}/.test(String(r.content_id||''))).sort((a,b)=>Number((String(b.content_id).match(/^BLOG-([0-9]{8})/)||[])[1]||0)-Number((String(a.content_id).match(/^BLOG-([0-9]{8})/)||[])[1]||0)||b.__row-a.__row);
 const recent=rows.slice(0,5),older=rows.slice(5),p=PropertiesService.getScriptProperties(),cursor=Number(p.getProperty('THE_REV_ASSET_REFRESH_CURSOR_V081')||0);
 const page=[];for(let i=0;i<Math.min(5,older.length);i++)page.push(older[(cursor+i)%older.length]);
 p.setProperty('THE_REV_ASSET_REFRESH_CURSOR_V081',String(older.length?(cursor+page.length)%older.length:0));return recent.concat(page);
}
function verifyEditorialAssetLedgerV081(){
 const result=scheduledEditorialAssetLedgerSyncV068();SpreadsheetApp.flush();
 result.verification={image_view:v081RepairArticleImageView_(),triggers:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='scheduledEditorialAssetLedgerSyncV068').length};
 Logger.log(JSON.stringify(result));return result;
}

// Canonical display contract: formulas belong ONLY in row 2 (A2:O2).
// Never insert/move rows in the display sheet; append data to source Bridge/GBP tabs.
// Bound destination spill to 500 rows so a misplaced anchor cannot exhaust the 50k-row sheet.
function v081ImageSheetFormulas_() {
  const bridge="'25_WEB_PUBLISH_BRIDGE'!", gbp="'22_GBP_POST'!";
  const viewIds="$C$2:$C$501";
  const dateKey=`IFERROR(VALUE(REGEXEXTRACT(${bridge}C2:C,"BLOG-([0-9]{8})")),IFERROR(VALUE(TEXT(${bridge}A2:A,"yyyymmdd")),0))`;
  const lookup=col=>`ARRAYFORMULA(XLOOKUP(${viewIds},${bridge}$C$2:$C,${bridge}${col}$2:${col},"",0,-1))`;
  // A stale retry row can share the parent ID but have no assets. Join the
  // latest asset-bearing row, keeping path/status/QA from that same row.
  const glookup=col=>{const bc=({M:"AB",L:"AA",O:"AE"})[col];return `MAP(${viewIds},LAMBDA(id,IF(id="","",IFNA(INDEX(SORT(FILTER({ROW(${gbp}$D$2:$D),${gbp}${col}$2:${col}},${gbp}$D$2:$D=id,${gbp}$M$2:$M<>""),1,FALSE),1,2),XLOOKUP(id,${bridge}$C$2:$C,${bridge}${bc}$2:${bc},"",0,-1)))))`;};
  const url='IF(LEFT(p,4)="http",p,"https://therev-lab.com"&p)';
  const mapped=(expr,fn)=>`=MAP(${expr},LAMBDA(p,IF(p="","",${fn})))`;
  return [
    `=ARRAYFORMULA(IF(${viewIds}="","",${lookup('A')}))`,
    `=ARRAYFORMULA(IF(${viewIds}="","",${lookup('I')}))`,
    // SORTN display_ties_mode=2 removes duplicate content IDs; timestamp ties
    // resolve by newest physical Bridge row. Open-ended ranges follow appends.
    `=IFNA(CHOOSECOLS(SORT(SORTN(SORT(FILTER({${dateKey},${bridge}C2:C,IFERROR(VALUE(SUBSTITUTE(SUBSTITUTE(LEFT(TO_TEXT(${bridge}A2:A),19),"-","/"),"T"," ")),0),ROW(${bridge}C2:C)},${bridge}C2:C<>""),1,FALSE,3,FALSE,4,FALSE),9^9,2,2,TRUE),1,FALSE,3,FALSE,4,FALSE),2),"")`,
    `=ARRAYFORMULA(IF(${viewIds}="","",IF(${lookup('Q')}<>"",${lookup('Q')},${lookup('D')})))`,
    `=MAP(${lookup('R')},$D$2:$D$501,LAMBDA(p,s,IF(AND(p<>"",OR(s="READY",s="PUBLISHED")),IMAGE(${url},4,96,171),"")))`,
    `=MAP(${lookup('R')},$D$2:$D$501,LAMBDA(p,s,IF(p="","",IF(OR(s="READY",s="PUBLISHED"),HYPERLINK(${url},"完成画像"),"画像確認中"))))`,
    `=MAP(${lookup('S')},$D$2:$D$501,LAMBDA(p,s,IF(p="","",IF(OR(s="READY",s="PUBLISHED"),HYPERLINK(${url},"OGP (1200×630)"),"OGP確認中"))))`,
    `=MAP(${lookup('F')},${lookup('N')},LAMBDA(r,p,IF(p<>"",HYPERLINK(p,"公開記事"),IF(r<>"",HYPERLINK(r,"Review"),""))))`,
    `=ARRAYFORMULA(IF(${viewIds}="","",${lookup('Z')}))`,
    mapped(lookup('N'),'HYPERLINK(p,"公開記事")'),
    mapped(lookup('F'),'HYPERLINK(p,"Review")'),
    mapped(glookup('M'),`IMAGE(${url},4,112,149)`),
    mapped(glookup('M'),`HYPERLINK(${url},"GBP 4:3 / 1200×900")`),
    `=MAP(${viewIds},${glookup('M')},${glookup('L')},${glookup('O')},LAMBDA(id,p,s,n,IF(id="","",IF(p="","未生成",IF(REGEXMATCH(TO_TEXT(n),"4:3|1200[x×]900"),s&" / 4:3","CHECK_RATIO")))))`,
    `=MAP(${viewIds},$D$2:$D$501,$N$2:$N$501,LAMBDA(id,w,g,IF(id="","",IF(OR(w="PREPARING",w="IMAGE_PREPARING"),"要対応：Web画像が未完了",IF(w="READY",IF(LEFT(TO_TEXT(g),5)="READY","Web/GBPの画像情報あり","Web画像情報あり・GBP未生成"),IF(w="PUBLISHED","過去記事：画像リンクを確認","要確認："&w))))))`
  ];
}

