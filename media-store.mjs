import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,open,unlink,link,lstat} from 'node:fs/promises';
import {MEDIA_TYPES,MANAGED_MEDIA} from './public/media-model.js';

export const mediaFilename=src=>MANAGED_MEDIA.test(src)?src.slice('/media/'.length):null;
export function signatureMatches(bytes,mime){
  if(mime==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/gif')return /^GIF8[79]a$/.test(bytes.subarray(0,6).toString());
  if(mime==='image/webp')return bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(mime==='video/mp4')return bytes.subarray(4,8).toString()==='ftyp';
  if(mime==='video/webm')return bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  return false;
}
export async function receiveMedia(stream,{mediaDir,mime,name,contentLength}){
  const type=Object.hasOwn(MEDIA_TYPES,mime)?MEDIA_TYPES[mime]:null;if(!type)throw Object.assign(new Error('支持 PNG、JPG、WEBP、GIF、MP4 和 WebM'),{status:415});
  if(Number(contentLength)>type.limit)throw Object.assign(new Error(type.kind==='video'?'视频不能超过 512 MB':'图片不能超过 32 MB'),{status:413});
  await mkdir(mediaDir,{recursive:true});
  const temporary=path.join(mediaDir,`.upload-${randomUUID()}.tmp`),handle=await open(temporary,'wx');
  const hash=createHash('sha256');let bytes=0,header=Buffer.alloc(0);
  try{
    for await(const chunk of stream){
      bytes+=chunk.length;if(bytes>type.limit)throw Object.assign(new Error('文件超过导入大小限制'),{status:413});
      if(header.length<32)header=Buffer.concat([header,chunk.subarray(0,32-header.length)]);
      hash.update(chunk);await handle.writeFile(chunk);
    }
    if(!bytes||!signatureMatches(header,mime))throw Object.assign(new Error('文件内容与格式不匹配，请导入原始图片或视频文件'),{status:415});
    const digest=hash.digest('hex'),filename=`${digest}.${type.extension}`;
    await handle.close();
    try{await link(temporary,path.join(mediaDir,filename));}catch(error){if(error.code!=='EEXIST')throw error;}
    return {id:randomUUID(),kind:type.kind,mime,name:String(name||filename).slice(0,500),src:`/media/${filename}`,bytes};
  }finally{await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
}
export function allMedia(library){return library.groups.flatMap(group=>[...group.versions,...(group.draft?[group.draft]:[])].flatMap(version=>version.media));}
export async function validateMediaFiles(library,mediaDir){
  const files=new Map();
  for(const item of allMedia(library)){
    const filename=mediaFilename(item.src);if(!filename)continue;
    if(!files.has(filename)){const info=await lstat(path.join(mediaDir,filename)).catch(()=>null);if(!info?.isFile())throw new Error(`找不到本地作品文件：${item.name}，请重新导入或恢复完整备份`);files.set(filename,info);}
    if(item.bytes&&files.get(filename).size!==item.bytes)throw new Error(`作品文件不完整：${item.name}`);
  }
}
export function byteRange(value,size){
  if(!value)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||(!match[1]&&!match[2])||size===0)return false;
  let start,end;
  if(!match[1]){const suffix=Number(match[2]);if(suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1;}
  else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start?{start,end}:false;
}
export async function serveMedia(req,res,mediaDir,src){
  const filename=mediaFilename(src);if(!filename)return false;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return true;}
  const fullPath=path.join(mediaDir,filename),info=await lstat(fullPath);
  if(!info.isFile())throw Object.assign(new Error('作品文件不存在'),{status:404});
  const extension=filename.split('.').at(-1),mime=Object.entries(MEDIA_TYPES).find(([,type])=>type.extension===extension)[0];
  const range=byteRange(req.headers.range,info.size);
  res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','private, max-age=31536000, immutable');
  if(range===false){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return true;}
  const start=range?.start||0,end=range?.end??info.size-1;
  res.setHeader('Content-Length',end-start+1);
  if(range)res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
  res.writeHead(range?206:200);
  if(req.method==='HEAD'){res.end();return true;}
  const stream=createReadStream(fullPath,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return true;
}
