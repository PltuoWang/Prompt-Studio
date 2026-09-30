import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {seedLibrary} from './public/demo.js';
import {clone,validateLibrary,upgradeLibrary} from './public/model.js';
import {exportFolder,saveVersionFiles} from './export-files.mjs';
import {receiveMedia,serveMedia,validateMediaFiles} from './media-store.mjs';
import {createBackup,prepareRestore,mergeLibrary} from './backups.mjs';
import {createPackage,importPackage} from './share-packages.mjs';
import {APP_INFO} from './public/version.js';
const root=path.dirname(fileURLToPath(import.meta.url)),publicDir=path.join(root,'public');
const dataDir=process.env.DATA_DIR||path.join(root,'data'),mediaDir=path.join(dataDir,'media'),port=Number(process.env.PORT||4173);
await mkdir(mediaDir,{recursive:true});
const filename=path.join(dataDir,'library.json');
let state,original;
try{original=await readFile(filename,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(original!==undefined){
  state=JSON.parse(original);
  if(!Number.isSafeInteger(state.revision)||state.revision<0)throw new Error('资料版本记录无效');
  if(state.library.schema===1){
    const upgraded=upgradeLibrary(state.library),backupDir=path.join(dataDir,'upgrade-backups');
    await mkdir(backupDir,{recursive:true});
    await writeFile(path.join(backupDir,`library-v1-${Date.now()}-${randomUUID().slice(0,6)}.json`),original,{flag:'wx'});
    state={revision:state.revision+1,library:upgraded};
    await writeFile(`${filename}.tmp`,JSON.stringify(state,null,2));await rename(`${filename}.tmp`,filename);
  }
  validateLibrary(state.library);
}else{state={revision:0,library:seedLibrary()};await writeFile(filename,JSON.stringify(state,null,2),{flag:'wx'});}
let queue=Promise.resolve(),exportQueue=Promise.resolve();
const settingsFile=path.join(dataDir,'settings.json');let exportSettings={defaultFolder:''};
try{const saved=JSON.parse(await readFile(settingsFile,'utf8'));if(saved.defaultFolder)exportSettings.defaultFolder=exportFolder(saved.defaultFolder);}catch(error){if(error.code!=='ENOENT')console.error('Cannot read export settings:',error.message);}
async function saveExportSettings(folder){const next={defaultFolder:exportFolder(folder)};await writeFile(`${settingsFile}.tmp`,JSON.stringify(next,null,2));await rename(`${settingsFile}.tmp`,settingsFile);exportSettings=next;}
const packageSettingsFile=path.join(dataDir,'package-settings.json');
let packageFolder=path.join(os.homedir(),'Documents','Prompt Studio','备份与分享');
try{packageFolder=exportFolder(JSON.parse(await readFile(packageSettingsFile,'utf8')).folder);}catch(error){if(error.code!=='ENOENT')console.error('Cannot read backup settings:',error.message);}
function enqueue(operation){const result=queue.then(operation);queue=result.catch(()=>{});return result;}
function assertRevision(revision){if(revision!==state.revision)throw Object.assign(new Error('资料已在另一窗口修改，请保留当前内容后刷新页面'),{status:409});}
async function saveLibrary(library){validateLibrary(library);if(Buffer.byteLength(JSON.stringify(library))>40*1024*1024-1024)throw new Error('文字、封面与旧图资料超过 40 MB，请拆分资料库后再合并');await validateMediaFiles(library,mediaDir);const next={revision:state.revision+1,library};await writeFile(`${filename}.tmp`,JSON.stringify(next,null,2));await rename(`${filename}.tmp`,filename);state=next;return next;}
async function readJSON(req,limit=40*1024*1024){
  if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(new Error('需要 JSON 格式'),{status:415});
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('资料内容过大，请使用完整文件夹备份'),{status:413});chunks.push(chunk);}
  try{const body=JSON.parse(Buffer.concat(chunks).toString());if(!body||typeof body!=='object')throw new Error();return body;}catch{throw Object.assign(new Error('资料格式无效'),{status:400});}
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
export const server=http.createServer(async(req,res)=>{
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
    if(process.env.DESKTOP_TOKEN&&req.headers['x-prompt-studio-token']!==process.env.DESKTOP_TOKEN)return json(403,{error:'请通过 Prompt Studio 桌面窗口访问'});
    const allowedHosts=[`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`];
    if(!allowedHosts.includes(req.headers.host))return json(403,{error:'仅允许本机访问'});
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&!allowedHosts.map(host=>`http://${host}`).includes(req.headers.origin))return json(403,{error:'来源不被允许'});
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname==='/api/app-info'){
      if(req.method!=='GET')return json(405,{error:'不支持此操作'});
      return json(200,{id:'prompt-studio',...APP_INFO,dataDir:path.resolve(dataDir)});
    }
    if(url.pathname.startsWith('/media/')){if(await serveMedia(req,res,mediaDir,url.pathname))return;return json(404,{error:'作品文件不存在'});}
    if(url.pathname==='/api/media'){
      if(req.method!=='POST')return json(405,{error:'不支持此操作'});
      let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{return json(400,{error:'文件名称无效'});}
      return json(201,await receiveMedia(req,{mediaDir,mime:req.headers['content-type']?.split(';')[0],name,contentLength:req.headers['content-length']}));
    }
    if(url.pathname==='/api/library'){
      if(req.method==='GET')return json(200,state);
      if(req.method!=='PUT')return json(405,{error:'不支持此操作'});
      const body=await readJSON(req);
      if(body.library?.schema===1)return json(409,{error:'资料格式已升级，请刷新页面后继续；旧资料已自动备份'});
      try{validateLibrary(body.library);}catch(error){return json(400,{error:error.message});}
      return await enqueue(async()=>{assertRevision(body.baseRevision);const next=await saveLibrary(body.library);json(200,{revision:next.revision});});
    }
    if(url.pathname==='/api/export-settings'||url.pathname==='/api/export-files'){
      if(url.pathname==='/api/export-settings'&&req.method==='GET')return json(200,{...exportSettings,suggestedFolder:path.join(os.homedir(),'Pictures','Prompt Studio')});
      if(req.method!==(url.pathname==='/api/export-settings'?'PUT':'POST'))return json(405,{error:'不支持此操作'});
      const body=await readJSON(req,16000);
      const operation=exportQueue.then(async()=>{
        if(url.pathname==='/api/export-settings'){await saveExportSettings(body.folder);return json(200,exportSettings);}
        const group=state.library.groups.find(group=>group.id===body.groupId);if(!group||group.deletedAt)throw new Error('请先选择未删除的提示词组');
        const version=body.versionId==='draft'?group.draft:group.versions.find(version=>version.id===body.versionId);if(!version)throw new Error('版本不存在，请重新打开');
        const mediaId=body.mediaId||body.imageId,picture=mediaId?version.media.find(item=>item.id===mediaId):null;
        if(mediaId&&!picture)throw new Error('作品已不存在，请重新选择');
        const result=await saveVersionFiles({folder:body.folder||exportSettings.defaultFolder,name:body.name,version,picture,publicDir,mediaDir});
        if(body.setDefault){try{await saveExportSettings(result.folder);}catch{result.warning='文件已保存，但默认文件夹未记住，请在设置中重试';}}
        json(200,{...result,defaultFolder:exportSettings.defaultFolder});
      });exportQueue=operation.catch(()=>{});await operation;return;
    }
    if(url.pathname==='/api/package-settings'){
      if(req.method==='GET')return json(200,{folder:packageFolder});
      if(req.method!=='PUT')return json(405,{error:'不支持此操作'});
      const body=await readJSON(req,16000),folder=exportFolder(body.folder);
      return await enqueue(async()=>{await writeFile(packageSettingsFile+'.tmp',JSON.stringify({folder}));await rename(packageSettingsFile+'.tmp',packageSettingsFile);packageFolder=folder;json(200,{folder});});
    }
    if(url.pathname==='/api/packages'){
      if(req.method!=='POST')return json(405,{error:'不支持此操作'});
      const body=await readJSON(req,16000);
      const operation=exportQueue.then(async()=>{assertRevision(body.baseRevision);return json(200,await createPackage({library:clone(state.library),folder:body.folder||packageFolder,mediaDir,publicDir,backup:body.backup===true,groupId:body.groupId,includeDrafts:body.includeDrafts===true}));});
      exportQueue=operation.catch(()=>{});await operation;return;
    }
    if(url.pathname==='/api/import-package'){
      if(req.method!=='POST')return json(405,{error:'不支持此操作'});
      const body=await readJSON(req,16000);assertRevision(body.baseRevision);
      const imported=await importPackage({file:body.file,mediaDir});
      return await enqueue(async()=>{assertRevision(body.baseRevision);const next=await saveLibrary(mergeLibrary(state.library,imported));json(200,{...next,imported:imported.groups.length});});
    }
    if(url.pathname==='/api/backups'){
      if(req.method!=='POST')return json(405,{error:'不支持此操作'});
      const body=await readJSON(req,16000);assertRevision(body.baseRevision);
      return json(200,await createBackup({library:clone(state.library),folder:body.folder||exportSettings.defaultFolder,mediaDir}));
    }
    if(url.pathname==='/api/import-json'){
      if(req.method!=='POST')return json(405,{error:'不支持此操作'});
      const body=await readJSON(req);assertRevision(body.baseRevision);
      const imported=upgradeLibrary(body.library);await validateMediaFiles(imported,mediaDir);
      return await enqueue(async()=>{assertRevision(body.baseRevision);const next=await saveLibrary(mergeLibrary(state.library,imported));json(200,{...next,imported:imported.groups.length});});
    }
    if(url.pathname==='/api/restore'){
      if(req.method!=='POST')return json(405,{error:'不支持此操作'});
      const body=await readJSON(req,16000);assertRevision(body.baseRevision);
      const imported=await prepareRestore({folder:body.folder,mediaDir});
      return await enqueue(async()=>{assertRevision(body.baseRevision);const next=await saveLibrary(mergeLibrary(state.library,imported));json(200,{...next,imported:imported.groups.length});});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'不支持此操作'});
    if(url.pathname==='/favicon.ico'){res.writeHead(302,{Location:'/assets/logo.svg'});res.end();return;}
    const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),target=path.resolve(publicDir,`.${relative}`);
    if(!target.startsWith(publicDir+path.sep))return json(403,{error:'路径无效'});
    const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){
    const message=['EACCES','EPERM'].includes(error.code)?'无法写入这个文件夹，请选择有写入权限的位置':error.code==='ENOSPC'?'磁盘空间不足，请更换保存位置':error.code==='ENOTDIR'?'保存位置不是文件夹，请检查路径':error.code==='ENOENT'?'文件不存在，请检查路径或重新导入':error.message;
    if(!res.headersSent)json(error.status||(error.code==='ENOENT'?404:400),{error:message});else res.end();
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Prompt Studio ready: http://127.0.0.1:${server.address().port}\nLocal data: ${filename}`));
