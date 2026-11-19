// LOCAL SHIM: GitHub API の代わりに作業ツリーを読み書きする。scripts/prepare-image-job-local.mjs が一時的に lib/githubContent.mjs と差し替える。コミット時に差し替えたままにしない。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=(b)=>createHash('sha1').update(b).digest('hex');
export class GithubError extends Error{constructor(c,m,o={}){super(m);this.code=c;this.status=o.status||502;}}
export async function getFile(p){if(!fs.existsSync(p)||fs.statSync(p).isDirectory())return {exists:false};
 const b=fs.readFileSync(p);return {exists:true,sha:sha(b),path:p,size:b.length,sha256:createHash('sha256').update(b).digest('hex'),htmlUrl:null,content:b.toString('utf8')};}
export async function listDirectory(d){if(!fs.existsSync(d))return [];return fs.readdirSync(d,{withFileTypes:true}).map(e=>({name:e.name,path:path.join(d,e.name),sha:'x',size:0,type:e.isDirectory()?'dir':'file',htmlUrl:null}));}
export async function fileExists(p){return fs.existsSync(p);}
export async function getFileSha(p){const f=await getFile(p);return f.exists?f.sha:null;}
export async function putFile({path:p,content,message,sha:s=null}){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,String(content));console.error('[shim put]',p,'|',message);return {path:p,sha:'local',commitSha:'local'};}
export function getGithubConfig(){return {repo:'local',branch:'main'};}
export function publicGithubConfig(){return {};}
export async function checkConnection(){return {ok:true};}
export async function getWorkflowRunForCommit(){return null;}
export function githubDeployProgressFromJobs(){return {};}
export async function getWorkflowRunProgress(){return {};}
export function sendGithubError(){}
