import { PAGE_CATALOG } from './generated-page-catalog.mjs';

export function normalizeAnalyticsPath(input){
  if(typeof input!=='string'||!input)return '/';
  const clean=input.split('?')[0].split('#')[0].replace(/\/{2,}/g,'/');
  return clean.length>1?clean.replace(/\/+$/,''):'/';
}

export function pagePresentation(path){
  const normalized=normalizeAnalyticsPath(path);
  const known=PAGE_CATALOG[normalized];
  if(known)return {...known,path:normalized,known:true};
  if(normalized.startsWith('/blog/')){
    return {
      title:'コラム記事',
      summary:'記事タイトルの表示情報がまだ登録されていないコラムです。',
      path:normalized,
      known:false
    };
  }
  return {
    title:'その他のページ',
    summary:'ページ情報が未登録です。下のURLで対象ページを確認できます。',
    path:normalized,
    known:false
  };
}

function source(sourceMedium,label,detail,kind='acquisition'){
  return {sourceMedium,label,detail,kind};
}

export function sourcePresentation(sourceMedium){
  const raw=String(sourceMedium||'').trim();
  const lower=raw.toLowerCase();

  if(lower==='(direct) / (none)'){
    return source(raw,'直接・判別できない流入','URL直入力、ブックマーク、参照元が渡らないリンクなどを含みます。','unknown');
  }
  if(lower==='google / organic'){
    return source(raw,'Google検索','Googleの通常検索結果からサイトに来た訪問です。');
  }
  if(lower==='(not set)'){
    return source(raw,'流入元を判定できなかったアクセス','GA4がこの訪問の流入元を確定できなかったデータです。','unknown');
  }
  if(lower==='(data not available)'){
    return source(raw,'詳細を表示できない流入','Google側の処理やプライバシー保護により詳細が表示されないデータです。','unknown');
  }
  if(lower.includes('chatgpt.com')){
    return source(raw,'ChatGPT','ChatGPT内のリンクなどからサイトに来た訪問です。');
  }
  if(lower.includes('instagram.com')||lower==='ig / social'){
    return source(raw,'Instagram','Instagram内のリンクやプロフィールなどから来た訪問です。');
  }
  if(lower.includes('facebook.com')){
    return source(raw,'Facebook','Facebook内のリンクなどからサイトに来た訪問です。');
  }
  if(lower.includes('tagassistant.google.com')){
    return source(raw,'Google計測テスト','Tag Assistantによる計測確認です。通常の集客とは分けて見ます。','internal');
  }
  if(lower.includes('the-rev-website.vercel.app')){
    return source(raw,'THE REV. 開発・確認環境','Vercel上の確認用サイトからの移動です。通常の集客とは分けて見ます。','internal');
  }
  if(lower.includes('vercel.com')){
    return source(raw,'Vercel 管理・確認環境','Vercelの管理・確認画面からのアクセスです。通常の集客とは分けて見ます。','internal');
  }

  const [origin='',medium='']=raw.split(' / ').map(v=>v.trim());
  if(medium==='organic')return source(raw,origin?origin+'の自然検索':'自然検索','広告ではない検索結果から来た訪問です。');
  if(medium==='social')return source(raw,origin?origin+'のSNS':'SNS','SNS経由の訪問です。');
  if(medium==='referral'){
    const host=origin.replace(/^https?:\/\//,'').replace(/^www\./,'');
    return source(raw,host?host+'からのリンク':'外部サイトからのリンク','別サイトにあるリンクから来た訪問です。');
  }
  if(['cpc','ppc','paid','paid-search'].includes(medium)){
    return source(raw,origin?origin+'の広告':'広告','広告経由の訪問です。');
  }
  return source(raw,raw||'流入元不明','GA4に記録された流入元です。','unknown');
}

export function sourceKindLabel(kind){
  if(kind==='internal')return '内部・テスト';
  if(kind==='unknown')return '判別不能';
  return '集客流入';
}
