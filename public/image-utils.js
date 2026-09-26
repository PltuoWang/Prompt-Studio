const formats=[[1,1],[9,16],[16,9],[4,3],[3,4],[3,2],[2,3],[21,9]];
export function ratioLabel(width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)return '尺寸未知';
  const common=formats.find(([a,b])=>width*b===height*a);
  if(common)return common.join(':');
  const nearby=formats.find(([a,b])=>Math.abs(width/height-a/b)/(a/b)<0.01);
  if(nearby)return `≈ ${nearby.join(':')}`;
  const gcd=(a,b)=>b?gcd(b,a%b):a,d=gcd(Math.round(width),Math.round(height));
  return `${Math.round(width)/d}:${Math.round(height)/d}`;
}
export function fitCrop(width,height,aspect){
  if(!aspect)return {x:0,y:0,width,height};
  const w=Math.min(width,height*aspect),h=w/aspect;
  return {x:(width-w)/2,y:(height-h)/2,width:w,height:h};
}
export function moveCrop(rect,dx,dy,width,height){
  return {...rect,x:Math.max(0,Math.min(width-rect.width,rect.x+dx)),y:Math.max(0,Math.min(height-rect.height,rect.y+dy))};
}
export function resizeCrop(rect,dx,dy,corner,width,height,aspect){
  const left=corner.includes('w'),top=corner.includes('n');
  const anchorX=rect.x+(left?rect.width:0),anchorY=rect.y+(top?rect.height:0);
  const maxW=left?anchorX:width-anchorX,maxH=top?anchorY:height-anchorY;
  let w=Math.max(1,Math.min(maxW,rect.width+(left?-dx:dx)));
  let h=Math.max(1,Math.min(maxH,rect.height+(top?-dy:dy)));
  if(aspect){
    if(Math.abs(dx)>=Math.abs(dy))h=w/aspect;else w=h*aspect;
    if(w>maxW){w=maxW;h=w/aspect;}
    if(h>maxH){h=maxH;w=h*aspect;}
  }
  return {x:left?anchorX-w:anchorX,y:top?anchorY-h:anchorY,width:w,height:h};
}
export function pixelCrop(rect,width,height){
  const x=Math.max(0,Math.min(width-1,Math.round(rect.x))),y=Math.max(0,Math.min(height-1,Math.round(rect.y)));
  return {x,y,width:Math.max(1,Math.min(width-x,Math.round(rect.width))),height:Math.max(1,Math.min(height-y,Math.round(rect.height)))};
}
const decodedImages=new Map();
export function loadImage(src){
  if(src.startsWith('blob:'))return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('无法读取图片，请重新导入'));img.src=src;});
  if(!decodedImages.has(src)){
    if(decodedImages.size>=12)decodedImages.delete(decodedImages.keys().next().value);
    const promise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('无法读取图片，请重新导入'));img.src=src;});
    decodedImages.set(src,promise);promise.catch(()=>decodedImages.delete(src));
  }
  return decodedImages.get(src);
}
