import {validateMedia,generationTypes,groupMatchesMedia} from './media-model.js';
export const clone = value => structuredClone(value);
export const uid = () => globalThis.crypto.randomUUID();
export function latest(group) { return group.versions.at(-1); }
export function preferred(group) { return group.versions.find(v => v.id === group.preferredId) || latest(group); }
export function removeMedia(group, versionId, imageId, now = new Date().toISOString()) {
  if (!group || group.deletedAt) throw new Error('请先从回收站恢复提示词组');
  const target = versionId === 'draft' ? group.draft : group.versions.find(v => v.id === versionId);
  const index = target?.media.findIndex(image => image.id === imageId) ?? -1;
  if (index < 0) throw new Error('作品已不存在，请重新选择');
  const [removed] = target.media.splice(index, 1);
  group.updatedAt = now;
  return removed;
}
export function createDraft(version) {
  return { parentId: version.id, prompt: '', negative: '', source: version.source, model: '', seed: '', note: '', name: '', media: [], generationType: version.generationType || 't2i', parameters: {} };
}
export function createVersion(group, parentId, now = new Date().toISOString()) {
  if (!group || group.deletedAt) throw new Error('请先从回收站恢复提示词组');
  const base = group.versions.find(version => version.id === parentId);
  if (!base) throw new Error('基础版本不存在');
  if (group.versions.length >= 1000) throw new Error('每个组最多保留 1000 个版本');
  const version = { ...createDraft(base), id: uid(), number: Math.max(...group.versions.map(v => v.number)) + 1, name: '新的探索', createdAt: now };
  group.versions.push(version);
  group.updatedAt = now;
  return version;
}
export function updateVersionField(group, versionId, field, value, now = new Date().toISOString()) {
  if (!group || group.deletedAt) throw new Error('请先从回收站恢复提示词组');
  const target = versionId === 'draft' ? group.draft : group.versions.find(version => version.id === versionId);
  if (!target) throw new Error('版本不存在');
  if (!['prompt','negative','name','source','model','seed','note','generationType'].includes(field) || typeof value !== 'string') throw new Error('无法修改这个字段');
  if(field==='generationType'&&!Object.hasOwn(generationTypes,value))throw new Error('创作类型无效');
  target[field] = value;
  group.updatedAt = now;
  return target;
}
export function commitDraft(group, draft, now = new Date().toISOString()) {
  if (!draft.prompt.trim() && !draft.media.length) throw new Error('请至少添加提示词或一份作品');
  if (!group.versions.some(v => v.id === draft.parentId)) throw new Error('基础版本不存在');
  const version = { ...clone(draft), id: uid(), number: Math.max(...group.versions.map(v=>v.number)) + 1, createdAt: now };
  version.prompt = version.prompt.trim();
  version.name = draft.name.trim() || '新的探索';
  group.versions.push(version);
  group.updatedAt = now;
  delete group.draft;
  return version;
}
export function searchGroups(groups, query = '', filter = 'all', tag = '', source = '', kind = '') {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return groups.filter(g => {
    if (filter === 'trash' ? !g.deletedAt : !!g.deletedAt) return false;
    if (filter === 'favorites' && !g.favorite) return false;
    if (filter === 'drafts' && !g.draft) return false;
    if (tag && !g.tags.includes(tag)) return false;
    if (!groupMatchesMedia(g,kind)) return false;
    if (source && !g.versions.some(v => v.source === source)) return false;
    const text = [g.name, ...g.tags, ...g.versions.flatMap(v => [v.name,v.prompt,v.negative,v.note,v.model,v.source,v.generationType,...Object.values(v.parameters||{})])].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}
export function diffTokens(before, after) {
  const tokenize = text => text.match(/[\p{Script=Han}]|[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu) || [];
  const a = tokenize(before), b = tokenize(after);
  // Long prompts use a bounded prefix/suffix comparison instead of a quadratic table.
  if (a.length * b.length > 600000) {
    let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length-start && end < b.length-start && a[a.length-1-end] === b[b.length-1-end]) end++;
    return [{type:'same',text:a.slice(0,start).join('')},{type:'removed',text:a.slice(start,a.length-end).join('')},{type:'added',text:b.slice(start,b.length-end).join('')},{type:'same',text:a.slice(a.length-end).join('')}].filter(t=>t.text);
  }
  const table = Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) table[i][j] = a[i] === b[j] ? table[i+1][j+1]+1 : Math.max(table[i+1][j],table[i][j+1]);
  const result=[];
  const push=(type,text)=>{ const last=result.at(-1); if(last?.type===type) last.text+=text; else result.push({type,text}); };
  let i=0,j=0;
  while(i<a.length || j<b.length) {
    if(i<a.length && j<b.length && a[i]===b[j]) { push('same',a[i++]);j++; }
    else if(j<b.length && (i===a.length || table[i][j+1]>table[i+1][j])) push('added',b[j++]);
    else push('removed',a[i++]);
  }
  return result;
}
export function validateLibrary(library) {
  if (!library || library.schema !== 2 || !Array.isArray(library.groups) || library.groups.length > 2000) throw new Error('资料格式不兼容');
  const ids = new Set();
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const string = (value, max=100000) => typeof value === 'string' && value.length <= max;
  const image = validateMedia;
  const validParameters = value => value === undefined || (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length<=30 && Object.entries(value).every(([key,v])=>/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) && ((typeof v==='string'&&v.length<=10000)||(typeof v==='number'&&Number.isFinite(v))||typeof v==='boolean')));

  for(const group of library.groups) {
    if(!validId(group.id) || ids.has(group.id) || !string(group.name,200) || !group.name.trim() || !Array.isArray(group.tags) || group.tags.length>30 || !group.tags.every(t=>string(t,100)) || !Array.isArray(group.versions) || !group.versions.length || group.versions.length>1000) throw new Error('提示词组格式无效');
    ids.add(group.id);
    const versionIds=new Set();
    for(const v of group.versions) {
      if(!validId(v.id) || versionIds.has(v.id) || !Number.isSafeInteger(v.number) || v.number<1 || !string(v.prompt) || !string(v.name,200) || !Array.isArray(v.media) || v.media.length>30 || !v.media.every(image)) throw new Error('版本或作品格式无效');
      if(!Object.hasOwn(generationTypes,v.generationType)||!validParameters(v.parameters))throw new Error('创作类型或参数无效');
      for(const key of ['negative','note','source','model','seed','sourceUrl','createdAt','parentId']) if(v[key]!==undefined && !string(v[key])) throw new Error('版本字段格式无效');
      versionIds.add(v.id);
    }
    if(group.draft && (!string(group.draft.prompt) || !string(group.draft.name,200) || !versionIds.has(group.draft.parentId) || !Array.isArray(group.draft.media) || !group.draft.media.every(image) || group.draft.media.length>30 || !validParameters(group.draft.parameters) || !Object.hasOwn(generationTypes,group.draft.generationType))) throw new Error('草稿格式无效');
    if(group.preferredId && !versionIds.has(group.preferredId)) throw new Error('首选版本不存在');
    for(const key of ['updatedAt','deletedAt']) if(group[key]!==undefined && !string(group[key],100)) throw new Error('日期格式无效');
  }
  return library;
}

