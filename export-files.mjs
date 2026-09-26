import path from 'node:path';
import {createReadStream} from 'node:fs';
import {mkdir,open,readFile,unlink} from 'node:fs/promises';
import {MANAGED_MEDIA} from './public/media-model.js';

export function exportFolder(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000 || value.includes('\0')) throw new Error('请填写保存文件夹的完整路径');
  const folder = value.trim();
  if (!path.isAbsolute(folder) || (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(folder))) throw new Error('请使用本机文件夹的完整路径，例如 E:\\我的图片');
  return path.resolve(folder);
}
export function safeFilename(value) {
  if (typeof value !== 'string') throw new Error('请填写文件名称');
  let name = value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().replace(/[. ]+$/,'').slice(0,100).replace(/[. ]+$/,'');
  if (!name) throw new Error('请填写有效的文件名称');
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return name;
}
export function promptText(version) {
  const labels={fps:'帧率',duration:'目标时长（秒）',camera:'镜头运动',motion:'主体运动'};
  const parameters=Object.entries(version.parameters||{}).filter(([,value])=>value!==''&&value!==null).map(([key,value])=>`${labels[key]||key}: ${value}`).join('\n');
  return `${version.prompt || ''}${version.negative ? `\n\n【负面提示词】\n${version.negative}` : ''}${parameters?`\n\n【创作参数】\n${parameters}`:''}\n`;
}
async function imageFile(picture, publicDir, mediaDir) {
  if (!picture) return null;
  const managed=MANAGED_MEDIA.exec(picture.src);
  if(managed){if(!mediaDir)throw new Error('未配置作品目录');return {extension:managed[2],source:path.join(mediaDir,picture.src.slice('/media/'.length))};}
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(picture.src);
  if (match) return {extension:match[1] === 'jpeg' ? 'jpg' : match[1],data:Buffer.from(match[2],'base64')};
  if (/^\/assets\/[a-z0-9-]+\.svg$/.test(picture.src)) return {extension:'svg',data:await readFile(path.join(publicDir,picture.src.slice(1)))};
  throw new Error('这份作品暂时无法保存');
}
export async function saveVersionFiles({folder,name,version,picture,publicDir,mediaDir}) {
  const directory=exportFolder(folder),base=safeFilename(name),image=await imageFile(picture,publicDir,mediaDir);
  if (!image && !version.prompt.trim() && !version.negative?.trim()) throw new Error('请先添加作品或提示词，再保存到文件夹');
  await mkdir(directory,{recursive:true});
  for(let suffix=1;suffix<=1000;suffix++) {
    const stem=suffix===1?base:`${base} (${suffix})`;
    const files=[...(image?[{name:`${stem}.${image.extension}`,data:image.data,source:image.source}]:[]),{name:`${stem}.txt`,data:promptText(version)}];
    const created=[];
    try {
      // Reserve every output with exclusive creation. Existing files are never overwritten.
      for(const file of files) {
        const filename=path.join(directory,file.name),handle=await open(filename,'wx');
        created.push({filename,handle,data:file.data,source:file.source});
      }
      for(const file of created){if(file.source){for await(const chunk of createReadStream(file.source))await file.handle.writeFile(chunk);}else await file.handle.writeFile(file.data);}
      await Promise.all(created.map(file=>file.handle.close()));
      return {folder:directory,stem,files:files.map(file=>({name:file.name,path:path.join(directory,file.name)}))};
    } catch(error) {
      await Promise.all(created.map(async file=>{await file.handle.close().catch(()=>{});await unlink(file.filename).catch(()=>{});}));
      if(error.code==='EEXIST')continue;
      throw error;
    }
  }
  throw new Error('同名文件过多，请换一个文件名称');
}
