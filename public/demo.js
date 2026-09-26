const date = '2026-09-26T07:30:00.000Z';
const pic = (name, id=name) => ({id,kind:'image', name:`${name}.svg`,src:`/assets/${name}.svg`});
const version = (id,number,name,prompt,art,source='ComfyUI',extra={}) => ({id,number,name,prompt,negative:'blurry, low quality, distorted proportions, watermark',media:[pic(art)],generationType:'t2i',parameters:{},source,model:source==='ComfyUI'?'FLUX · 示例参数':'',seed:'',note:'',createdAt:date,...extra});
export function seedLibrary() {
  return {schema:2,groups:[
    {id:'g-perfume',name:'琥珀之境 · 香水视觉',tags:['产品摄影','光影'],favorite:true,preferredId:'p3',updatedAt:date,versions:[
      version('p1',1,'探索基础构图','Luxury amber perfume bottle on a white stone pedestal, clean ivory background, soft studio lighting, minimalist composition, product photography, 85mm lens','perfume-1','网络收藏',{note:'收藏基础构图，重点观察瓶身比例。',sourceUrl:''}),
      version('p2',2,'试试深色背景','Luxury amber perfume bottle on a dark stone pedestal, deep charcoal background, dramatic side lighting, minimalist composition, product photography, 85mm lens','perfume-2','ComfyUI',{parentId:'p1',note:'增强明暗对比，让琥珀色瓶身更突出。',seed:'284019'}),
      version('p3',3,'加入水面与倒影','Luxury amber perfume bottle on a dark stone pedestal, warm terracotta background, golden hour side lighting, subtle water reflections, minimalist composition, product photography, 85mm lens','perfume-3','ComfyUI',{parentId:'p2',note:'暖色环境更统一，保留水面倒影这一版。',seed:'284019'})]},
    {id:'g-landscape',name:'山间来信',tags:['自然风景','氛围感'],favorite:true,preferredId:'l2',updatedAt:'2026-09-25T09:00:00.000Z',versions:[version('l1',1,'晨雾','Layered mountain silhouettes, pale morning mist, quiet lake, muted jade and sage tones, cinematic landscape','landscape-1','Grok'),version('l2',2,'日落时分','Layered mountain silhouettes, warm sunset haze, quiet lake, muted jade and amber tones, cinematic landscape','landscape-2','Grok',{parentId:'l1',note:'让远处的太阳成为视觉中心。'})]},
    {id:'g-architecture',name:'留白 · 空间练习',tags:['建筑空间','极简'],favorite:false,preferredId:'a1',updatedAt:'2026-09-24T08:00:00.000Z',versions:[version('a1',1,'午后光线','Minimalist arched interior, warm beige plaster walls, sculptural chair, afternoon sunlight, architectural photography','architecture','网络收藏')]},
    {id:'g-flower',name:'花的另一种语言',tags:['艺术插画','自然风景'],favorite:false,preferredId:'f1',updatedAt:'2026-09-23T08:00:00.000Z',versions:[version('f1',1,'柔软的形状','Abstract botanical study, sculptural orange petals, deep forest background, elegant organic forms, fine art illustration','flower','Codex')]},
    {id:'g-city',name:'凌晨 02:17',tags:['科幻场景','氛围感'],favorite:true,preferredId:'c1',updatedAt:'2026-09-22T08:00:00.000Z',versions:[version('c1',1,'蓝色时刻','Futuristic city skyline at blue hour, glowing windows, atmospheric fog, cinematic wide angle, indigo and coral accents','city','ComfyUI')]},
    {id:'g-object',name:'日常物件观察',tags:['产品摄影','极简'],favorite:false,preferredId:'o1',updatedAt:'2026-09-21T08:00:00.000Z',versions:[version('o1',1,'柔和的平衡','Sculptural ceramic vessel, warm cream background, soft natural shadows, editorial still life, balanced composition','objects','Codex')]}
  ]};
}
