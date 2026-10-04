import matter from 'gray-matter';
import { getFile, listDirectory } from './githubContent.mjs';

// No recent window. Failure is surfaced to Creator rather than becoming [].
export async function collectArticleHistory({supabase, list=listDirectory, read=getFile}) {
  const entries=await list('content/blog');
  if (!entries.length) throw new Error('canonical article history unavailable');
  const published=[];
  for (const entry of entries.filter(e=>e.type==='file' && /\.md$/.test(e.name))) {
    const file=await read(entry.path);
    if (!file.exists || !file.content) throw new Error('canonical article unreadable: '+entry.path);
    const {data,content}=matter(file.content);
    published.push({...data,content_id:data.editorial_content_id || data.content_id || data.slug,
      body_summary:content.replace(/\s+/g,' ').slice(0,1800),history_source:entry.path});
  }
  const drafts=[];
  for(let offset=0;;offset+=500) {
    const result=await supabase.from('admin_article_drafts')
      .select('editorial_content_id,title,slug,description,body_markdown')
      .order('id').range(offset,offset+499);
    if(result.error) throw new Error('draft article history unavailable');
    for(const row of result.data || []) drafts.push({...row,content_id:row.editorial_content_id || row.slug,
      body_summary:String(row.body_markdown || '').replace(/\s+/g,' ').slice(0,1800)});
    if((result.data || []).length<500) break;
  }
  return [...published,...drafts];
}
