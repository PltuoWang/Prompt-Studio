import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('local service persists changes, rejects stale writes and blocks external origins',async()=>{
  const testRoot=path.join(root,'test-output');await mkdir(testRoot,{recursive:true});
  const dataDir=await mkdtemp(path.join(testRoot,'server-'));
  let child;
  async function start(){
    child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'0',DATA_DIR:dataDir},stdio:['ignore','pipe','pipe'],windowsHide:true});
    const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Server did not start')),10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.on('error',reject);});
    return base;
  }
  try{
    let base=await start();let state=await (await fetch(base+'/api/library')).json();
    state.library.groups[0].name='测试：保存后可恢复';
    let response=await fetch(base+'/api/library',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:state.revision,library:state.library})});
    assert.equal(response.status,200);
    response=await fetch(base+'/api/library',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:state.revision,library:state.library})});
    assert.equal(response.status,409);
    response=await fetch(base+'/api/library',{method:'PUT',headers:{'Content-Type':'application/json','Origin':'https://example.com'},body:JSON.stringify({baseRevision:1,library:state.library})});
    assert.equal(response.status,403);
    response=await fetch(base+'/api/library',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:1,library:{groups:[]}})});
    assert.equal(response.status,400);
    assert.equal((await fetch(base+'/')).status,200);
    assert.equal((await fetch(base+'/assets/perfume-3.svg')).status,200);
    const outputFolder=path.join(dataDir,'exports'),headers={'Content-Type':'application/json'};
    response=await fetch(base+'/api/export-settings',{method:'PUT',headers,body:JSON.stringify({folder:outputFolder})});assert.equal(response.status,200);
    response=await fetch(base+'/api/export-files',{method:'POST',headers,body:JSON.stringify({groupId:state.library.groups[0].id,versionId:'p1',imageId:state.library.groups[0].versions[0].media[0].id,name:'同名导出'})});
    assert.equal(response.status,200);const exported=await response.json();
    assert.deepEqual(exported.files.map(file=>file.name),['同名导出.svg','同名导出.txt']);
    assert.equal(await readFile(exported.files[1].path,'utf8'),`${state.library.groups[0].versions[0].prompt}\n\n【负面提示词】\n${state.library.groups[0].versions[0].negative}\n`);
    response=await fetch(base+'/api/export-files',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:JSON.stringify({folder:outputFolder})});assert.equal(response.status,403);
    const disk=JSON.parse(await readFile(path.join(dataDir,'library.json'),'utf8'));
    assert.equal(disk.library.groups[0].name,'测试：保存后可恢复');assert.equal(disk.revision,1);
    const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;
    base=await start();state=await (await fetch(base+'/api/library')).json();assert.equal(state.library.groups[0].name,'测试：保存后可恢复');assert.equal(state.revision,1);
    assert.equal((await (await fetch(base+'/api/export-settings')).json()).defaultFolder,outputFolder);
  }finally{if(child)child.kill();}
});
