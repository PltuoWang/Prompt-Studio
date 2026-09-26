import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {mkdir,readFile,writeFile,copyFile,lstat,realpath} from 'node:fs/promises';
import {clone,upgradeLibrary,validateLibrary} from './public/model.js';
import {exportFolder} from './export-files.mjs';
import {allMedia,mediaFilename,validateMediaFiles} from './media-store.mjs';

export async function createBackup({library,folder,mediaDir}){
  const directory=exportFolder(folder),stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const target=path.join(directory,`Prompt-Studio-备份-${stamp}-${randomUUID().slice(0,6)}`);
  await validateMediaFiles(library,mediaDir);await mkdir(path.join(target,'media'),{recursive:true});
  const files=new Set(allMedia(library).map(item=>mediaFilename(item.src)).filter(Boolean));
  for(const filename of files)await copyFile(path.join(mediaDir,filename),path.join(target,'media',filename),constants.COPYFILE_EXCL);
  const manifest={format:'prompt-studio-backup',version:2,exportedAt:new Date().toISOString(),library:clone(library)};
  await writeFile(path.join(target,'backup.json'),JSON.stringify(manifest),{flag:'wx'});
  await writeFile(path.join(target,'恢复说明.txt'),'在 Prompt Studio 的“设置与备份”中选择“恢复文件夹备份”，填写此文件夹路径。\n请将 backup.json 和 media 文件夹一起保管，恢复时会合并资料，不覆盖现有组。\n',{flag:'wx'});
  return {folder:target,groups:library.groups.length,files:files.size};
}
async function verifiedBackupFile(root,filename){
  const target=path.join(root,'media',filename),info=await lstat(target).catch(()=>null);
  if(!info?.isFile()||info.isSymbolicLink())throw new Error(`备份缺少作品文件：${filename}`);
  const actual=await realpath(target),base=await realpath(root);
  if(!actual.startsWith(base+path.sep))throw new Error('备份作品文件必须位于备份文件夹内');
  const hash=createHash('sha256');for await(const chunk of createReadStream(target))hash.update(chunk);
  if(hash.digest('hex')!==filename.split('.')[0])throw new Error(`备份文件校验失败：${filename}`);
  return target;
}
export async function prepareRestore({folder,mediaDir}){
  const root=exportFolder(folder),filename=path.join(root,'backup.json'),info=await lstat(filename).catch(()=>null);
  if(!info?.isFile()||info.isSymbolicLink()||info.size>64*1024*1024)throw new Error('请选择包含完整 backup.json 的备份文件夹');
  const data=JSON.parse(await readFile(filename,'utf8'));if(data.format!=='prompt-studio-backup')throw new Error('备份格式不兼容');
  const library=upgradeLibrary(data.library),files=new Set(allMedia(library).map(item=>mediaFilename(item.src)).filter(Boolean));
  const verified=[];
  for(const filename of files)verified.push({filename,source:await verifiedBackupFile(root,filename)});
  await mkdir(mediaDir,{recursive:true});
  for(const file of verified){
    const destination=path.join(mediaDir,file.filename);
    try{await copyFile(file.source,destination,constants.COPYFILE_EXCL);}catch(error){
      if(error.code!=='EEXIST')throw error;
      const info=await lstat(destination);if(!info.isFile())throw new Error('本地作品文件无效，请选择其他资料目录恢复');
      const hash=createHash('sha256');for await(const chunk of createReadStream(destination))hash.update(chunk);
      if(hash.digest('hex')!==file.filename.split('.')[0])throw new Error('本地已有作品文件校验失败，请保留备份并选择其他资料目录恢复');
    }
  }
  await validateMediaFiles(library,mediaDir);return library;
}
export function mergeLibrary(existing,imported){
  const result=clone(existing),ids=new Set(result.groups.map(group=>group.id));
  for(const group of clone(imported.groups)){
    if(ids.has(group.id)){group.id=randomUUID();group.name=`${group.name.slice(0,190)}（导入副本）`;}
    ids.add(group.id);result.groups.push(group);
  }
  return validateLibrary(result);
}
