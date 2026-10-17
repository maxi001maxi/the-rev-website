import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyXserverBackup} from './verify-xserver-backup.mjs';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rev-backup-integrity-'));
 for(const file of ['index.html','solution.html','trainer.html','price.html','access.html','blog/index.html','blog/example/index.html']){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'<!doctype html><html><body>Complete</body></html>');}
 fs.mkdirSync(path.join(root,'assets'));fs.writeFileSync(path.join(root,'assets/style.css'),'body{}');
 fs.writeFileSync(path.join(root,'robots.txt'),'User-agent: *\nAllow: /\n');fs.writeFileSync(path.join(root,'sitemap.xml'),'<urlset/>');
 fs.writeFileSync(path.join(root,'google-verification.html'),'google-site-verification: google-verification.html');return root;
}
test('complete public backup accepts intentional verification text',()=>{const root=fixture();try{assert.equal(verifyXserverBackup(root).documents,7);}finally{fs.rmSync(root,{recursive:true});}});
test('HTTP-200-style truncated article is not an eligible rollback backup',()=>{const root=fixture();try{fs.writeFileSync(path.join(root,'blog/example/index.html'),'<html><body>'+'.'.repeat(16372));assert.throws(()=>verifyXserverBackup(root),/document is incomplete: blog\/example\/index.html/);}finally{fs.rmSync(root,{recursive:true});}});
test('missing primary document is rejected',()=>{const root=fixture();try{fs.unlinkSync(path.join(root,'solution.html'));assert.throws(()=>verifyXserverBackup(root),/missing: solution.html/);}finally{fs.rmSync(root,{recursive:true});}});
test('protected environment is never included',()=>{const root=fixture();try{fs.mkdirSync(path.join(root,'unlimited-dev'));assert.throws(()=>verifyXserverBackup(root),/Protected environment/);}finally{fs.rmSync(root,{recursive:true});}});
test('SEO rollback metadata must be present',()=>{const root=fixture();try{fs.unlinkSync(path.join(root,'robots.txt'));assert.throws(()=>verifyXserverBackup(root),/metadata is missing: robots.txt/);}finally{fs.rmSync(root,{recursive:true});}});
