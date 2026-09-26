import {APP_INFO} from './version.js';
import {clone,uid,latest,preferred,createVersion,cloneVersion,upgradeLibrary,updateVersionField,commitDraft,searchGroups,diffTokens,validateLibrary,removeMedia} from './model.js';
import {ratioLabel,loadImage} from './image-utils.js';
import {openCropEditor} from './image-editor.js';
import {exportSettings,loadExportSettings,setDefaultFolder,saveFilesDialog} from './export-ui.js';
import {themeControl,setTheme} from './theme.js';
import {MEDIA_ACCEPT,generationTypes,mediaKind,mediaSummary} from './media-model.js';
import {importOneMedia,dataUrlFile,captureFrame} from './media-client.js';
import {mediaPreview,mediaInfo} from './media-view.js';
import {backupDialog} from './backup-ui.js';
const app=document.querySelector('#app'), modal=document.querySelector('#modal'), transfer=document.querySelector('#transfer-status');
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',edit:'m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5',trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',plus:'M12 5v14 M5 12h14',copy:'M9 9h12v12H9z M5 15H3V3h12v2',arrow:'M19 12H5 M11 6l-6 6 6 6',chevron:'m9 5 7 7-7 7',layers:'m12 3 10 5-10 5L2 8Z M2 12l10 5 10-5 M2 16l10 5 10-5',image:'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h.01',check:'m5 12 4 4L19 6',close:'m6 6 12 12 M6 18 18 6',upload:'M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5',download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',compare:'M9 3v18 M15 3v18 M3 7h3 M18 17h3 M3 17h3 M18 7h3',folder:'M3 6h7l2 3h9v12H3Z',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z M8 12l3 3 5-6',expand:'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',list:'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01',note:'M4 3h16v18H4Z M8 7h8 M8 11h8 M8 15h5',restore:'M3 4v6h6 M3 10a9 9 0 1 1 1 8',spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2'};
paths.video='M3 5h12v14H3Z M15 9l6-3v12l-6-3';
paths.crop='M6 3v15h15 M3 6h15v15';
paths.clipboard='M9 5H5v16h14V5h-4 M9 3h6v4H9Z';
const icon=(name)=>`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.folder}"/></svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sources=['网络收藏','ComfyUI','Codex','Grok','其他'];
const ui={page:'library',filter:'all',tag:'',source:'',mediaKind:'',query:'',sort:'recent',view:'grid',groupId:null,versionId:null,mediaIndex:0,compareA:null,compareB:null};
let dataDirectory='',library,revision=0,status='saved',pending=false,savePromise=null,saveTimer,toastTimer,modalMedia=[],pendingDeletion=null,activeTransfer=null;
const group=()=>library.groups.find(g=>g.id===ui.groupId);
const current=()=>ui.versionId==='draft'?group()?.draft:group()?.versions.find(v=>v.id===ui.versionId);
const fmt=date=>new Date(date).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}).replace('/','.');
function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('toast-visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('toast-visible'),3000);}
function updateStatus(){document.querySelectorAll('.save-status').forEach(node=>{node.textContent=status==='saving'?'正在保存…':status==='error'?'保存失败 · 点击重试':'本地已保存';node.classList.toggle('error',status==='error');});}
function persist(){pending=true;status='saving';updateStatus();clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(()=>{}),400);}
async function flush(){
  clearTimeout(saveTimer);
  if(savePromise)return savePromise;
  savePromise=(async()=>{
    while(pending){
      pending=false;status='saving';updateStatus();
      try{
        const response=await fetch('/api/library',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:revision,library:clone(library)})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败');
        revision=result.revision;
      }catch(error){pending=true;status='error';updateStatus();toast(error.message);throw error;}
    }
    status='saved';updateStatus();
  })();
  try{await savePromise;}finally{savePromise=null;}
}
function sidebar(){
  const active=library.groups.filter(g=>!g.deletedAt), tags=[...new Set(active.flatMap(g=>g.tags))].slice(0,6);
  const nav=(filter,label,symbol,count)=>`<button class="nav ${ui.page==='library'&&ui.filter===filter?'active':''}" data-action="nav" data-filter="${filter}" title="${label}">${icon(symbol)}<span>${label}</span><span class="count">${count}</span></button>`;
  return `<aside class="sidebar"><div class="brand"><div class="brandmark">${icon('layers')}</div><div><strong>Prompt Studio</strong><small>让灵感有迹可循</small></div></div><div class="nav-section">WORKSPACE / 工作空间</div>${nav('all','全部提示词','grid',active.length)}${nav('favorites','我的收藏','star',active.filter(g=>g.favorite).length)}${nav('drafts','编辑中的草稿','edit',active.filter(g=>g.draft).length)}<div class="nav-section">TAGS / 常用标签</div>${tags.map(t=>`<button class="nav tag-nav ${ui.tag===t?'active':''}" data-action="tag" data-tag="${esc(t)}"><i class="tag-dot"></i><span>${esc(t)}</span></button>`).join('')}<div class="sidebar-bottom">${nav('trash','回收站','trash',library.groups.filter(g=>g.deletedAt).length)}<button class="nav ${ui.page==='settings'?'active':''}" data-action="settings" title="设置与备份">${icon('settings')}<span>设置与备份</span></button><div class="app-credit"><span>v${APP_INFO.version}</span><span>${APP_INFO.attribution}</span><small>${APP_INFO.copyright}</small></div><div class="storage-note"><i class="status-dot"></i><button class="save-status icon-status" data-action="retry-save">本地已保存</button></div></div></aside>`;
}
function shell(content){
  app.innerHTML=`<div class="shell">${sidebar()}<header class="topbar"><div class="breadcrumb">我的工作空间 <span> / </span> <strong>${ui.page==='settings'?'设置与备份':ui.page==='compare'?'版本对比':ui.page==='detail'?'提示词组':'提示词资料库'}</strong></div><label class="searchbox">${icon('search')}<input id="search" aria-label="搜索提示词、名称或标签" placeholder="搜索提示词、名称或标签…" value="${esc(ui.query)}"><kbd>Ctrl K</kbd></label>${themeControl()}<span class="prototype" title="Windows 本地软件的浏览器交互原型">本地工作室 · v${APP_INFO.version}</span></header>${content}</div>`;
  updateStatus();
  hydrateMediaMetadata();
}
function render(){if(!library)return;shell(ui.page==='settings'?settingsPage():ui.page==='detail'?detailPage():ui.page==='compare'?comparePage():libraryPage());}
function libraryPage(){
  let filtered=searchGroups(library.groups,ui.query,ui.filter,ui.tag,ui.source,ui.mediaKind);
  filtered.sort(ui.sort==='name'?(a,b)=>a.name.localeCompare(b.name,'zh-CN'):(a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  const names={all:['灵感，在这里生长','把每一次尝试，变成下一次创作的起点。'],favorites:['值得再用一次','收藏那些让你想继续探索的灵感。'],drafts:['还在酝酿的灵感','每一次修改都已记录，随时回来继续。'],trash:['回收站','移入回收站的提示词组可以随时恢复。']};
  const [title,desc]=names[ui.filter];
  return `<main class="page"><div class="page-header"><div><div class="eyebrow">YOUR CREATIVE LIBRARY</div><h1>${title}</h1><p>${desc}</p></div><button class="btn primary" data-action="new-group">${icon('plus')}新建提示词组</button></div><div class="media-filter" role="group" aria-label="作品类型筛选">${[['','全部作品'],['image','图像'],['video','视频']].map(([kind,label])=>`<button class="media-filter-tab ${ui.mediaKind===kind?'active':''}" data-action="media-filter" data-kind="${kind}" aria-pressed="${ui.mediaKind===kind}">${kind?icon(kind==='video'?'video':'image'):icon('layers')}${label}</button>`).join('')}</div><div class="filters">${['','ComfyUI','网络收藏','Codex','Grok'].map(s=>`<button class="chip ${ui.source===s?'active':''}" data-action="source" data-source="${s}">${s||'全部来源'}</button>`).join('')}${ui.tag?`<button class="chip active" data-action="clear-tag">${esc(ui.tag)} ×</button>`:''}<span class="spacer"></span><select class="select" id="sort" aria-label="排序方式"><option value="recent" ${ui.sort==='recent'?'selected':''}>最近更新</option><option value="name" ${ui.sort==='name'?'selected':''}>名称排序</option></select><div class="actions"><button class="icon-btn ${ui.view==='grid'?'active':''}" data-action="view" data-view="grid" aria-label="网格视图">${icon('grid')}</button><button class="icon-btn ${ui.view==='list'?'active':''}" data-action="view" data-view="list" aria-label="列表视图">${icon('list')}</button></div></div><div class="result-count"><span>${filtered.length} 个提示词组${ui.query?` · 搜索“${esc(ui.query)}”`:''}</span><span class="demo-pill">${icon('shield')}仅保存在这台电脑</span></div>${filtered.length?`<div class="card-grid ${ui.view==='list'?'list-view':''}">${filtered.map(card).join('')}</div>`:`<div class="empty">${icon('folder')}<h2>${ui.query||ui.source||ui.tag||ui.mediaKind?'没有找到匹配内容':'这里还没有提示词组'}</h2><p>${ui.query||ui.source||ui.tag||ui.mediaKind?'试试其他关键词，或清除筛选。':'从一张图片，或一句提示词开始。'}</p><button class="btn" data-action="${ui.query||ui.source||ui.tag||ui.mediaKind?'clear-filters':'new-group'}">${ui.query||ui.source||ui.tag||ui.mediaKind?'清除筛选':'创建第一个提示词组'}</button></div>`}<div class="bottom-hint">每份作品背后的好想法，都值得被留下。 · 内置内容为演示素材</div></main>`;
}
function card(g){
  const v=preferred(g),items=g.versions.flatMap(v=>v.media),pic=v.media[0]||items[0];
  return `<article class="group-card" data-group-card="${g.id}"><div class="card-cover" data-action="open-group" data-id="${g.id}" role="button" tabindex="0" aria-label="打开 ${esc(g.name)}">${pic?mediaPreview(pic,{alt:g.name}):`<div class="blank-image">${icon('image')}<span>灵感先行，作品稍后</span></div>`}<div class="cover-top"><span class="source-badge">${esc(v.source)}</span><button class="icon-btn ${g.favorite?'active':''}" data-action="favorite" data-id="${g.id}" aria-label="${g.favorite?'取消收藏':'收藏'} ${esc(g.name)}">${icon('star')}</button></div><div class="cover-bottom"><span>${icon('layers')}${g.versions.length} 个版本</span><span>${icon(items.some(item=>item.kind==='video')?'video':'image')}${mediaSummary(items)}${g.draft?' · 有草稿':''}</span></div></div><div class="card-body"><button class="card-title" data-action="open-group" data-id="${g.id}">${esc(g.name)}</button><div class="card-tags">${g.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')||'<span class="tag">未分类</span>'}</div><div class="card-footer"><span>${fmt(g.updatedAt)} 更新 · 首选 V${v.number}</span>${g.deletedAt?`<button class="btn small" data-action="restore" data-id="${g.id}">${icon('restore')}恢复</button>`:`<div class="card-actions"><button class="btn small" data-action="copy-card" data-id="${g.id}">${icon('copy')}复制提示词</button><button class="btn small danger-quiet" data-action="trash-group" data-id="${g.id}" aria-label="删除组 ${esc(g.name)}">${icon('trash')}删除组</button></div>`}</div></div></article>`;
}
function detailPage(){
  const g=group();if(!g){ui.page='library';return libraryPage();}
  const v=current()||preferred(g),draft=ui.versionId==='draft';
  return `<main class="page detail-page"><button class="back" data-action="back-library">${icon('arrow')}返回资料库</button><div class="page-header detail-header"><div><h1>${esc(g.name)}</h1><p>${g.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')} <span> &nbsp; ${g.versions.length} 个版本 · ${fmt(g.updatedAt)} 更新</span></p></div><div class="actions"><button class="icon-btn ${g.favorite?'active':''}" data-action="favorite" data-id="${g.id}" aria-label="${g.favorite?'取消收藏':'收藏'}">${icon('star')}</button><button class="btn" data-action="edit-group">${icon('edit')}组信息</button>${!g.deletedAt?`<button class="btn danger-quiet" data-action="trash-group" data-id="${g.id}">${icon('trash')}删除组</button>`:''}<button class="btn" data-action="compare" ${g.versions.length<2?'disabled':''}>${icon('compare')}版本对比</button>${g.deletedAt?`<button class="btn primary" data-action="restore" data-id="${g.id}">恢复提示词组</button>`:`<button class="btn" data-action="save-files">${icon('download')}保存</button><button class="btn" data-action="clone-version" title="复制当前提示词和参数，不带入结果作品">${icon('copy')}复制为新版本</button><button class="btn primary" data-action="new-version">${icon('plus')}创建新版本</button>`}</div></div><div class="detail-grid"><aside class="version-rail"><div class="rail-label"><span>版本记录</span><span>${g.versions.length}</span></div>${g.draft?`<button class="version-item draft-item ${draft?'selected':''}" data-action="version" data-id="draft"><span class="version-num">DRAFT</span><span class="version-name">编辑中的草稿</span><span class="version-sub">基于 ${versionLabel(g.draft.parentId)}</span></button>`:''}${[...g.versions].reverse().map(item=>`<button class="version-item ${item.id===v.id?'selected':''}" data-action="version" data-id="${item.id}"><span class="version-num">VERSION ${String(item.number).padStart(2,'0')}</span>${g.preferredId===item.id?'<span class="star">★</span>':''}<span class="version-name">${esc(item.name)}</span><span class="version-sub">${esc(item.source)} · ${mediaSummary(item.media)}</span></button>`).join('')}<div class="rail-bottom">${icon('clock')} 保留每次探索的来路<br>★ 为你的首选版本</div></aside><section class="detail-content">${draft?`<div class="draft-notice">${icon('edit')}这份未完成的草稿已保留，可以继续编辑并保存为新版本；也可以切换到任意版本直接修改。</div>`:''}${imageStage(v)}<div class="prompt-panel"><div class="panel-heading"><h3>正向提示词 <span class="eyebrow">PROMPT</span></h3><div class="actions">${!draft?`<button class="btn small ghost" data-action="preferred" ${g.preferredId===v.id?'disabled':''}>${icon('star')}${g.preferredId===v.id?'首选版本':'设为首选'}</button>${!g.deletedAt?`<button class="btn small ghost" data-action="edit-version">${icon('edit')}版本信息</button>`:''}`:''}<button class="btn small" data-action="copy-prompt">${icon('copy')}复制提示词</button></div></div><div class="editor"><textarea class="prompt-area" id="prompt" data-version-field="prompt" aria-label="正向提示词" placeholder="写下你的提示词…" ${g.deletedAt?'readonly':''}>${esc(v.prompt)}</textarea><div class="editor-meta"><span>${draft?'草稿修改自动保存':`正在编辑 V${v.number} · 修改自动保存`}</span><span class="save-status">本地已保存</span><span id="prompt-count">${v.prompt.length} 字符</span></div></div><div class="panel-heading"><h3>负面提示词 <span class="eyebrow">NEGATIVE</span></h3><button class="btn small ghost" data-action="copy-negative">${icon('copy')}复制</button></div><div class="editor"><textarea class="prompt-area negative" data-version-field="negative" aria-label="负面提示词" placeholder="可选：排除不希望出现的内容" ${g.deletedAt?'readonly':''}>${esc(v.negative||'')}</textarea></div>${draft?draftFields(v):`<div class="detail-meta"><div><small>创作类型</small><span>${generationTypes[v.generationType]||'T2I · 图像'}</span></div><div><small>来源</small><span>${esc(v.source)}</span></div><div><small>模型</small><span>${esc(v.model||'未记录')}</span></div><div><small>Seed</small><span class="mono">${esc(v.seed||'未记录')}</span></div></div>${videoParameterSummary(v)}${v.sourceUrl?`<div class="note">${icon('note')}来源链接：${esc(v.sourceUrl)}</div>`:''}<div class="note">${icon('note')}<span>${esc(v.note||'尚未记录修改说明')}${v.parentId?` · 基于 ${versionLabel(v.parentId)}`:''}</span></div>`}</div></section></div></main>`;
}
function versionLabel(id){const v=group().versions.find(v=>v.id===id);return v?`V${v.number}`:'初始版本';}