export function upgradeLibrary(input){
  if(!input||![1,2].includes(input.schema))throw new Error('资料格式不兼容');
  if(input.schema===2)return validateLibrary(clone(input));
  const library=clone(input);library.schema=2;
  if(!Array.isArray(library.groups))throw new Error('资料格式不兼容');
  for(const group of library.groups){
    if(!Array.isArray(group.versions))throw new Error('提示词组格式无效');
    for(const version of [...group.versions,...(group.draft?[group.draft]:[])]){
      if(!Array.isArray(version.images))throw new Error('旧版图片格式无效');
      version.media=version.images.map(image=>({...image,kind:'image'}));
      delete version.images;version.generationType='t2i';version.parameters={};
    }
  }
  return validateLibrary(library);
}
export function cloneVersion(group,versionId,now=new Date().toISOString()){
  const original=versionId==='draft'?group.draft:group.versions.find(version=>version.id===versionId);if(!original)throw new Error('版本不存在');
  const version=createVersion(group,versionId==='draft'?original.parentId:original.id,now);
  Object.assign(version,{prompt:original.prompt,negative:original.negative||'',model:original.model||'',seed:original.seed||'',source:original.source,generationType:original.generationType,parameters:clone(original.parameters||{}),name:`${original.name.slice(0,180)} · 副本`});
  return version;
}
