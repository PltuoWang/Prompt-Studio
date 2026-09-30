import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,mkdtemp,readFile,rename,rm,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';
import {clone,validateLibrary} from './public/model.js';
import {allMedia,mediaFilename,validateMediaFiles} from './media-store.mjs';
import {exportFolder} from './export-files.mjs';
import {prepareRestore} from './backups.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sharedLibrary(library,{groupId,includeDrafts=false}={}){
  const result=clone(library);result.groups=result.groups.filter(g=>!g.deletedAt&&(!groupId||g.id===groupId));
  if(!result.groups.length)throw Error('没有可分享的提示词组');
  for(const group of result.groups){delete group.deletedAt;if(!includeDrafts)delete group.draft;}
  return validateLibrary(result);
}
function previewPage(library){
  const media=item=>{const src=item.src.startsWith('/')?item.src.slice(1):item.src;return item.kind==='video'?`<video controls preload="metadata" src="${esc(src)}"></video>`:`<img loading="lazy" alt="${esc(item.name)}" src="${esc(src)}">`;};
  const content=library.groups.map(group=>`<section><h2>${esc(group.name)}</h2><p>${group.tags.map(esc).join(' · ')}</p>${[...group.versions,...(group.draft?[{...group.draft,name:'草稿',number:'草稿'}]:[])].map(v=>`<article><h3>${esc(v.name)} <small>版本 ${esc(v.number)} · ${esc(v.generationType.toUpperCase())}</small></h3><div class="media">${v.media.map(media).join('')}</div><label>提示词</label><textarea readonly>${esc(v.prompt)}</textarea><button>复制提示词</button>${v.negative?`<label>反向提示词</label><textarea readonly>${esc(v.negative)}</textarea><button>复制反向提示词</button>`:''}<p>${esc([v.model,v.seed&&'Seed '+v.seed,v.note].filter(Boolean).join(' · '))}</p></article>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; media-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Prompt Studio · 作品分享</title><style>body{margin:0;background:#f5f5f7;color:#1d1d1f;font:16px/1.6 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:48px 24px}h1{letter-spacing:-1px}small,label{color:#686873}small{font-weight:400;font-size:13px}article{background:white;border-radius:18px;padding:24px;margin:18px 0;box-shadow:0 3px 20px #00000006}.media{display:flex;gap:12px;overflow:auto}.media img,.media video{max-width:100%;height:300px;object-fit:contain;border-radius:10px}textarea{display:block;box-sizing:border-box;width:100%;min-height:120px;border:1px solid #dedee5;background:transparent;color:inherit;border-radius:10px;padding:14px;font:inherit;margin:8px 0}button{border:0;border-radius:8px;padding:9px 18px;background:#007aff;color:white;cursor:pointer}label{display:block;margin-top:18px}footer{margin-top:40px;color:#686873}@media(prefers-color-scheme:dark){body{background:#141416;color:#eee}article{background:#232326}textarea{border-color:#45454a}}</style><main><h1>作品与提示词</h1><p>${library.groups.length} 个提示词组 · Prompt Studio 离线分享包</p>${content}<footer>vibe coding by Haifeng.<br>在 Prompt Studio 中选择“导入分享包”可继续管理这些作品。</footer></main><script>document.addEventListener('click',async event=>{if(event.target.tagName!=='BUTTON')return;const field=event.target.previousElementSibling;field.focus();field.select();try{await navigator.clipboard.writeText(field.value);event.target.textContent='已复制';}catch{event.target.textContent=document.execCommand('copy')?'已复制':'已选中，请按 Ctrl+C';}});</script></html>`;
}
export async function createPackage({library,folder,mediaDir,publicDir,backup=false,groupId,includeDrafts=false}){
  const selected=backup?clone(library):sharedLibrary(library,{groupId,includeDrafts});
  validateLibrary(selected);await validateMediaFiles(selected,mediaDir);
  const directory=exportFolder(folder);await mkdir(directory,{recursive:true});
  const name=`Prompt-Studio-${backup?'完整备份':'分享包'}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}.zip`;
  const target=path.join(directory,name),temporary=target+'.partial',zip=new yazl.ZipFile();
  const files=new Set(allMedia(selected).map(item=>mediaFilename(item.src)).filter(Boolean));
  const output=createWriteStream(temporary,{flags:'wx'});
  zip.on('error',error=>zip.outputStream.destroy(error));
  const done=pipeline(zip.outputStream,output);done.catch(()=>{});
  try{
    zip.addBuffer(Buffer.from(JSON.stringify({format:'prompt-studio-backup',version:2,exportedAt:new Date().toISOString(),kind:backup?'backup':'share',library:selected})),'backup.json');
    for(const filename of files)zip.addFile(path.join(mediaDir,filename),'media/'+filename,{compress:false});
    const assets=new Set(allMedia(selected).map(item=>item.src).filter(src=>/^\/assets\/[a-zA-Z0-9_-]+\.svg$/.test(src)));
    for(const src of assets)zip.addBuffer(await readFile(path.join(publicDir,src.slice(1))),src.slice(1));
    zip.addBuffer(Buffer.from(previewPage(selected)),'index.html');
    zip.addBuffer(Buffer.from('解压后双击 index.html 可离线查看提示词与作品。\n在 Prompt Studio 的“备份与分享”中选择“导入分享包”，直接选择这个 ZIP；导入会合并资料，不覆盖原有组。\n'),'使用说明.txt');
    zip.end();await done;await rename(temporary,target);
    return {folder:directory,path:target,name,groups:selected.groups.length,files:files.size,bytes:(await stat(target)).size};
  }catch(error){zip.outputStream.destroy();output.destroy();await done.catch(()=>{});await rm(temporary,{force:true}).catch(()=>{});throw error;}
}
export async function importPackage({file,mediaDir}){
  if(typeof file!=='string'||!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.zip')throw Error('请选择 Prompt Studio ZIP 分享包或备份');
  const tempRoot=path.resolve(os.tmpdir()),temporary=await mkdtemp(path.join(tempRoot,'prompt-studio-import-'));
  if(path.dirname(path.resolve(temporary))!==tempRoot||!path.basename(temporary).startsWith('prompt-studio-import-'))throw Error('临时导入目录无效');
  let zip;
  try{
    zip=await yauzl.openPromise(file,{strictFileNames:true});let total=0,count=0;const seen=new Set();
    for await(const entry of zip.eachEntry()){
      if(++count>70000)throw Error('分享包文件数量过多');
      const name=entry.fileName;
      // Only import the manifest and content-addressed media. Never execute or extract HTML/scripts.
      if(name!=='backup.json'&&!/^media\/[a-f0-9]{64}\.(png|jpg|webp|gif|mp4|webm)$/.test(name))continue;
      if(seen.has(name))throw Error('分享包包含重复文件');seen.add(name);
      if(((entry.externalFileAttributes>>>16)&0xf000)===0xa000)throw Error('分享包不能包含符号链接');
      const limit=name==='backup.json'?64*1024*1024:512*1024*1024;
      total+=entry.uncompressedSize;
      if(entry.uncompressedSize>limit||total>50*1024**3)throw Error('分享包超过导入大小限制');
      const destination=path.join(temporary,name);await mkdir(path.dirname(destination),{recursive:true});
      await pipeline(await zip.openReadStreamPromise(entry),createWriteStream(destination,{flags:'wx'}));
    }
    return await prepareRestore({folder:temporary,mediaDir});
  }finally{zip?.close();await rm(temporary,{recursive:true,force:true});}
}
