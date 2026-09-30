const path=require('node:path');
exports.localFolder=value=>typeof value==='string'&&path.isAbsolute(value)&&!value.includes('\0')&&!/^\\\\[.?]\\/.test(value);
exports.validBounds=(value,areas)=>{
  const fallback={width:1360,height:880};
  if(!value||!['x','y','width','height'].every(key=>Number.isFinite(value[key])))return fallback;
  const area=areas.find(a=>value.x+value.width>a.x+100&&value.x<a.x+a.width-100&&value.y>=a.y&&value.y<a.y+a.height-100);
  if(!area)return fallback;
  const width=Math.min(Math.max(1000,value.width),Math.max(1000,area.width)),height=Math.min(Math.max(680,value.height),Math.max(680,area.height));
  return {width,height,x:Math.max(area.x,Math.min(value.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(value.y,area.y+area.height-height))};
};
