import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
const {validBounds,localFolder}=createRequire(import.meta.url)('../desktop/policy.cjs');
test('window position recovers from a removed monitor and clamps resized work areas',()=>{
 const areas=[{x:0,y:0,width:1920,height:1040}];
 assert.deepEqual(validBounds({x:3000,y:0,width:1400,height:900},areas),{width:1360,height:880});
 assert.deepEqual(validBounds({x:1000,y:900,width:1400,height:900},areas),{x:520,y:140,width:1400,height:900});
 assert.deepEqual(validBounds({x:NaN,y:0,width:1400,height:900},areas),{width:1360,height:880});
});
test('folder bridge rejects URLs, relative paths and device paths',()=>{
 assert.equal(localFolder('https://example.com'),false);assert.equal(localFolder('javascript:alert(1)'),false);assert.equal(localFolder('../data'),false);assert.equal(localFolder('C:\\test\0'),false);
 if(process.platform==='win32'){assert.equal(localFolder('C:\\我的作品'),true);assert.equal(localFolder('\\\\.\\PhysicalDrive0'),false);}
});
test('desktop backend refuses unauthenticated readers and writers',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'prompt-desktop-auth-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),windowsHide:true,env:{...process.env,DATA_DIR:directory,PORT:'0',DESKTOP_TOKEN:'integration-test-token'},stdio:['ignore','pipe','pipe']});
 try{
  const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error(`Server exited ${code}`));});});
  assert.equal((await fetch(url+'/api/library')).status,403);
  assert.equal((await fetch(url+'/api/export-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:directory})})).status,403);
  assert.equal((await fetch(url+'/api/app-info',{headers:{'X-Prompt-Studio-Token':'wrong'}})).status,403);
  const response=await fetch(url+'/api/library',{headers:{'X-Prompt-Studio-Token':'integration-test-token'}});assert.equal(response.status,200);assert.ok(Array.isArray((await response.json()).library.groups));
 }finally{const exited=once(child,'exit');child.kill();await exited;await rm(directory,{recursive:true,force:true});}
});
