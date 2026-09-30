const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('promptDesktop',Object.freeze({
  initial:()=>ipcRenderer.sendSync('desktop:initial'),
  ready:()=>ipcRenderer.invoke('desktop:ready'),
  setTheme:theme=>ipcRenderer.invoke('desktop:theme',theme),
  chooseFolder:options=>ipcRenderer.invoke('desktop:folder',options),
  choosePackage:()=>ipcRenderer.invoke('desktop:package-file'),
  openFolder:folder=>ipcRenderer.invoke('desktop:open-folder',folder),
  openData:()=>ipcRenderer.invoke('desktop:data'),
  releases:()=>ipcRenderer.invoke('desktop:release'),
  onPrepareClose:callback=>ipcRenderer.on('desktop:prepare-close',async(_event,id)=>{try{await callback();ipcRenderer.send('desktop:close-result',id,{});}catch(error){ipcRenderer.send('desktop:close-result',id,{error:error.message||'内容尚未保存'});}})
}));
