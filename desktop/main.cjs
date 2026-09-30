// Copyright (c) 2026 Haifeng. All rights reserved.
const {app,BrowserWindow,Menu,ipcMain,dialog,shell,session,screen,nativeTheme}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {randomBytes,randomUUID}=require('node:crypto');
const {once}=require('node:events');
const {validBounds,localFolder}=require('./policy.cjs');
const root=path.join(__dirname,'..');
const base=process.env.PROMPT_STUDIO_HOME||path.join(process.env.LOCALAPPDATA||app.getPath('appData'),'Prompt Studio');
app.setPath('userData',path.join(base,'desktop'));
app.setAppUserModelId('com.haifeng.promptstudio');
const dataDir=path.join(base,'data');
let win,server,origin='',prefs={},closing=false,allowClose=false,ready=false;
const closeWaiters=new Map();
const prefFile=path.join(app.getPath('userData'),'preferences.json');
const logFile=path.join(base,'logs','desktop.log');
function log(error){try{fs.mkdirSync(path.dirname(logFile),{recursive:true});if(fs.existsSync(logFile)&&fs.statSync(logFile).size>1024*1024)fs.renameSync(logFile,logFile+'.previous');fs.appendFileSync(logFile,`${new Date().toISOString()} ${error.stack||error}\n`);}catch{}}
function savePrefs(){try{fs.mkdirSync(path.dirname(prefFile),{recursive:true});fs.writeFileSync(prefFile+'.tmp',JSON.stringify(prefs));fs.renameSync(prefFile+'.tmp',prefFile);}catch(error){log(error);}}
function trusted(event){return win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url.startsWith(origin+'/');}
function handle(name,fn){ipcMain.handle(name,(event,...args)=>{if(!origin||!trusted(event))throw Error('Unsupported window');return fn(...args);});}
function applyTheme(value){prefs.theme=value==='dark'?'dark':'light';nativeTheme.themeSource=prefs.theme;win?.setTitleBarOverlay({color:prefs.theme==='dark'?'#1c1c1e':'#f5f5f7',symbolColor:prefs.theme==='dark'?'#f5f5f7':'#1d1d1f',height:40});savePrefs();}
async function closeWindow(){
  if(closing||allowClose)return;closing=true;
  try{
    if(ready&&!win.webContents.isCrashed()){
      const id=randomUUID();
      const result=await new Promise(resolve=>{const timer=setTimeout(()=>{closeWaiters.delete(id);resolve({error:'保存确认超时，请返回软件检查保存状态。'});},15000);closeWaiters.set(id,result=>{clearTimeout(timer);resolve(result);});win.webContents.send('desktop:prepare-close',id);});
      if(result.error){const {response}=await dialog.showMessageBox(win,{type:'warning',title:'退出 Prompt Studio',message:'还有内容未保存',detail:result.error,buttons:['返回软件','放弃未保存内容并退出'],defaultId:0,cancelId:0,noLink:true});if(response!==1)return;}
    }
    prefs.bounds=win.getNormalBounds();prefs.maximized=win.isMaximized();savePrefs();allowClose=true;win.close();
  }finally{closing=false;}
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.on('window-all-closed',()=>{server?.closeAllConnections();server?.close();app.quit();});
  app.on('before-quit',event=>{if(win&&!win.isDestroyed()&&!allowClose){event.preventDefault();closeWindow();}});
  app.whenReady().then(async()=>{
    try{prefs=JSON.parse(fs.readFileSync(prefFile,'utf8'));}catch{}
    nativeTheme.themeSource=prefs.theme==='dark'?'dark':'light';
    win=new BrowserWindow({...validBounds(prefs.bounds,screen.getAllDisplays().map(d=>d.workArea)),minWidth:1000,minHeight:680,show:false,title:'Prompt Studio',icon:path.join(root,'build','icon.ico'),backgroundColor:nativeTheme.shouldUseDarkColors?'#151517':'#f5f5f7',titleBarStyle:'hidden',titleBarOverlay:{color:nativeTheme.shouldUseDarkColors?'#1c1c1e':'#f5f5f7',symbolColor:nativeTheme.shouldUseDarkColors?'#f5f5f7':'#1d1d1f',height:40},webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false}});
    Menu.setApplicationMenu(null);
    win.once('ready-to-show',()=>{if(prefs.maximized)win.maximize();win.show();});
    win.on('close',event=>{if(!allowClose){event.preventDefault();closeWindow();}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(!origin||new URL(url).origin!==origin)event.preventDefault();});
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.on('render-process-gone',(_event,details)=>{ready=false;log(JSON.stringify(details));dialog.showMessageBox(win,{type:'error',message:'界面暂时停止响应',detail:'已保存的资料仍在本机。请关闭并重新打开 Prompt Studio。'});});
    win.webContents.on('context-menu',(_event,params)=>{const template=params.isEditable?[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]:params.selectionText?[{role:'copy',label:'复制'}]:[];if(template.length)Menu.buildFromTemplate(template).popup({window:win});});
    await win.loadFile(path.join(__dirname,'splash.html'));
    // Preserve the portable edition's data location, but never run two writers.
    for(let port=4173;port<4193;port++){
      try{const info=await (await fetch(`http://127.0.0.1:${port}/api/app-info`,{signal:AbortSignal.timeout(120)})).json();if(info.id==='prompt-studio'&&typeof info.dataDir==='string'&&path.resolve(info.dataDir).toLowerCase()===dataDir.toLowerCase())throw Object.assign(Error('旧版 Prompt Studio 正在使用资料库。请先关闭旧版启动窗口，再重新打开桌面版。'),{legacyRunning:true});}catch(error){if(error.legacyRunning)throw error;}
    }
    const token=randomBytes(32).toString('hex');
    process.env.DATA_DIR=dataDir;process.env.PORT='0';process.env.DESKTOP_TOKEN=token;
    ({server}=await import(pathToFileURL(path.join(root,'server.mjs')).href));
    if(!server.listening)await once(server,'listening');
    origin=`http://127.0.0.1:${server.address().port}`;
    session.defaultSession.webRequest.onBeforeSendHeaders({urls:[origin+'/*']},(details,callback)=>callback({requestHeaders:{...details.requestHeaders,'X-Prompt-Studio-Token':token}}));
    session.defaultSession.setPermissionCheckHandler((_wc,permission,requestingOrigin)=>requestingOrigin===origin&&['clipboard-read','clipboard-sanitized-write'].includes(permission));
    session.defaultSession.setPermissionRequestHandler((wc,permission,callback)=>callback(wc===win.webContents&&wc.getURL().startsWith(origin+'/')&&['clipboard-read','clipboard-sanitized-write'].includes(permission)));
    ipcMain.on('desktop:initial',(event)=>{event.returnValue=trusted(event)?{theme:prefs.theme||'light',version:app.getVersion()}:null;});
    handle('desktop:ready',()=>{ready=true;});
    handle('desktop:package-file',async()=>{const result=await dialog.showOpenDialog(win,{title:'导入分享包或完整备份',filters:[{name:'Prompt Studio 分享包',extensions:['zip']}],properties:['openFile']});return result.canceled?null:result.filePaths[0];});
    handle('desktop:theme',theme=>applyTheme(theme));
    handle('desktop:folder',async({initial='',restore=false}={})=>{const result=await dialog.showOpenDialog(win,{title:restore?'选择完整备份文件夹':'选择保存文件夹',defaultPath:localFolder(initial)?initial:app.getPath('pictures'),properties:['openDirectory',...(restore?[]:['createDirectory'])]});return result.canceled?null:result.filePaths[0];});
    handle('desktop:open-folder',async folder=>{if(!localFolder(folder))throw Error('请选择有效的本地文件夹');const stat=await fs.promises.stat(folder);if(!stat.isDirectory())throw Error('文件夹不存在');const error=await shell.openPath(folder);if(error)throw Error(error);});
    handle('desktop:data',async()=>{await fs.promises.mkdir(dataDir,{recursive:true});await shell.openPath(dataDir);});
    handle('desktop:release',()=>shell.openExternal('https://github.com/PltuoWang/vibecoding-app/releases/latest'));
    ipcMain.on('desktop:close-result',(event,id,result)=>{if(trusted(event)){closeWaiters.get(id)?.(result||{});closeWaiters.delete(id);}});
    await win.loadURL(origin+'/');
  }).catch(error=>{log(error);dialog.showErrorBox('Prompt Studio 无法启动',`${error.message}\n\n错误日志：${logFile}\n你的原有资料不会被删除。`);allowClose=true;app.quit();});
}
