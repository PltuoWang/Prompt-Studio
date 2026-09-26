import {MEDIA_TYPES,fileMime} from './media-model.js';
import {loadImage} from './image-utils.js';
function videoEvent(video,event,timeout=6000){return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',failed);};
  const done=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new Error('浏览器无法预览这个视频'));};
  const timer=setTimeout(failed,timeout);video.addEventListener(event,done,{once:true});video.addEventListener('error',failed,{once:true});
});}
export async function inspectMedia(file){
  const mime=fileMime(file),type=MEDIA_TYPES[mime];if(!type)throw new Error('支持 PNG、JPG、WEBP、GIF、MP4 和 WebM');
  if(file.size>type.limit)throw new Error(type.kind==='video'?'视频不能超过 512 MB':'图片不能超过 32 MB');
  const url=URL.createObjectURL(file);
  if(type.kind==='image'){try{const image=await loadImage(url);return {width:image.naturalWidth,height:image.naturalHeight};}finally{URL.revokeObjectURL(url);}}
  const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
  const metadata={};
  try{
    const ready=videoEvent(video,'loadedmetadata');video.src=url;await ready;
    if(video.videoWidth&&video.videoHeight){metadata.width=video.videoWidth;metadata.height=video.videoHeight;}
    if(Number.isFinite(video.duration))metadata.duration=video.duration;
    if(video.readyState<2)await videoEvent(video,'loadeddata');
    if(video.duration>.3){const seeked=videoEvent(video,'seeked',2000);video.currentTime=.15;await seeked;}
    const canvas=document.createElement('canvas'),scale=Math.min(1,640/video.videoWidth,640/video.videoHeight);canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    const poster=canvas.toDataURL('image/jpeg',.72);if(poster.length<=300000)metadata.poster=poster;
  }catch{/* The original video remains manageable even when its codec cannot be previewed. */}
  finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  return metadata;
}
export function uploadMedia(file,{signal,onProgress=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('已取消导入','AbortError'));return;}
    const mime=fileMime(file);if(!MEDIA_TYPES[mime]){reject(new Error('不支持这个文件格式'));return;}
    const xhr=new XMLHttpRequest(),abort=()=>xhr.abort();
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    xhr.open('POST','/api/media');xhr.setRequestHeader('Content-Type',mime);xhr.setRequestHeader('X-File-Name',encodeURIComponent(file.name));
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(event.loaded/event.total*100));};
    xhr.onload=()=>{cleanup();try{const result=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new Error(result.error||'导入失败');resolve(result);}catch(error){reject(error);}};
    xhr.onerror=()=>{cleanup();reject(new Error('本地服务连接中断，请重试'));};xhr.onabort=()=>{cleanup();reject(new DOMException('已取消导入','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});xhr.send(file);
  });
}
export async function importOneMedia(file,options){const metadata=await inspectMedia(file);if(options?.signal?.aborted)throw new DOMException('已取消导入','AbortError');return {...await uploadMedia(file,options),...metadata};}
export function dataUrlFile(src,name){const [header,data]=src.split(','),mime=/^data:([^;]+)/.exec(header)?.[1];const binary=atob(data),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));return new File([bytes],name,{type:mime});}
export async function captureFrame(video,name){
  if(!video||video.readyState<2||!video.videoWidth)throw new Error('请先播放视频，再暂停到需要截取的画面');
  if(video.videoWidth*video.videoHeight>40000000)throw new Error('当前视频画面过大，暂时无法截图');
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('无法截取这一帧，请重试');
  return new File([blob],`${name.replace(/\.[^.]+$/,'')}-frame-${Math.round(video.currentTime*1000)}ms.png`,{type:'image/png'});
}
