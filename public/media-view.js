import {mediaKind,formatDuration,formatBytes} from './media-model.js';
import {ratioLabel} from './image-utils.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mediaPreview(item,{alt='',mode='thumbnail',className=''}={}){
  if(mediaKind(item)==='image')return `<img src="${esc(item.src)}" alt="${esc(alt)}" class="${className}" ${mode==='stage'?'data-action="lightbox"':''} ${mode==='thumbnail'?'loading="lazy"':''}>`;
  if(['stage','full','compare'].includes(mode))return `<video src="${esc(item.src)}" class="${className}" controls playsinline preload="metadata" ${item.poster?`poster="${esc(item.poster)}"`:''} data-media-id="${esc(item.id)}" aria-label="${esc(alt||item.name)}"></video><p class="video-error" hidden>当前浏览器无法预览此视频。仍可保存原文件，用本地播放器打开。</p>`;
  return `${item.poster?`<img src="${esc(item.poster)}" alt="${esc(alt)}" class="${className}" loading="lazy">`:`<div class="video-placeholder" role="img" aria-label="${esc(alt||item.name)}"><span>▶</span><small>视频</small></div>`}<span class="video-badge">▶ ${formatDuration(item.duration)}</span>`;
}
export function mediaInfo(item){
  return [item.width&&item.height?`${item.width} × ${item.height} px · ${ratioLabel(item.width,item.height)}`:'尺寸待识别',mediaKind(item)==='video'?formatDuration(item.duration):'',formatBytes(item.bytes)].filter(Boolean).join(' · ');
}
