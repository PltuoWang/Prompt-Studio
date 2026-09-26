export const MEDIA_TYPES={
  'image/png':{kind:'image',extension:'png',limit:32*1024*1024},
  'image/jpeg':{kind:'image',extension:'jpg',limit:32*1024*1024},
  'image/webp':{kind:'image',extension:'webp',limit:32*1024*1024},
  'image/gif':{kind:'image',extension:'gif',limit:32*1024*1024},
  'video/mp4':{kind:'video',extension:'mp4',limit:512*1024*1024},
  'video/webm':{kind:'video',extension:'webm',limit:512*1024*1024}
};
export const MEDIA_ACCEPT=Object.keys(MEDIA_TYPES).join(',');
export const MANAGED_MEDIA=/^\/media\/([a-f0-9]{64})\.(png|jpg|webp|gif|mp4|webm)$/;
export const generationTypes={t2i:'T2I · 图像',t2v:'T2V · 视频',i2v:'I2V · 图生视频'};
export function mediaKind(item){return item?.kind==='video'?'video':'image';}
export function mediaMime(item){
  return item?.mime||(/^data:([^;]+)/.exec(item?.src||'')?.[1])||Object.entries(MEDIA_TYPES).find(([,type])=>item?.src?.endsWith(`.${type.extension}`))?.[0]||(item?.src?.endsWith('.svg')?'image/svg+xml':'');
}
export function fileMime(file){
  if(MEDIA_TYPES[file.type])return file.type;
  const extension=file.name.split('.').at(-1).toLowerCase();
  return Object.keys(MEDIA_TYPES).find(type=>MEDIA_TYPES[type].extension===extension)||(extension==='jpeg'?'image/jpeg':'');
}
export function formatDuration(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return '时长未知';
  const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total/60)%60;
  return `${hours?`${hours}:`:''}${String(minutes).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
export function formatBytes(bytes){if(!Number.isFinite(bytes)||bytes<0)return '';return bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
export function mediaSummary(items){const videos=items.filter(item=>mediaKind(item)==='video').length,images=items.length-videos;return [images?`${images} 张图片`:'',videos?`${videos} 段视频`:''].filter(Boolean).join(' · ')||'暂无作品';}
export function groupMatchesMedia(group,kind){
  if(!kind)return true;
  return [...group.versions,...(group.draft?[group.draft]:[])].some(version=>version.media.some(item=>mediaKind(item)===kind)||(!version.media.length&&(kind==='video'?['t2v','i2v'].includes(version.generationType):version.generationType==='t2i')));
}
export function validateMedia(item){
  const string=(value,max)=>typeof value==='string'&&value.length<=max;
  if(!item||!string(item.id,100)||!string(item.name,500)||!['image','video'].includes(item.kind)||!string(item.src,16000000))return false;
  const managed=MANAGED_MEDIA.exec(item.src);
  if(managed){const type=Object.entries(MEDIA_TYPES).find(([,value])=>value.extension===managed[2]);if(type[1].kind!==item.kind||(item.mime&&item.mime!==type[0]))return false;}
  else if(item.kind!=='image'||!(/^\/assets\/[a-z0-9-]+\.svg$/.test(item.src)||/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(item.src)))return false;
  for(const key of ['width','height','bytes'])if(item[key]!==undefined&&(!Number.isSafeInteger(item[key])||item[key]<1))return false;
  if(item.duration!==undefined&&(!Number.isFinite(item.duration)||item.duration<0))return false;
  if(item.poster!==undefined&&(!string(item.poster,300000)||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(item.poster)))return false;
  return true;
}
