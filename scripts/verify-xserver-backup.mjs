import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function verifyXserverBackup(root) {
 const mandatory=['index.html','solution.html','trainer.html','price.html','access.html','blog/index.html'];
 const documents=new Set(mandatory.map(file=>path.join(root,file)));
 const blog=path.join(root,'blog');
 function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())collect(file);else if(entry.name==='index.html')documents.add(file);}}
 if(fs.existsSync(blog))collect(blog);
 for(const file of ['robots.txt','sitemap.xml']){const metadata=path.join(root,file);if(!fs.existsSync(metadata)||fs.statSync(metadata).size===0)throw Error('Backup metadata is missing: '+file);}
 if(!fs.existsSync(path.join(root,'assets'))||fs.readdirSync(path.join(root,'assets')).length===0)throw Error('Backup assets are missing');
 if(fs.existsSync(path.join(root,'unlimited-dev')))throw Error('Protected environment must be excluded from public backup');
 for(const file of documents){
  if(!fs.existsSync(file))throw Error('Backup public document is missing: '+path.relative(root,file));
  const html=fs.readFileSync(file,'utf8');
  if(!/<\/html>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(html))throw Error('Backup public document is incomplete: '+path.relative(root,file));
 }
 return {status:'PASS',documents:documents.size,scope:'Primary public pages and every existing Blog index/article/category; verification-token files are not HTML documents'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('Backup directory is required');
 console.log(JSON.stringify(verifyXserverBackup(path.resolve(process.argv[2]))));
}
