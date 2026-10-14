/**
 * GBP-only voice adapter v081. Owner requested 2026-10-14.
 * Adapted reader-value principles from Caption Studio; Instagram rules/canon
 * are not promoted or copied into GBP. No publishing or scheduling here.
 */
function v081GbpVoiceInstructions_(){
 return [
  'あなたはTHE REV.のGoogleビジネスプロフィール編集者です。完成した親記事の約束を、読者の具体的な疑問・選択へ変える投稿を作ります。',
  '原稿の役割を1つ選ぶ：使い方の判断、理由の理解、来店前の迷いを減らす、比較、サービスの利用場面。読後に残る判断をnotesへ1文で記録してください。',
  '落ち着いた自然な日本語。読者の生活の具体的な場面から入る、答えから入る、短い比較を置くなど、題材に合う構造を選ぶ。毎回同じ問いかけ・三点列挙・締めへ固定しない。',
  '親記事とverified_factsを事実の上限にする。料金・時間・健康主張・安全条件は元記事と照合。親記事の数値を一般的な最適値へ変えない。僕なら、お客様によく聞かれます、実際のセッション等の未確認の体験談を創作しない。',
  'recent_postsは既存原稿でありGoogle公開の証拠ではない。主張・角度・読後の価値・結びが直近原稿と重なるなら、親記事から別の具体的な判断材料を選ぶ。同義語への置換だけで新しさとしない。',
  '毎回、大切なのは、無理なく続ける、奈良・新大宮で〜の方へを自動挿入しない。地域名は利用判断に役立つ位置へ自然に。読者を急かす予約・保存の催促、SEO語の羅列、Instagram用ハッシュタグ数や絵文字数の固定をしない。',
  '本文はおおむね250〜500字。意味のまとまりで実際の改行を入れる。全体を一段落に詰め込まず、文字数を満たすための埋め草は削る。',
  '自然な次の行動は親記事を読むこと1つ。本文のURL位置には半角ASCIIの[BLOG_URL]を1回だけ入れる。未公開記事を公開済みと書かない。制作内部のラベルは本文に出さない。'
 ].join('\n');
}
function v081GbpRecentContext_(parentId){
 const sh=ss_().getSheetByName('22_GBP_POST');if(!sh)return [];
 const cutoff=Date.now()-30*24*60*60*1000;
 return getObjectsWithRow_(sh).filter(r=>r.parent_blog_id&&r.parent_blog_id!==parentId&&new Date(r.generated_at||0).getTime()>=cutoff)
 .sort((a,b)=>new Date(b.generated_at)-new Date(a.generated_at)).slice(0,20)
 .map(r=>({parent_id:r.parent_blog_id,title:r.title,body:String(r.body_copy_paste||'').slice(0,700),sheet_status:r.status,google_publication:'UNVERIFIED'}));
}
function v081NormalizeGbpCopy_(text){
 return String(text||'').replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n').replace(/\r\n/g,'\n').replace(/［BLOG_URL］/g,'[BLOG_URL]').trim();
}
var V081_GBP_VOICE_RUNTIME=(function(){
 if(typeof openAIRequest_!=='function'||typeof generateGBPFromBlog_!=='function')return 'NOT_INSTALLED';
 const originalRequest=openAIRequest_;
 openAIRequest_=function(path,payload){
  if(payload&&payload.text&&payload.text.format&&payload.text.format.name==='gbp_post_output'){
   payload=JSON.parse(JSON.stringify(payload));
   payload.max_output_tokens=Math.max(Number(payload.max_output_tokens||0),4000);
   payload.input=(payload.input||[]).filter(x=>x.role!=='system');
   payload.input.unshift({role:'system',content:[{type:'input_text',text:v081GbpVoiceInstructions_()}]});
   payload.input.push({role:'user',content:[{type:'input_text',text:JSON.stringify({recent_posts:v081GbpRecentContext_(''),editorial_channel:'GOOGLE_BUSINESS',voice_version:'v081'})}]});
  }
  return originalRequest(path,payload);
 };
 const originalGenerator=generateGBPFromBlog_;
 generateGBPFromBlog_=function(blog,ctx){
  const x=originalGenerator(blog,ctx);x.body_copy_paste=v081NormalizeGbpCopy_(x.body_copy_paste);
  if(!x.body_copy_paste)throw new Error('GBP_COPY_EMPTY');
  x.notes=String(x.notes||'')+' | GBP voice v081 / parent article only / human posting required';return x;
 };
 return 'GBP_VOICE_V081';
})();
function verifyGoogleBusinessVoiceV081(){
 const sh=ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
 const blog=getObjectsWithRow_(sh).filter(r=>r.content_id==='BLOG-20261011-36b42e')[0];
 if(!blog)throw new Error('GBP_VERIFICATION_PARENT_MISSING');
 const found=v068StatusRequest_(blog.content_id);if(!found.ok)throw new Error('GBP_PARENT_CMS_MISSING');
 const a=found.json.article||{};const parent=Object.assign({},blog,{title:a.title||blog.title,lead:a.description||blog.lead,body_markdown:a.body_markdown||blog.body_markdown});
 const made=generateGBPFromBlog_(parent,{verified_public_facts:[]});
 Logger.log(JSON.stringify({status:'GENERATED_NOT_POSTED',voice_runtime:V081_GBP_VOICE_RUNTIME,parent_id:blog.content_id,copy:made,chars:made.body_copy_paste.length,google_post_sent:false}));return made;
}
