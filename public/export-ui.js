import {MEDIA_TYPES,mediaMime,mediaKind} from './media-model.js';
export const exportSettings={defaultFolder:'',suggestedFolder:''};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(url,options){
  const response=await fetch(url,options),result=await response.json();
  if(!response.ok)throw new Error(result.error||'无法保存，请重试');
  return result;
}
export async function loadExportSettings(){Object.assign(exportSettings,await request('/api/export-settings'));}
export async function setDefaultFolder(folder){
  const result=await request('/api/export-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder})});
  Object.assign(exportSettings,result);
}
export async function saveFilesDialog({owner,version,versionId,picture,openModal,flush}){
  await loadExportSettings();
  const versionName=versionId==='draft'?'草稿':`V${version.number}`;
  const defaultName=`${owner.name}-${versionName}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_');
  const extension=picture?(picture.src.startsWith('/assets/')?'svg':MEDIA_TYPES[mediaMime(picture)]?.extension):null;
  openModal('保存到文件夹',`<p>${picture?`保存当前${mediaKind(picture)==='video'?'视频':'图片'}和这个版本的提示词，两份文件使用相同名称。`:'当前版本没有作品，将保存提示词文本。'}同名文件会自动加序号。</p><form id="save-files-form"><div class="modal-form"><div class="field full"><label for="export-folder">保存文件夹</label><input id="export-folder" name="folder" value="${esc(exportSettings.defaultFolder||exportSettings.suggestedFolder)}" placeholder="例如 E:\\我的图片\\提示词收藏" required><small>粘贴 Windows 文件夹完整路径，不存在的文件夹会自动创建。</small></div><div class="field full"><label for="export-name">文件名称（不含扩展名）</label><input id="export-name" name="name" value="${esc(defaultName)}" maxlength="100" required></div></div><label class="check-row"><input type="checkbox" id="export-default" name="setDefault" checked>设为默认保存文件夹</label><div class="export-preview" id="export-preview"></div><p class="error-text" id="export-error" role="alert"></p><div class="modal-actions"><button class="btn ghost" type="button" data-action="close-modal">取消</button><button class="btn primary" id="export-submit" type="submit">保存</button></div></form>`);
  const form=document.querySelector('#save-files-form'),name=form.elements.name,preview=document.querySelector('#export-preview'),error=document.querySelector('#export-error'),submit=document.querySelector('#export-submit');
  const updatePreview=()=>{const stem=name.value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().replace(/[. ]+$/,'')||'文件名称';preview.textContent=[...(extension?[`${stem}.${extension}`]:[]),`${stem}.txt`].join('\n');};
  name.addEventListener('input',updatePreview);updatePreview();
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;submit.textContent='正在保存…';error.textContent='';
    try{
      await flush();
      const result=await request('/api/export-files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groupId:owner.id,versionId,mediaId:picture?.id,folder:form.elements.folder.value,name:name.value,setDefault:form.elements.setDefault.checked})});
      exportSettings.defaultFolder=result.defaultFolder;
      openModal('已保存到文件夹',`<p>文件已写入你的电脑。</p><div class="settings-path">${esc(result.folder)}</div><div class="saved-files">${result.files.map(file=>`<div><span class="file-type">${esc(file.name.split('.').at(-1).toUpperCase())}</span><span>${esc(file.name)}</span></div>`).join('')}</div>${result.warning?`<p class="error-text">${esc(result.warning)}</p>`:''}<div class="modal-actions"><button class="btn primary" data-action="close-modal">完成</button></div>`);
    }catch(cause){error.textContent=cause.message;submit.disabled=false;submit.textContent='保存';}
  });
}
