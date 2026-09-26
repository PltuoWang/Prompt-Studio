import {mediaMime} from './media-model.js';
import {fitCrop,moveCrop,resizeCrop,pixelCrop,ratioLabel,loadImage} from './image-utils.js';

export async function openCropEditor(pic,{openModal,onSave}){
  const image=await loadImage(pic.src),width=image.naturalWidth,height=image.naturalHeight;
  openModal('裁切图片',`<p>拖动选框移动位置，拖动四角调整范围。裁切结果另存为新图片，原图保留。</p><div class="crop-toolbar"><label for="crop-ratio">裁切比例</label><select class="select" id="crop-ratio"><option value="free">自由</option><option value="original">原图比例</option><option value="1:1">1:1 正方形</option><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="3:2">3:2</option><option value="2:3">2:3</option></select><button type="button" class="btn small" id="crop-reset">重置选框</button><span class="muted">原图 ${width} × ${height} px · ${ratioLabel(width,height)}</span></div><div class="crop-workspace"><div class="crop-stage" id="crop-stage"><img id="crop-image" alt="待裁切原图" draggable="false"><div class="crop-box" id="crop-box" role="group" aria-label="裁切选框，可用方向键移动" tabindex="0"><div class="crop-grid"></div>${['nw','ne','sw','se'].map(c=>`<button type="button" class="crop-handle ${c}" data-corner="${c}" aria-label="调整${c==='nw'?'左上':c==='ne'?'右上':c==='sw'?'左下':'右下'}角"></button>`).join('')}</div></div></div><div class="crop-bottom"><span id="crop-output" role="status" aria-live="polite"></span><div class="actions"><button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" id="crop-save">另存裁切图片</button></div></div><p class="error-text" id="crop-error" role="alert"></p>`);
  const modal=document.querySelector('#modal');modal.classList.add('crop-dialog');
  const stage=document.querySelector('#crop-stage'),box=document.querySelector('#crop-box'),selector=document.querySelector('#crop-ratio'),output=document.querySelector('#crop-output'),error=document.querySelector('#crop-error'),save=document.querySelector('#crop-save');
  document.querySelector('#crop-image').src=pic.src;
  let rect=fitCrop(width,height,null),aspect=null,drag=null,scale=1;
  function draw(){
    scale=Math.min(stage.parentElement.clientWidth/width,Math.min(440,window.innerHeight*.48)/height,1);
    stage.style.width=`${width*scale}px`;stage.style.height=`${height*scale}px`;
    box.style.left=`${rect.x*scale}px`;box.style.top=`${rect.y*scale}px`;box.style.width=`${rect.width*scale}px`;box.style.height=`${rect.height*scale}px`;
    const pixels=pixelCrop(rect,width,height);output.textContent=`裁切结果 ${pixels.width} × ${pixels.height} px · ${ratioLabel(pixels.width,pixels.height)}`;
  }
  selector.addEventListener('change',()=>{
    aspect=selector.value==='free'?null:selector.value==='original'?width/height:selector.value.split(':').reduce((a,b)=>Number(a)/Number(b));
    rect=fitCrop(width,height,aspect);draw();
  });
  document.querySelector('#crop-reset').addEventListener('click',()=>{rect=fitCrop(width,height,aspect);draw();});
  box.addEventListener('pointerdown',event=>{
    event.preventDefault();box.focus();drag={x:event.clientX,y:event.clientY,rect:{...rect},corner:event.target.dataset.corner};box.setPointerCapture(event.pointerId);
  });
  box.addEventListener('pointermove',event=>{
    if(!drag)return;
    const dx=(event.clientX-drag.x)/scale,dy=(event.clientY-drag.y)/scale;
    rect=drag.corner?resizeCrop(drag.rect,dx,dy,drag.corner,width,height,aspect):moveCrop(drag.rect,dx,dy,width,height);draw();
  });
  const finish=()=>{drag=null;};box.addEventListener('pointerup',finish);box.addEventListener('pointercancel',finish);box.addEventListener('lostpointercapture',finish);
  box.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;
    event.preventDefault();const amount=event.shiftKey?10:1,[dx,dy]=delta.map(n=>n*amount),corner=event.target.dataset.corner;
    rect=corner?resizeCrop(rect,dx,dy,corner,width,height,aspect):moveCrop(rect,dx,dy,width,height);draw();
  });
  const observer=new ResizeObserver(draw);observer.observe(stage.parentElement);
  const cleanup=()=>{if(!modal.open||!stage.isConnected){observer.disconnect();modal.removeEventListener('close',cleanup);}};
  modal.addEventListener('close',cleanup);draw();
  save.addEventListener('click',async()=>{
    save.disabled=true;error.textContent='';
    try{
      const crop=pixelCrop(rect,width,height);
      if(crop.width*crop.height>40000000)throw new Error('选区超过 4000 万像素，请缩小裁切范围');
      const canvas=document.createElement('canvas');canvas.width=crop.width;canvas.height=crop.height;
      const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法处理这张图片');
      context.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
      const jpeg=mediaMime(pic)==='image/jpeg',src=canvas.toDataURL(jpeg?'image/jpeg':'image/png',.94);
      if(!src.startsWith('data:image/'))throw new Error('无法生成裁切图片，请缩小选区');
      if(src.length*3/4>32*1024*1024)throw new Error('裁切结果超过 32 MB，请缩小选区');
      await onSave({id:crypto.randomUUID(),name:`${pic.name.replace(/\.[^.]+$/,'')}-crop-${crop.width}x${crop.height}.${jpeg?'jpg':'png'}`,src,width:crop.width,height:crop.height});
      modal.close();
    }catch(cause){error.textContent=cause.message;save.disabled=false;}
  });
}
