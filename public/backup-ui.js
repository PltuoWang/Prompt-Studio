import {exportSettings,loadExportSettings} from './export-ui.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function backupDialog({restore=false,openModal,flush,getRevision,onRestored}){
  await loadExportSettings();
  openModal(restore?'恢复文件夹备份':'创建完整备份',`<p>${restore?'填写包含 backup.json 和 media 的备份文件夹。导入内容会合并到资料库，重名组保留为副本。':'备份包含图片、视频原文件、提示词、版本、草稿和回收站。会在指定位置创建独立备份文件夹。'}</p><form id="folder-backup-form"><div class="field"><label for="backup-folder">${restore?'备份文件夹完整路径':'备份保存位置'}</label><input id="backup-folder" name="folder" required value="${restore?'':esc(exportSettings.defaultFolder||exportSettings.suggestedFolder)}" placeholder="粘贴文件夹的完整路径"></div><p class="error-text" id="backup-error" role="alert"></p><div class="modal-actions"><button class="btn ghost" type="button" data-action="close-modal">取消</button><button class="btn primary" type="submit">${restore?'合并恢复':'开始备份'}</button></div></form>`);
  const form=document.querySelector('#folder-backup-form'),error=document.querySelector('#backup-error'),button=form.querySelector('[type=submit]');
  form.addEventListener('submit',async event=>{
    event.preventDefault();button.disabled=true;button.textContent=restore?'正在恢复…':'正在备份…';error.textContent='';
    try{
      await flush();
      const response=await fetch(restore?'/api/restore':'/api/backups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:form.elements.folder.value,baseRevision:getRevision()})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'操作失败');
      if(restore)onRestored(result);
      openModal(restore?'备份已恢复':'完整备份已创建',restore?`<p>已合并 ${result.imported} 个提示词组，原有资料完整保留。</p><div class="modal-actions"><button class="btn primary" data-action="close-modal">完成</button></div>`:`<p>已备份 ${result.groups} 个组和 ${result.files} 个独立作品文件。请将整个文件夹一起保管。</p><div class="settings-path">${esc(result.folder)}</div><div class="modal-actions"><button class="btn primary" data-action="close-modal">完成</button></div>`);
    }catch(cause){error.textContent=cause.message;button.disabled=false;button.textContent=restore?'合并恢复':'开始备份';}
  });
}