function mediaDimensions(item){return `<span class="image-dimensions" data-media-meta="${esc(item.id)}">${esc(mediaInfo(item))}</span>`;}
function videoParameterSummary(v){return Object.entries(v.parameters||{}).filter(([,value])=>value!=='').map(([key,value])=>`<div class="note"><span>${esc({fps:'帧率',duration:'目标时长（秒）',camera:'镜头运动',motion:'主体运动'}[key]||key)}：${esc(value)}</span></div>`).join('');}
function findMedia(id){return [...library.groups.flatMap(g=>[...g.versions.flatMap(v=>v.media),...(g.draft?.media||[])]),...modalMedia].find(item=>item.id===id);}
async function hydrateMediaMetadata(){
  const nodes=[...document.querySelectorAll('[data-media-meta]')];let changed=false;
  await Promise.all(nodes.map(async node=>{
    const item=findMedia(node.dataset.mediaMeta);if(!item)return;
    if(mediaKind(item)==='image'&&(!item.width||!item.height)){try{const image=await loadImage(item.src);item.width=image.naturalWidth;item.height=image.naturalHeight;changed=true;}catch{if(node.isConnected)node.textContent='无法读取尺寸';return;}}
    if(node.isConnected)node.textContent=mediaInfo(item);
  }));
  if(changed)persist();
}
async function pasteImages(context){
  const location={groupId:ui.groupId,versionId:ui.versionId};
  const hint='请先在网页中选择“复制图片”，然后在这里按 Ctrl+V 粘贴。';
  if(!navigator.clipboard?.read){toast(hint);return;}
  try{
    const items=await navigator.clipboard.read(),files=[];
    for(const item of items){const type=item.types.find(type=>['image/png','image/jpeg','image/webp','image/gif'].includes(type));if(!type)continue;const blob=await item.getType(type);files.push(new File([blob],`粘贴图片-${Date.now()}.${type.split('/')[1]}`,{type}));}
    if(!files.length){toast(hint);return;}
    if(context!=='modal'&&(ui.groupId!==location.groupId||ui.versionId!==location.versionId)){toast('页面已切换，请在需要添加图片的版本中重新粘贴');return;}
    await importMediaFiles(files,context);
  }catch{toast('暂时无法读取剪贴板，请在这里按 Ctrl+V 粘贴图片。');}
}
async function cropImage(imageId){
  const owner=group(),target=current();if(!owner||owner.deletedAt)return;
  const pic=target?.media.find(p=>p.id===imageId);if(!pic||mediaKind(pic)!=='image')return;
  await openCropEditor(pic,{openModal,onSave:async result=>{
    if(owner.deletedAt||!(owner.versions.includes(target)||owner.draft===target))throw new Error('图片所在版本已变更，请重新打开');
    if(target.media.length>=30)throw new Error('每个版本最多保留 30 份作品，请先移除不需要的内容');
    const saved=await importOneMedia(dataUrlFile(result.src,result.name));target.media.push(saved);owner.updatedAt=new Date().toISOString();ui.mediaIndex=target.media.length-1;persist();render();toast('已添加裁切图片，原图已保留');
  }});
}
function thumbnail(item,index,draft=false){
  const label=mediaKind(item)==='video'?'视频':'图片';
  return `<div class="thumb-wrap"><button class="thumb ${index===ui.mediaIndex?'active':''}" data-action="thumbnail" data-index="${index}" aria-label="查看第 ${index+1} 份作品：${label}">${mediaPreview(item,{alt:''})}</button>${!group().deletedAt?`<button class="thumb-remove" data-action="delete-media" data-media-id="${esc(item.id)}" aria-label="删除第 ${index+1} 份作品" title="删除这份作品">${icon('close')}</button>`:''}</div>`;
}
function imageStage(v){
  ui.mediaIndex=Math.min(ui.mediaIndex,Math.max(0,v.media.length-1));const item=v.media[ui.mediaIndex],editable=!group().deletedAt,video=mediaKind(item)==='video';
  const version=ui.versionId==='draft'?'草稿':`V${v.number}`;
  return `<div class="image-stage ${video?'video-stage':''}">${item?`${mediaPreview(item,{alt:`${v.name||'草稿'}，第 ${ui.mediaIndex+1} 份作品`,mode:'stage'})}<span class="image-label">${version} · ${esc(v.name||'编辑中的草稿')}${item.src.startsWith('/assets/')?' · 演示插画':''}</span><span class="image-count">${ui.mediaIndex+1} / ${v.media.length}</span>${v.media.length>1?`<div class="image-nav"><button class="icon-btn" data-action="prev-image" aria-label="上一份作品">${icon('arrow')}</button><button class="icon-btn" data-action="next-image" aria-label="下一份作品">${icon('chevron')}</button></div>`:''}`:`<div class="blank-image">${icon(v.generationType==='t2i'?'image':'video')}<span>这个版本还没有作品</span><small>添加图片或视频，记录这次尝试的结果</small></div>`}</div><div class="media-toolbar"><div class="actions">${item?`${editable?video?`<button class="btn small" data-action="capture-frame">${icon('image')}截取当前帧</button>`:`<button class="btn small" data-action="crop-image" data-image-id="${esc(item.id)}">${icon('crop')}裁切图片</button>`:''}<button class="btn small" data-action="lightbox">${icon('expand')}${video?'放大播放':'查看大图'}</button>${editable?`<button class="btn small danger-quiet" data-action="delete-media" data-media-id="${esc(item.id)}">${icon('trash')}删除${video?'视频':'图片'}</button>`:''}`:''}</div>${editable?`<button class="btn small" data-action="attach-images">${icon('plus')}添加图片 / 视频</button>`:''}</div><div class="image-info-bar">${item?mediaDimensions(item):'<span class="muted">图片支持 Ctrl+V；视频支持拖入或文件选择</span>'}${editable?`<button class="btn small" data-action="paste-images" data-context="${ui.versionId==='draft'?'draft':'version'}">${icon('clipboard')}粘贴图片 <kbd>Ctrl+V</kbd></button>`:''}</div>${v.media.length?`<div class="thumbnails">${v.media.map((item,index)=>thumbnail(item,index)).join('')}</div>`:''}`;
}
function generationOptions(selected){return Object.entries(generationTypes).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}</option>`).join('');}
function options(selected){return sources.map(s=>`<option ${s===selected?'selected':''}>${s}</option>`).join('');}
function draftFields(v){return `<div class="draft-form"><div class="field"><label for="version-name">版本名称</label><input id="version-name" data-version-field="name" maxlength="200" value="${esc(v.name)}" placeholder="例如：调整光线与背景"></div><div class="field"><label for="version-source">来源</label><select id="version-source" data-version-field="source">${options(v.source)}</select></div><div class="field"><label for="version-model">模型（可选）</label><input id="version-model" data-version-field="model" value="${esc(v.model)}" placeholder="例如：FLUX"></div><div class="field"><label for="version-seed">Seed（可选）</label><input id="version-seed" data-version-field="seed" value="${esc(v.seed)}" placeholder="未记录"></div><div class="field full"><label for="version-note">这次为什么改？</label><textarea id="version-note" data-version-field="note" placeholder="记录调整的目的，或生成后的观察…">${esc(v.note)}</textarea></div></div><div class="savebar"><small>基于 ${versionLabel(v.parentId)} · <span class="save-status">本地已保存</span></small><div class="actions"><button class="btn ghost" data-action="discard-draft">放弃草稿</button><button class="btn primary" data-action="commit">${icon('check')}保存为新版本</button></div></div>`;}
function comparePage(){
  const g=group(),a=g.versions.find(v=>v.id===ui.compareA)||g.versions[0],b=g.versions.find(v=>v.id===ui.compareB)||latest(g),diff=diffTokens(a.prompt,b.prompt);
  const choose=(id,selected)=>`<select class="select" id="${id}" aria-label="${id==='compare-a'?'左侧版本':'右侧版本'}">${g.versions.map(v=>`<option value="${v.id}" ${v.id===selected?'selected':''}>V${v.number} · ${esc(v.name)}</option>`).join('')}</select>`;
  const panel=(v,side)=>`<section class="compare-panel"><div class="compare-head"><span>V${v.number} · ${esc(v.name)}</span><span class="tag">${esc(v.source)}</span></div>${v.media[0]?mediaPreview(v.media[0],{alt:`${v.name}的作品`,mode:'compare',className:'compare-img'}):`<div class="compare-img blank-image">${icon('image')}暂无作品</div>`}<div class="compare-text">${diff.filter(d=>side==='left'?d.type!=='added':d.type!=='removed').map(d=>`<span class="${d.type==='same'?'':`diff-${d.type}`}">${esc(d.text)}</span>`).join('')}</div><div class="compare-note"><strong>负面提示词</strong><br>${esc(v.negative||'未记录')}</div><div class="compare-note">${esc(v.note||'未记录修改说明')}<br>模型：${esc(v.model||'未记录')} · Seed：${esc(v.seed||'未记录')}</div></section>`;
  return `<main class="page"><button class="back" data-action="back-detail">${icon('arrow')}返回提示词组</button><div class="page-header"><div><div class="eyebrow">SIDE BY SIDE</div><h1>每一点变化，都看得见</h1><p>${esc(g.name)} · 作品与提示词并排比较</p></div><button class="btn" data-action="swap-compare">${icon('compare')}交换左右</button></div><div class="compare-controls">${choose('compare-a',a.id)}<span class="muted">对比</span>${choose('compare-b',b.id)}</div>${a.id===b.id?'<div class="compare-same">当前选择了同一个版本，可以切换任意一侧查看差异。</div>':''}<div class="compare-grid">${panel(a,'left')}${panel(b,'right')}</div><div class="diff-legend"><span class="diff-removed">移除的内容</span><span class="diff-added">新增的内容</span><span>比较各版本的第一份作品；视频可分别播放和拖动进度</span></div></main>`;
}
function settingsPage(){return `<main class="page"><div class="page-header"><div><div class="eyebrow">MAKE IT YOURS</div><h1>设置与备份</h1><p>你的作品与灵感，留在自己的电脑上。</p></div></div><section class="settings-panel"><div class="settings-row"><div><h3>外观</h3><p>选择浅色或深色主题，这台电脑会记住你的选择。</p></div>${themeControl()}</div></section><section class="settings-panel"><h3>默认保存文件夹</h3><p>“保存”会将当前图片或视频与提示词导出为同名文件，提示词保存在 TXT 文本中。</p><form id="export-settings-form"><div class="field"><label for="default-export-folder">文件夹完整路径</label><input id="default-export-folder" name="folder" value="${esc(exportSettings.defaultFolder)}" placeholder="${esc(exportSettings.suggestedFolder||'例如 E:\\我的图片')}" required></div><div class="settings-form-actions"><button class="btn" type="submit">设为默认文件夹</button></div></form></section><section class="settings-panel"><h3>本地资料</h3><p>图片、视频原文件、提示词和版本都保存在本机。新导入作品作为独立副本保存，原文件移动后仍可使用。</p><div class="settings-path">${esc(dataDirectory||'本机资料目录')}（资料与 media 作品文件夹）</div></section><section class="settings-panel"><div class="settings-row"><div><h3>完整文件夹备份</h3><p>包含所有提示词组、图片、视频原文件、版本、草稿和回收站内容。</p></div><button class="btn primary" data-action="export">${icon('download')}创建完整备份</button></div></section><section class="settings-panel"><div class="settings-row"><div><h3>从备份导入</h3><p>合并到现有资料库。相同提示词组会作为副本导入。</p></div><button class="btn" data-action="restore-backup">${icon('restore')}恢复文件夹备份</button><button class="btn" data-action="import-backup">${icon('upload')}导入旧 JSON 备份</button></div></section><section class="settings-panel"><h3>关于这份原型</h3><p><strong>Prompt Studio · v${APP_INFO.version}</strong><br><span class="about-attribution">${APP_INFO.attribution}</span><br>${APP_INFO.copyright}<br><br>Windows 本地作品与提示词管理工具，通过本机浏览器运行。内置图片是离线演示插画，提示词与参数是演示内容。<br>已支持 T2I / T2V / I2V 作品管理、视频播放与截图、提示词编辑、版本管理和完整备份；生成参数手动填写。已提供 Windows 便携运行包；ComfyUI 工作流自动读取和 Windows 安装程序将在后续实现。<br>新图片每张最多 32 MB，视频每段最多 512 MB；新作品单独存储，不计入 40 MB 的文字与旧图资料上限。所有功能均无需生成接口。</p></section></main>`;}
function openGroup(id){ui.groupId=id;const g=group();ui.versionId=ui.filter==='drafts'&&g.draft?'draft':preferred(g).id;ui.page='detail';ui.mediaIndex=0;render();window.scrollTo(0,0);}
function openModal(title,content,wide=false){if(modal.contains(transfer))document.body.append(transfer);if(modal.open)modal.close();modal.className=wide?'lightbox':'';modal.innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-content">${content}</div>`;modal.showModal();hydrateMediaMetadata();}
function newGroupModal(){modalMedia=[];openModal('收下一份新灵感',`<p>一张图片、一段视频、一句提示词，都可以是开始。</p><form id="new-group-form"><div class="modal-form"><div class="field full"><label for="group-name">提示词组名称 *</label><input id="group-name" name="name" maxlength="200" required placeholder="给这份灵感起个名字" autofocus></div><div class="field full"><div class="image-info-bar"><span class="muted">添加图片或视频</span><button type="button" class="btn small" data-action="paste-images" data-context="modal">${icon('clipboard')}粘贴图片 <kbd>Ctrl+V</kbd></button></div><div class="dropzone" data-action="modal-upload" data-drop="modal" tabindex="0" role="button">${icon('upload')}<strong>拖入图片 / 视频，或点击选择</strong><small>图片最多 32 MB · MP4 / WebM 视频最多 512 MB</small></div><div id="modal-thumbs" class="modal-thumbs"></div></div><div class="field full"><label for="group-prompt">提示词</label><textarea id="group-prompt" name="prompt" placeholder="把触动你的那句提示词粘贴到这里…"></textarea></div><div class="field"><label for="group-type">创作类型</label><select id="group-type" name="generationType">${generationOptions('t2i')}</select></div><div class="field"><label for="group-source">来源</label><select id="group-source" name="source">${options('网络收藏')}</select></div><div class="field"><label for="group-tags">标签</label><input id="group-tags" name="tags" placeholder="用逗号分隔，如：产品摄影，光影"></div><div class="field full"><label for="group-url">来源链接（可选）</label><input id="group-url" name="sourceUrl" placeholder="粘贴原始网页或对话链接"></div></div><div class="error-text" id="form-error" role="alert"></div><div class="modal-actions"><button class="btn ghost" type="button" data-action="close-modal">取消</button><button class="btn primary" type="submit">${icon('plus')}创建提示词组</button></div></form>`);}
function editGroupModal(){const g=group();openModal('编辑提示词组',`<form id="edit-group-form"><div class="modal-form"><div class="field full"><label for="rename">名称</label><input id="rename" name="name" value="${esc(g.name)}" required maxlength="200"></div><div class="field full"><label for="retag">标签</label><input id="retag" name="tags" value="${esc(g.tags.join('，'))}"></div></div><div class="modal-actions"><button class="btn danger" type="button" data-action="trash-group">${icon('trash')}移入回收站</button><button class="btn primary" type="submit">保存修改</button></div></form>`);}
function lightbox(item){if(!item)return;openModal(esc(item.name),`${mediaPreview(item,{alt:item.name,mode:'full'})}<div class="image-info-bar">${mediaDimensions(item)}</div>${!group().deletedAt?`<div class="modal-actions">${mediaKind(item)==='image'?`<button class="btn" data-action="crop-image" data-image-id="${esc(item.id)}">${icon('crop')}裁切图片</button>`:''}<button class="btn danger-quiet" data-action="delete-media" data-media-id="${esc(item.id)}">${icon('trash')}删除${mediaKind(item)==='video'?'视频':'图片'}</button></div>`:''}`,true);}
function requestMediaDeletion(mediaId){
  const g=group(),v=current(),item=v?.media.find(item=>item.id===mediaId);if(!item||g.deletedAt)return;
  pendingDeletion={kind:'media',groupId:g.id,versionId:ui.versionId,mediaId};
  openModal(`删除这${mediaKind(item)==='video'?'段视频':'张图片'}？`,`<div class="delete-preview"><div class="delete-media-preview">${mediaPreview(item,{alt:'待删除作品'})}</div><span>${esc(item.name)}<br>${mediaDimensions(item)}</span></div><p>仅从${ui.versionId==='draft'?'当前草稿':` V${v.number} `}中移除这份作品，提示词和其他版本保留。需要恢复时可使用完整备份。</p><div class="modal-actions"><button class="btn ghost" data-action="close-modal" autofocus>取消</button><button class="btn danger" data-action="confirm-delete-media">${icon('trash')}确认删除作品</button></div>`);
}
function requestGroupDeletion(id){
  const g=library.groups.find(g=>g.id===id);if(!g||g.deletedAt)return;
  pendingDeletion={kind:'group',groupId:g.id};
  const count=g.versions.reduce((sum,v)=>sum+v.media.length,0)+(g.draft?.media.length||0);
  openModal('将这个组移入回收站？',`<div class="delete-group-summary"><strong>${esc(g.name)}</strong><small>${g.versions.length} 个版本 · ${count} 份作品${g.draft?' · 包含草稿':''}</small></div><p>整个提示词组会移入回收站，包括图片、视频、提示词和版本记录。之后可以随时恢复。</p><div class="modal-actions"><button class="btn ghost" data-action="close-modal" autofocus>取消</button><button class="btn danger" data-action="confirm-trash-group">${icon('trash')}移入回收站</button></div>`);
}
function renderModalImages(){
  const container=document.querySelector('#modal-thumbs');if(!container)return;
  container.innerHTML=modalMedia.map((item,index)=>`<div class="import-image-tile"><div class="thumb-wrap">${mediaPreview(item,{alt:item.name})}<button type="button" class="thumb-remove" data-action="remove-modal-image" data-index="${index}" aria-label="移除待导入第 ${index+1} 份作品">${icon('close')}</button></div>${mediaDimensions(item)}</div>`).join('')+(modalMedia.length?`<span class="counter">${mediaSummary(modalMedia)}</span>`:'');
}
async function copy(text){if(!text){toast('还没有可复制的提示词');return;}try{await navigator.clipboard.writeText(text);toast('提示词已复制');}catch{openModal('复制提示词',`<p>浏览器未允许自动复制。已为你选中文本，按 Ctrl+C 即可。</p><textarea class="prompt-area" id="copy-fallback" readonly>${esc(text)}</textarea>`);document.querySelector('#copy-fallback').select();}}
async function newVersion(){
  const g=group();if(g.deletedAt)return;
  const parentId=ui.versionId==='draft'?g.draft.parentId:(current()||preferred(g)).id;
  const v=createVersion(g,parentId);ui.versionId=v.id;ui.mediaIndex=0;persist();render();
  document.querySelector('#prompt')?.focus();
  await flush();toast(`V${v.number} 已创建，直接填写提示词即可`);
}
function updateEditor(target){
  const g=group();if(g.deletedAt)return;
  const field=target.dataset.versionField,value=target.value;
  updateVersionField(g,ui.versionId,field,value);persist();
  if(field==='prompt')document.querySelector('#prompt-count').textContent=`${value.length} 字符`;
}
function editVersionModal(){
  const v=current();if(group().deletedAt||ui.versionId==='draft')return;
  openModal('修改版本信息',`<form id="edit-version-form"><div class="modal-form"><div class="field full"><label for="edit-version-name">版本名称</label><input id="edit-version-name" name="name" maxlength="200" value="${esc(v.name)}" required></div><div class="field"><label for="edit-version-type">创作类型</label><select id="edit-version-type" name="generationType">${generationOptions(v.generationType)}</select></div><div class="field"><label for="edit-version-source">来源</label><select id="edit-version-source" name="source">${options(v.source)}</select></div><div class="field"><label for="edit-version-model">模型（可选）</label><input id="edit-version-model" name="model" value="${esc(v.model)}"></div><div class="field"><label for="edit-version-seed">Seed（可选）</label><input id="edit-version-seed" name="seed" value="${esc(v.seed)}"></div><div class="field full"><label for="edit-version-note">修改说明（可选）</label><textarea id="edit-version-note" name="note">${esc(v.note)}</textarea></div></div><details class="video-parameters"><summary>视频参数（可选）</summary><div class="modal-form">${[['fps','帧率 FPS'],['duration','目标时长（秒）'],['camera','镜头运动'],['motion','主体运动']].map(([key,label])=>`<div class="field"><label for="parameter-${key}">${label}</label><input id="parameter-${key}" name="${key}" maxlength="1000" value="${esc(v.parameters?.[key]||'')}"></div>`).join('')}</div></details><div class="modal-actions"><button class="btn ghost" type="button" data-action="close-modal">取消</button><button class="btn primary" type="submit">保存信息</button></div></form>`);
}
async function selectFiles(context){const input=document.createElement('input');input.type='file';input.accept=MEDIA_ACCEPT;input.multiple=true;input.addEventListener('change',()=>importMediaFiles(input.files,context));input.click();}
function transferProgress(message){const host=modal.open?modal.querySelector('.modal-content'):document.body;if(transfer.parentElement!==host)host.append(transfer);transfer.hidden=false;transfer.querySelector('span').textContent=message;}
async function importMediaFiles(files,context){
  if(activeTransfer){toast('正在导入作品，请完成后再添加');return;}
  const owner=group(),version=current(),destination=context==='draft'?owner?.draft:version,form=document.querySelector('#new-group-form');
  if(context!=='modal'&&(!owner||owner.deletedAt||!destination))return;
  const controller=new AbortController();activeTransfer=controller;let added=0;const failures=[];
  try{
    for(const file of Array.from(files).slice(0,30)){
      if(controller.signal.aborted)break;
      if(context==='modal'&&(!form?.isConnected||form!==document.querySelector('#new-group-form')))break;
      if(context!=='modal'&&(owner.deletedAt||!(owner.versions.includes(destination)||owner.draft===destination)))break;
      const items=context==='modal'?modalMedia:destination.media;
      if(items.length>=30){failures.push('每个版本最多保留 30 份作品');break;}
      transferProgress(`读取 ${file.name} 的信息…`);
      try{
        const item=await importOneMedia(file,{signal:controller.signal,onProgress:percent=>transferProgress(`正在导入 ${file.name} · ${percent}%`)});
        if(context==='modal'&&!form.isConnected)break;
        if(context!=='modal'&&(owner.deletedAt||!(owner.versions.includes(destination)||owner.draft===destination)))break;
        items.push(item);added++;
        if(context==='modal'){if(item.kind==='video'&&form.elements.generationType.value==='t2i')form.elements.generationType.value='t2v';renderModalImages();}
        else{if(item.kind==='video'&&destination.generationType==='t2i')destination.generationType='t2v';owner.updatedAt=new Date().toISOString();if(group()===owner&&current()===destination)ui.mediaIndex=items.length-1;persist();}
      }catch(error){if(error.name==='AbortError')break;failures.push(`${file.name}：${error.message}`);}
    }
  }finally{activeTransfer=null;transfer.hidden=true;}
  if(context!=='modal'&&added){render();await flush().catch(()=>{});}
  toast([added?`已添加 ${added} 份作品`:'',controller.signal.aborted?'已取消剩余导入':'',...failures.slice(0,2)].filter(Boolean).join('；')||'没有添加作品');
}
async function captureCurrentFrame(){
  const item=current()?.media[ui.mediaIndex],video=document.querySelector('.image-stage video');if(!item||item.kind!=='video')return;
  const file=await captureFrame(video,item.name);await importMediaFiles([file],ui.versionId==='draft'?'draft':'version');
}

