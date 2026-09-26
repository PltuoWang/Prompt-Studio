// Copyright (c) 2026 Haifeng. All rights reserved.
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {APP_INFO} from './public/version.js';

const dataDir=path.resolve(process.env.DATA_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'Prompt Studio','data'));
const requestedPort=process.env.PORT?Number(process.env.PORT):null;
if(requestedPort!==null&&(!Number.isInteger(requestedPort)||requestedPort<0||requestedPort>65535))throw new Error('PORT must be between 0 and 65535');
const candidates=requestedPort===null?Array.from({length:20},(_,i)=>4173+i):[requestedPort];
const sameDirectory=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
function openBrowser(url){
  if(process.argv.includes('--no-browser'))return;
  const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/d','/s','/c','start','',url]:[url];
  const child=spawn(command,args,{stdio:'ignore',windowsHide:true});child.on('error',()=>console.log(`Please open ${url}`));child.unref();
}
function portAvailable(port){return new Promise(resolve=>{const probe=net.createServer();probe.once('error',()=>resolve(false));probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));});}
let selected;
for(const port of candidates){
  if(port){
    try{
      const response=await fetch(`http://127.0.0.1:${port}/api/app-info`,{signal:AbortSignal.timeout(600)}),info=await response.json();
      if(info.id==='prompt-studio'&&typeof info.dataDir==='string'&&sameDirectory(path.resolve(info.dataDir),dataDir)){
        console.log(`Prompt Studio is already running: http://127.0.0.1:${port}/`);openBrowser(`http://127.0.0.1:${port}/`);process.exit(0);
      }
    }catch{/* An occupied port may belong to another application. */}
  }
  if(await portAvailable(port)){selected=port;break;}
}
if(selected===undefined)throw new Error('No available local port. Set PORT to an unused port and try again.');
process.env.DATA_DIR=dataDir;process.env.PORT=String(selected);
const {server}=await import('./server.mjs');
if(!server.listening)await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}/`;
console.log(`\n${APP_INFO.name} v${APP_INFO.version}\n${APP_INFO.attribution}\n${APP_INFO.copyright}\n\nOpen: ${url}\nData: ${dataDir}\nKeep this window open. After your edits are saved, close this window to stop.\n`);
openBrowser(url);
