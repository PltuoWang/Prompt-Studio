import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {seedLibrary} from '../public/demo.js';
import {clone,createDraft,createVersion,cloneVersion,upgradeLibrary,validateLibrary,searchGroups,updateVersionField} from '../public/model.js';
import {validateMedia,formatDuration,formatBytes} from '../public/media-model.js';
import {receiveMedia,byteRange} from '../media-store.mjs';
import {saveVersionFiles} from '../export-files.mjs';
import {createBackup,prepareRestore,mergeLibrary} from '../backups.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(180000,79)]);
async function temp(){await mkdir(path.join(root,'test-output'),{recursive:true});return mkdtemp(path.join(root,'test-output','media-'));}
function legacy(){const library=seedLibrary();library.groups[0].draft=createDraft(library.groups[0].versions[0]);library.groups[0].draft.prompt='未完成的草稿';library.schema=1;for(const g of library.groups)for(const v of [...g.versions,...(g.draft?[g.draft]:[])]){v.images=v.media.map(({kind,...image})=>image);delete v.media;delete v.generationType;delete v.parameters;}return library;}
async function fixture(){const folder=await temp(),mediaDir=path.join(folder,'media');const item=await receiveMedia(Readable.from([bytes.subarray(0,20),bytes.subarray(20)]),{mediaDir,mime:'video/mp4',name:'移动光线.mp4'});const library=seedLibrary();Object.assign(library.groups[0].versions[0],{media:[item],generationType:'t2v',parameters:{fps:'24',camera:'缓慢推进'}});return {folder,mediaDir,item,library};}
async function service(t,dataDir){
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'0',DATA_DIR:dataDir},stdio:['ignore','pipe','pipe'],windowsHide:true});
  t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}});
  const base=await new Promise((resolve,reject)=>{let output='',errors='';const timer=setTimeout(()=>{child.kill();reject(new Error(`Startup timeout: ${errors}`));},10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);child.on('exit',()=>{clearTimeout(timer);reject(new Error(errors));});});
  const request=async(route,body,method='POST')=>{const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  return {base,request};
}
test('ZIP sharing endpoints remember destination, export, merge import, and reject stale restores',async t=>{
  const dataDir=await temp(),destination=path.join(dataDir,'shares');const {base,request}=await service(t,dataDir);
  assert.equal((await request('/api/package-settings',{folder:destination},'PUT')).status,200);
  assert.equal((await (await fetch(base+'/api/package-settings')).json()).folder,destination);
  const exported=await request('/api/packages',{backup:true,baseRevision:0});assert.equal(exported.status,200);assert.equal(exported.data.groups,6);
  const restored=await request('/api/import-package',{file:exported.data.path,baseRevision:0});assert.equal(restored.status,200);assert.equal(restored.data.library.groups.length,12);
  assert.equal((await request('/api/import-package',{file:exported.data.path,baseRevision:0})).status,409);
});
test('schema upgrade preserves every old image, prompt, version and draft without mutating input',()=>{
  const old=legacy(),before=clone(old),next=upgradeLibrary(old);assert.deepEqual(old,before);assert.equal(next.schema,2);
  for(let i=0;i<old.groups.length;i++)for(let j=0;j<old.groups[i].versions.length;j++){const a=old.groups[i].versions[j],b=next.groups[i].versions[j];assert.equal(a.prompt,b.prompt);assert.deepEqual(b.media,a.images.map(image=>({...image,kind:'image'})));assert.equal(b.generationType,'t2i');}
  assert.equal(next.groups[0].draft.prompt,old.groups[0].draft.prompt);assert.equal(upgradeLibrary(next).schema,2);
});
test('explicit duplication copies prompts and extensible parameters but never result media',()=>{
  const group=seedLibrary().groups[0],base=group.versions[0];base.parameters={fps:24,camera:'环绕'};base.generationType='i2v';
  const before=clone(base),copy=cloneVersion(group,base.id);assert.deepEqual(base,before);assert.equal(copy.prompt,base.prompt);assert.deepEqual(copy.parameters,base.parameters);assert.equal(copy.generationType,'i2v');assert.deepEqual(copy.media,[]);
  copy.parameters.fps=30;assert.equal(base.parameters.fps,24);
  const blank=createVersion(group,base.id);assert.equal(blank.prompt,'');assert.deepEqual(blank.parameters,{});assert.deepEqual(blank.media,[]);
  group.draft={...createDraft(base),prompt:'草稿新内容'};assert.equal(cloneVersion(group,'draft').prompt,'草稿新内容');assert.equal(group.draft.prompt,'草稿新内容');
});
test('media and generation filters find historical videos and prompt-only video groups',()=>{
  const library=seedLibrary(),version=library.groups[0].versions[0];version.generationType='t2v';version.media=[{id:'vid',kind:'video',name:'test.mp4',src:`/media/${'a'.repeat(64)}.mp4`,width:1920,height:1080,duration:5,bytes:42}];
  assert.equal(searchGroups(library.groups,'','all','','','video').length,1);assert.equal(searchGroups(library.groups,'','all','','','image').length,6);
  version.media=[];assert.equal(searchGroups(library.groups,'','all','','','video').length,1);
  version.parameters={camera:'slow orbit'};assert.equal(searchGroups(library.groups,'orbit').length,1);
});
test('media validation rejects mismatched formats, remote URLs and invalid metadata',()=>{
  const item={id:'vid',kind:'video',name:'test',src:`/media/${'a'.repeat(64)}.mp4`};assert.equal(validateMedia(item),true);
  for(const change of [{kind:'image'},{src:'https://example.com/movie.mp4'},{duration:-1},{width:0},{mime:'image/png'},{poster:'data:text/html;base64,QQ=='}])assert.equal(validateMedia({...item,...change}),false);
  const library=seedLibrary();library.groups[0].versions[0].generationType='constructor';assert.throws(()=>validateLibrary(library),/类型/);
  assert.throws(()=>updateVersionField(library.groups[0],'p1','generationType','constructor'),/类型/);
  assert.equal(formatDuration(125),'02:05');assert.equal(formatBytes(1048576),'1.0 MB');
});
test('streaming uploads deduplicate bytes, reject mismatches and clean temporary files',async()=>{
  const {mediaDir,item}=await fixture();const second=await receiveMedia(Readable.from([bytes]),{mediaDir,mime:'video/mp4',name:'duplicate.mp4'});
  assert.equal(second.src,item.src);assert.notEqual(second.id,item.id);assert.deepEqual(await readFile(path.join(mediaDir,path.basename(item.src))),bytes);
  await assert.rejects(()=>receiveMedia(Readable.from([bytes]),{mediaDir,mime:'image/png'}),/格式/);
  await assert.rejects(()=>receiveMedia(Readable.from([bytes]),{mediaDir,mime:'video/mp4',contentLength:513*1024*1024}),/512 MB/);
  const interrupted=async function*(){yield bytes.subarray(0,30);throw new Error('interrupted');};await assert.rejects(()=>receiveMedia(Readable.from(interrupted()),{mediaDir,mime:'video/mp4'}),/interrupted/);
  assert.deepEqual(await readdir(mediaDir),[path.basename(item.src)]);
});
test('video ranges handle seeking, suffixes and invalid requests',()=>{
  assert.deepEqual(byteRange('bytes=10-19',100),{start:10,end:19});assert.deepEqual(byteRange('bytes=-20',100),{start:80,end:99});assert.deepEqual(byteRange('bytes=50-',100),{start:50,end:99});
  for(const range of ['bytes=100-','bytes=9-1','bytes=-0','bytes=','bytes=0-1,8-9'])assert.equal(byteRange(range,100),false);
});
test('managed video and matching prompt export preserve streamed bytes and parameters',async()=>{
  const {folder,mediaDir,item,library}=await fixture(),result=await saveVersionFiles({folder:path.join(folder,'export'),name:'视频探索',version:library.groups[0].versions[0],picture:item,mediaDir});
  assert.deepEqual(result.files.map(file=>file.name),['视频探索.mp4','视频探索.txt']);assert.deepEqual(await readFile(result.files[0].path),bytes);assert.match(await readFile(result.files[1].path,'utf8'),/镜头运动: 缓慢推进/);
});
test('complete backups restore original media into a fresh store and merge collisions safely',async()=>{
  const {folder,mediaDir,library}=await fixture();library.groups[1].deletedAt=new Date().toISOString();library.groups[0].draft=createDraft(library.groups[0].versions[0]);
  const backup=await createBackup({library,folder:path.join(folder,'backups'),mediaDir}),destination=path.join(folder,'restored','media');
  const restored=await prepareRestore({folder:backup.folder,mediaDir:destination});assert.deepEqual(restored,library);assert.equal(backup.files,1);
  assert.deepEqual(await readFile(path.join(destination,path.basename(library.groups[0].versions[0].media[0].src))),bytes);
  const merged=mergeLibrary(library,restored);assert.equal(merged.groups.length,12);assert.deepEqual(merged.groups.slice(0,6),library.groups);assert.notEqual(merged.groups[6].id,library.groups[0].id);
});
test('corrupt backup media is rejected before copying into the destination',async()=>{
  const {folder,mediaDir,item,library}=await fixture(),backup=await createBackup({library,folder,mediaDir}),destination=path.join(folder,'invalid-restore','media');
  await writeFile(path.join(backup.folder,'media',path.basename(item.src)),Buffer.alloc(bytes.length));
  await assert.rejects(()=>prepareRestore({folder:backup.folder,mediaDir:destination}),/校验失败/);
  await assert.rejects(()=>readdir(destination),{code:'ENOENT'});
});
test('restore does not silently reuse a corrupted local file with the same hash filename',async()=>{
  const {folder,mediaDir,item,library}=await fixture(),backup=await createBackup({library,folder,mediaDir});
  await writeFile(path.join(mediaDir,path.basename(item.src)),Buffer.alloc(bytes.length));
  await assert.rejects(()=>prepareRestore({folder:backup.folder,mediaDir}),/本地已有作品文件校验失败/);
  assert.deepEqual(await readFile(path.join(backup.folder,'media',path.basename(item.src))),bytes);
});
test('startup migration backs up exact original bytes and rejects stale schema writes',async t=>{
  const dataDir=await temp(),original=JSON.stringify({revision:7,library:legacy()},null,2);await writeFile(path.join(dataDir,'library.json'),original);
  const {base,request}=await service(t,dataDir),state=await (await fetch(base+'/api/library')).json();assert.equal(state.revision,8);assert.equal(state.library.schema,2);
  const backups=await readdir(path.join(dataDir,'upgrade-backups'));assert.equal(backups.length,1);assert.equal(await readFile(path.join(dataDir,'upgrade-backups',backups[0]),'utf8'),original);
  assert.equal((await request('/api/library',{baseRevision:7,library:legacy()},'PUT')).status,409);
  assert.equal((await request('/api/import-json',{baseRevision:8,library:legacy()})).status,200);
  assert.equal((await (await fetch(base+'/api/library')).json()).library.groups.length,12);
});
test('HTTP media upload, range playback, export and folder restore work end to end',async t=>{
  const dataDir=await temp(),{base,request}=await service(t,dataDir);
  const uploaded=await fetch(base+'/api/media',{method:'POST',headers:{'Content-Type':'video/mp4','X-File-Name':encodeURIComponent('本地视频.mp4')},body:bytes});assert.equal(uploaded.status,201);const item=await uploaded.json();
  const expectedHash=createHash('sha256').update(bytes).digest('hex');assert.equal(item.src,`/media/${expectedHash}.mp4`);
  const state=await (await fetch(base+'/api/library')).json();state.library.groups[0].versions[0].media=[item];
  assert.equal((await request('/api/library',{baseRevision:0,library:state.library},'PUT')).status,200);
  const response=await fetch(base+item.src,{headers:{Range:'bytes=10-29'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 10-29/${bytes.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(10,30));
  const suffix=await fetch(base+item.src,{headers:{Range:'bytes=-5'}});assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),bytes.subarray(-5));
  assert.equal((await fetch(base+item.src,{headers:{Range:'bytes=999999-'}})).status,416);
  assert.equal((await fetch(base+item.src,{method:'HEAD'})).headers.get('content-length'),String(bytes.length));
  assert.equal((await fetch(base+'/api/media',{method:'POST',headers:{'Content-Type':'video/mp4',Origin:'https://example.com'},body:bytes})).status,403);
  const backup=await request('/api/backups',{baseRevision:1,folder:path.join(dataDir,'backups')});assert.equal(backup.status,200);
  const restore=await request('/api/restore',{baseRevision:1,folder:backup.data.folder});assert.equal(restore.status,200);assert.equal(restore.data.library.groups.length,12);
  assert.equal((await request('/api/restore',{baseRevision:1,folder:backup.data.folder})).status,409);
  const missing=clone(restore.data.library);missing.groups[0].versions[0].media[0].src=`/media/${'b'.repeat(64)}.mp4`;
  assert.equal((await request('/api/library',{baseRevision:2,library:missing},'PUT')).status,400);
});