const parseTags=value=>[...new Set(value.split(/[,，]/).map(s=>s.trim()).filter(Boolean))].slice(0,30).map(s=>s.slice(0,100));
async function exportBackup(){await backupDialog({openModal,flush,getRevision:()=>revision});}
async function restoreBackup(){await backupDialog({restore:true,openModal,flush,getRevision:()=>revision,onRestored:result=>{library=result.library;revision=result.revision;ui.page='library';ui.filter='all';render();}});}
function importBackup(){const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{const file=input.files[0];if(!file)return;try{if(file.size>40*1024*1024)throw new Error('JSON 备份过大，请使用文件夹备份');const parsed=JSON.parse(await file.text());if(parsed.format!=='prompt-studio-backup')throw new Error('请选择 Prompt Studio 导出的备份');upgradeLibrary(parsed.library);await flush();const response=await fetch('/api/import-json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:revision,library:parsed.library})});const result=await response.json();if(!response.ok)throw new Error(result.error);library=result.library;revision=result.revision;ui.page='library';render();toast(`已导入 ${result.imported} 个提示词组`);}catch(error){toast(error.message);}};input.click();}

async function action(name,el){
  if(name==='theme')setTheme(el.dataset.theme);
  else if(name==='save-files'){const v=current();await saveFilesDialog({owner:group(),version:v,versionId:ui.versionId,picture:v.media[ui.mediaIndex]||v.media[0],openModal,flush});}
  else if(name==='cancel-transfer')activeTransfer?.abort();
  else if(name==='media-filter'){ui.mediaKind=el.dataset.kind;render();}
  else if(name==='capture-frame')await captureCurrentFrame();
  else if(name==='clone-version'){const g=group(),v=cloneVersion(g,ui.versionId);ui.versionId=v.id;ui.mediaIndex=0;persist();render();await flush();toast(`已复制提示词与参数到 V${v.number}，请添加新的结果作品`);}
  else if(name==='nav'){ui.page='library';ui.filter=el.dataset.filter;ui.tag='';ui.query='';ui.source='';ui.mediaKind='';render();}
  else if(name==='tag'){ui.page='library';ui.filter='all';ui.tag=el.dataset.tag;render();}
  else if(name==='clear-tag'){ui.tag='';render();}
  else if(name==='source'){ui.source=el.dataset.source;render();}
  else if(name==='clear-filters'){ui.tag='';ui.source='';ui.query='';ui.mediaKind='';render();}
  else if(name==='view'){ui.view=el.dataset.view;render();}
  else if(name==='settings'){ui.page='settings';render();}
  else if(name==='open-group')openGroup(el.dataset.id);
  else if(name==='new-group')newGroupModal();
  else if(name==='edit-group')editGroupModal();
  else if(name==='favorite'){const g=library.groups.find(g=>g.id===el.dataset.id);g.favorite=!g.favorite;persist();render();}
  else if(name==='copy-card')await copy(preferred(library.groups.find(g=>g.id===el.dataset.id)).prompt);
  else if(name==='copy-prompt')await copy(current().prompt);
  else if(name==='copy-negative')await copy(current().negative);
  else if(name==='preferred'){group().preferredId=current().id;persist();render();toast('已设为首选版本');}
  else if(name==='back-library'){ui.page='library';render();}
  else if(name==='version'){ui.versionId=el.dataset.id;ui.mediaIndex=0;render();}
  else if(name==='thumbnail'){ui.mediaIndex=Number(el.dataset.index);render();}
  else if(name==='prev-image'||name==='next-image'){ui.mediaIndex=(ui.mediaIndex+(name==='next-image'?1:-1)+current().media.length)%current().media.length;render();}
  else if(name==='lightbox')lightbox(current().media[ui.mediaIndex]);
  else if(name==='draft-lightbox')lightbox(current().media[Number(el.dataset.index)]);
  else if(name==='paste-images')await pasteImages(el.dataset.context);
  else if(name==='crop-image')await cropImage(el.dataset.imageId);
  else if(name==='delete-media')requestMediaDeletion(el.dataset.mediaId);
  else if(name==='confirm-delete-media'){
    if(pendingDeletion?.kind!=='media')return;
    const target=pendingDeletion;pendingDeletion=null;
    const g=library.groups.find(g=>g.id===target.groupId);
    removeMedia(g,target.versionId,target.mediaId);
    modal.close();persist();render();await flush();toast('作品已移除，提示词已保留');
  }
  else if(name==='remove-modal-image'){modalMedia.splice(Number(el.dataset.index),1);renderModalImages();}
  else if(name==='new-version')await newVersion();
  else if(name==='edit-version')editVersionModal();
  else if(name==='draft-upload')await selectFiles('draft');
  else if(name==='attach-images')await selectFiles(ui.versionId==='draft'?'draft':'version');
  else if(name==='modal-upload')await selectFiles('modal');
  else if(name==='commit'){
    try{const g=group();const v=commitDraft(g,g.draft);ui.versionId=v.id;persist();render();await flush();toast(`V${v.number} 已保存${v.media.length?'':'，可以稍后补充图片'}`);}catch(error){toast(error.message);}
  }
  else if(name==='discard-draft')openModal('放弃这份草稿？','<p>草稿中的文字修改和新图片将被移除，已保存的历史版本会保留。</p><div class="modal-actions"><button class="btn ghost" data-action="close-modal">继续编辑</button><button class="btn danger" data-action="confirm-discard">放弃草稿</button></div>');
  else if(name==='confirm-discard'){delete group().draft;ui.versionId=preferred(group()).id;persist();modal.close();render();}
  else if(name==='compare'){const g=group();ui.compareA=g.versions.at(-2).id;ui.compareB=latest(g).id;ui.page='compare';render();window.scrollTo(0,0);}
  else if(name==='swap-compare'){[ui.compareA,ui.compareB]=[ui.compareB,ui.compareA];render();}
  else if(name==='back-detail'){ui.page='detail';render();}
  else if(name==='close-modal')modal.close();
  else if(name==='trash-group')requestGroupDeletion(el.dataset.id||ui.groupId);
  else if(name==='confirm-trash-group'){
    if(pendingDeletion?.kind!=='group')return;
    const g=library.groups.find(g=>g.id===pendingDeletion.groupId);pendingDeletion=null;
    if(!g||g.deletedAt)return;
    g.deletedAt=new Date().toISOString();persist();modal.close();ui.page='library';render();await flush();toast('已移入回收站，可以随时恢复');
  }
  else if(name==='restore'){const g=library.groups.find(g=>g.id===el.dataset.id);delete g.deletedAt;persist();render();toast('提示词组已恢复');}
  else if(name==='export')await exportBackup();
  else if(name==='import-backup')importBackup();
  else if(name==='restore-backup')await restoreBackup();
  else if(name==='retry-save'&&status==='error')await flush();
}
document.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el&&!el.disabled){event.stopPropagation();action(el.dataset.action,el).catch(error=>toast(error.message));}});
function handleInput(event){
  if(event.isComposing)return;
  const target=event.target;
  if(target.id==='search'){const pos=target.selectionStart;ui.query=target.value;ui.page='library';render();const input=document.querySelector('#search');input.focus();input.setSelectionRange(pos,pos);}
  else if(target.dataset.versionField)updateEditor(target);
}
document.addEventListener('input',handleInput);
document.addEventListener('compositionend',handleInput);
document.addEventListener('change',event=>{const target=event.target;if(target.id==='sort'){ui.sort=target.value;render();}else if(target.id==='compare-a'||target.id==='compare-b'){ui[target.id==='compare-a'?'compareA':'compareB']=target.value;render();}});
document.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,data=new FormData(form);
  if(form.id==='new-group-form'){
    if(activeTransfer){document.querySelector('#form-error').textContent='请等待作品导入完成，或先取消导入';return;}
    const name=data.get('name').trim(),prompt=data.get('prompt').trim();
    if(!name||(!prompt&&!modalMedia.length)){document.querySelector('#form-error').textContent='请填写名称，并至少添加提示词或一份作品。';return;}
    const now=new Date().toISOString(),v={id:uid(),number:1,name:'初始版本',prompt,negative:'',source:data.get('source'),sourceUrl:data.get('sourceUrl').trim(),model:'',seed:'',note:'',media:clone(modalMedia),generationType:data.get('generationType'),parameters:{},createdAt:now};
    const g={id:uid(),name,tags:parseTags(data.get('tags')),favorite:false,preferredId:v.id,updatedAt:now,versions:[v]};
    library.groups.unshift(g);persist();modal.close();openGroup(g.id);try{await flush();toast('提示词组已创建');}catch{}
  }else if(form.id==='export-settings-form'){
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{await setDefaultFolder(data.get('folder'));toast('默认保存文件夹已更新');}catch(error){toast(error.message);}finally{button.disabled=false;}
  }else if(form.id==='edit-version-form'){
    for(const field of ['name','source','model','seed','note','generationType'])updateVersionField(group(),ui.versionId,field,data.get(field).trim());
    current().parameters={...current().parameters,...Object.fromEntries(['fps','duration','camera','motion'].map(key=>[key,data.get(key).trim()]))};
    persist();modal.close();render();try{await flush();toast('版本信息已保存');}catch{}
  }else if(form.id==='edit-group-form'){
    const name=data.get('name').trim();if(!name)return;group().name=name;group().tags=parseTags(data.get('tags'));group().updatedAt=new Date().toISOString();persist();modal.close();render();
  }
});
document.addEventListener('keydown',event=>{
  if(modal.open)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();document.querySelector('#search')?.focus();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(ui.versionId==='draft'&&ui.page==='detail')action('commit',{});else{persist();flush().catch(()=>{});}}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[role="button"][data-action]')){event.preventDefault();action(event.target.dataset.action,event.target);}
});
document.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.target.closest('[data-drop]')?.classList.add('dragover');}});
document.addEventListener('dragleave',event=>event.target.closest('[data-drop]')?.classList.remove('dragover'));
document.addEventListener('drop',event=>{if(!event.dataTransfer.files.length)return;event.preventDefault();const zone=event.target.closest('[data-drop]');if(zone){zone.classList.remove('dragover');importMediaFiles(event.dataTransfer.files,zone.dataset.drop);}else if(ui.page==='detail'&&!modal.open&&!group().deletedAt){importMediaFiles(event.dataTransfer.files,ui.versionId==='draft'?'draft':'version');}else if(ui.page==='library'&&!modal.open){newGroupModal();importMediaFiles(event.dataTransfer.files,'modal');}});
document.addEventListener('paste',event=>{const files=[...event.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(!files.length)return;event.preventDefault();if(modal.open&&document.querySelector('#new-group-form'))importMediaFiles(files,'modal');else if(ui.page==='detail'&&!modal.open&&!group().deletedAt)importMediaFiles(files,ui.versionId==='draft'?'draft':'version');else if(!modal.open){newGroupModal();importMediaFiles(files,'modal');}});
window.addEventListener('beforeunload',event=>{if(pending||savePromise||activeTransfer){event.preventDefault();event.returnValue='';}});
app.innerHTML='<div class="skeleton">正在打开你的灵感资料库…</div>';
try{const response=await fetch('/api/library');if(!response.ok)throw new Error('本地服务暂时不可用');const result=await response.json();library=validateLibrary(result.library);revision=result.revision;try{await loadExportSettings();}catch{}try{const infoResponse=await fetch('/api/app-info');if(infoResponse.ok)dataDirectory=(await infoResponse.json()).dataDir||'';}catch{}render();}catch(error){app.innerHTML=`<main class="load-error"><h1>暂时无法打开资料库</h1><p>${esc(error.message)}</p><p>请确认本地服务已启动，然后刷新页面。</p></main>`;}

document.addEventListener('loadedmetadata',event=>{
  const video=event.target;if(!video.matches('video[data-media-id]'))return;const item=findMedia(video.dataset.mediaId);if(!item)return;
  let changed=false;for(const [key,value] of Object.entries({width:video.videoWidth,height:video.videoHeight,duration:video.duration}))if(Number.isFinite(value)&&value>0&&item[key]!==value){item[key]=value;changed=true;}
  if(changed){persist();document.querySelectorAll('[data-media-meta]').forEach(node=>{if(node.dataset.mediaMeta===item.id)node.textContent=mediaInfo(item);});}
},true);
document.addEventListener('error',event=>{if(event.target.matches?.('video[data-media-id]')){const note=event.target.nextElementSibling;if(note?.classList.contains('video-error'))note.hidden=false;}},true);
modal.addEventListener('close',()=>{if(modal.open)return;modal.querySelectorAll('video').forEach(video=>video.pause());if(modal.contains(transfer)){activeTransfer?.abort();document.body.append(transfer);}});
