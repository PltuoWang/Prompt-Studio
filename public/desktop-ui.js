export const desktop=window.promptDesktop;
export function folderPicker(inputId,{restore=false}={}){return desktop?`<button class="btn folder-picker" type="button" data-desktop-folder="${inputId}" ${restore?'data-restore="true"':''}>浏览文件夹…</button>`:'';}
export function revealFolder(folder){return desktop?`<button class="btn" type="button" data-desktop-reveal="${String(folder).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}">打开文件夹</button>`:'';}
if(desktop){
  document.documentElement.classList.add('desktop');
  const bar=document.createElement('div');bar.className='desktop-titlebar';bar.innerHTML='<span class="desktop-mark">P</span><strong>Prompt Studio</strong><span>你的本地创作资料库</span>';document.body.prepend(bar);
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-desktop-folder],[data-desktop-reveal],[data-desktop-command]');if(!button)return;
    button.disabled=true;
    try{
      if(button.dataset.desktopFolder){const input=document.getElementById(button.dataset.desktopFolder);const folder=await desktop.chooseFolder({initial:input.value,restore:button.dataset.restore==='true'});if(folder){input.value=folder;input.dispatchEvent(new Event('input',{bubbles:true}));}}
      else if(button.dataset.desktopReveal)await desktop.openFolder(button.dataset.desktopReveal);
      else if(button.dataset.desktopCommand==='data')await desktop.openData();
      else if(button.dataset.desktopCommand==='releases')await desktop.releases();
    }catch(error){window.dispatchEvent(new CustomEvent('desktop-error',{detail:error.message}));}finally{button.disabled=false;}
  });
}
