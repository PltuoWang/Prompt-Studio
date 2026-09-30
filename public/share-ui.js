import {desktop,folderPicker,revealFolder} from './desktop-ui.js';
import {formatBytes} from './media-model.js';
export let packageBusy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(url,body,method='POST'){
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'操作失败');return result;
}
export async function packageCenter({openModal,flush,getRevision,groups,currentId,onRestored,quick=false}){
  if(packageBusy)return;
  const settings=await request('/api/package-settings',undefined,'GET');
  const run=async(body,restore=false)=>{
    if(packageBusy)return;packageBusy=true;
    openModal(restore?'正在导入分享包':'正在打包资料',`<div class="package-progress" role="status"><span class="package-spinner"></span><h3>${restore?'正在校验并合并作品…':'正在整理提示词与原始作品…'}</h3><p>视频较多时需要一些时间，请保持软件打开。</p></div>`);
    try{
      await flush();
      const result=await request(restore?'/api/import-package':'/api/packages',{...body,baseRevision:getRevision()});
      if(restore)onRestored(result);
      openModal(restore?'导入完成':body.backup?'完整备份已保存':'分享包已准备好',restore?`<p>已导入 ${result.imported} 个提示词组。原有资料已保留，重复组作为副本导入。</p><div class="modal-actions"><button class="btn primary" data-action="close-modal">完成</button></div>`:`<div class="package-success">✓</div><p>${result.groups} 个提示词组 · ${formatBytes(result.bytes)}</p><p>${body.backup?'包含所有版本、草稿、回收站和原始作品，可直接导入恢复。':'把这个 ZIP 发给别人即可。对方解压后打开 index.html 就能查看，也可以导入 Prompt Studio。'}</p><div class="settings-path">${esc(result.path)}</div><div class="modal-actions">${revealFolder(result.folder)}<button class="btn primary" data-action="close-modal">完成</button></div>`);
    }catch(error){openModal('操作未完成',`<p class="error-text" role="alert">${esc(error.message)}</p><p>原有资料没有被覆盖。请检查保存位置和剩余空间后重试。</p><div class="modal-actions"><button class="btn primary" data-action="close-modal">知道了</button></div>`);}
    finally{packageBusy=false;}
  };
  if(quick)return run({backup:true});
  const active=groups.filter(g=>!g.deletedAt);
  openModal('备份与分享',`<p>把作品和提示词一起带走，保留每个版本的对应关系。</p><div class="package-toolbar"><button class="btn primary" id="quick-package-backup">一键完整备份</button><button class="btn" id="import-package">导入分享包 / 备份</button></div><form id="share-package-form"><div class="field"><label for="package-scope">分享范围</label><select id="package-scope" name="groupId"><option value="">全部 ${active.length} 个提示词组</option>${active.map(g=>`<option value="${esc(g.id)}" ${currentId===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div><label class="package-checkbox"><input name="includeDrafts" type="checkbox">同时分享未完成的草稿</label><p class="package-hint">包含所选组的所有版本、提示词及图片／视频，不包含回收站。分享包内附离线预览页。</p><div class="field"><label for="package-folder">默认备份与分享文件夹</label><input id="package-folder" name="folder" required value="${esc(settings.folder)}">${folderPicker('package-folder')}</div><button class="btn ghost" type="button" id="save-package-folder">记住这个位置</button><p class="error-text" id="package-error" role="alert"></p><div class="modal-actions"><button class="btn ghost" type="button" data-action="close-modal">取消</button><button class="btn primary" type="submit" ${active.length?'':'disabled'}>导出分享 ZIP</button></div></form>`);
  const form=document.querySelector('#share-package-form'),error=document.querySelector('#package-error');
  document.querySelector('#quick-package-backup').onclick=()=>run({backup:true,folder:form.elements.folder.value});
  document.querySelector('#save-package-folder').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await request('/api/package-settings',{folder:form.elements.folder.value},'PUT');button.textContent='已记住保存位置';error.textContent='';}catch(cause){error.textContent=cause.message;}finally{button.disabled=false;}};
  document.querySelector('#import-package').onclick=async()=>{
    try{
      if(desktop){const file=await desktop.choosePackage();if(file)await run({file},true);}
      else{openModal('导入分享包',`<form id="import-package-form"><div class="field"><label>ZIP 文件完整路径</label><input name="file" required placeholder="例如 E:\\分享包.zip"></div><div class="modal-actions"><button class="btn primary">合并导入</button></div></form>`);document.querySelector('#import-package-form').onsubmit=event=>{event.preventDefault();run({file:event.currentTarget.elements.file.value},true);};}
    }catch(cause){error.textContent=cause.message;}
  };
  form.onsubmit=event=>{event.preventDefault();run({folder:form.elements.folder.value,groupId:form.elements.groupId.value||undefined,includeDrafts:form.elements.includeDrafts.checked});};
}
