import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,readFile,mkdir,readdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';
import {seedLibrary} from '../public/demo.js';
import {createDraft} from '../public/model.js';
import {receiveMedia} from '../media-store.mjs';
import {createPackage,importPackage,sharedLibrary} from '../share-packages.mjs';
const publicDir=path.resolve('public');
async function fixture(){
  await mkdir('test-output',{recursive:true});const folder=await mkdtemp(path.resolve('test-output','packages-')),mediaDir=path.join(folder,'media');
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const item=await receiveMedia(Readable.from([bytes]),{mediaDir,mime:'image/png',name:'图片.png'});
  const library=seedLibrary();library.groups[0].versions[0].media.push(item);library.groups[0].draft=createDraft(library.groups[0].versions[0]);library.groups[1].deletedAt=new Date().toISOString();
  return {folder,mediaDir,library,item,bytes,publicDir};
}
test('share package retains version-media pairs and excludes drafts/trash without mutating source',async()=>{
  const f=await fixture(),original=structuredClone(f.library);f.library.groups[0].versions[0].prompt='</textarea><script>alert(1)</script>';
  const result=await createPackage(f),restored=await importPackage({file:result.path,mediaDir:path.join(f.folder,'destination')});
  assert.equal(restored.groups.length,5);assert.equal(restored.groups[0].draft,undefined);assert.deepEqual(restored.groups[0].versions,f.library.groups[0].versions);
  assert.deepEqual(await readFile(path.join(f.folder,'destination',path.basename(f.item.src))),f.bytes);
  assert.ok(f.library.groups[0].draft);assert.equal(f.library.groups[1].deletedAt,original.groups[1].deletedAt);
  const zip=await yauzl.openPromise(result.path);let html='',assets=0;
  for await(const entry of zip.eachEntry()){if(entry.fileName.startsWith('assets/'))assets++;if(entry.fileName==='index.html'){const chunks=[];for await(const chunk of await zip.openReadStreamPromise(entry))chunks.push(chunk);html=Buffer.concat(chunks).toString();}}
  assert.ok(assets>0);assert.ok(html.includes('&lt;/textarea&gt;&lt;script&gt;'));assert.ok(!html.includes('</textarea><script>alert(1)'));
});
test('one-click ZIP backup round trips the complete library including trash and drafts',async()=>{
  const f=await fixture(),result=await createPackage({...f,backup:true});
  assert.deepEqual(await importPackage({file:result.path,mediaDir:path.join(f.folder,'restored')}),f.library);
  const selected=sharedLibrary(f.library,{groupId:f.library.groups[0].id,includeDrafts:true});assert.equal(selected.groups.length,1);assert.ok(selected.groups[0].draft);
});
async function malformed(folder,entries){const file=path.join(folder,'malformed.zip'),zip=new yazl.ZipFile(),done=pipeline(zip.outputStream,createWriteStream(file));for(const [name,value] of entries)zip.addBuffer(Buffer.from(value),name);zip.end();await done;return file;}
test('duplicate manifest and hash-mismatched media fail before modifying the library',async()=>{
  const f=await fixture(),manifest=JSON.stringify({format:'prompt-studio-backup',version:2,library:f.library});
  let file=await malformed(f.folder,[['backup.json',manifest],['backup.json',manifest]]);
  await assert.rejects(importPackage({file,mediaDir:path.join(f.folder,'bad')}),/重复/);
  file=await malformed(f.folder,[['backup.json',manifest],['media/'+path.basename(f.item.src),'bad bytes']]);
  await assert.rejects(importPackage({file,mediaDir:path.join(f.folder,'bad')}),/校验失败/);
  await assert.rejects(readdir(path.join(f.folder,'bad')),{code:'ENOENT'});
});
