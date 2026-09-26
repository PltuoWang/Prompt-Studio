import test from 'node:test';
import assert from 'node:assert/strict';
import {seedLibrary} from '../public/demo.js';
import {clone,createDraft,createVersion,updateVersionField,commitDraft,searchGroups,diffTokens,validateLibrary,removeMedia} from '../public/model.js';

test('saving an explicit draft preserves existing versions and never inherits prompts or result images',()=>{
  const g=seedLibrary().groups[0],before=clone(g.versions),draft=createDraft(g.versions[0]);
  assert.equal(draft.prompt,'');assert.equal(draft.negative,'');
  draft.prompt+=' soft window light';draft.name='柔和光线';draft.note='测试新方向';g.draft=draft;
  const result=commitDraft(g,draft);
  assert.deepEqual(g.versions.slice(0,3),before);
  assert.equal(result.number,4);assert.equal(result.parentId,'p1');
  assert.deepEqual(result.media,[]);assert.equal(g.draft,undefined);
});
test('creating a blank version works alongside a legacy draft without changing previous work',()=>{
  const g=seedLibrary().groups[0];g.draft={...createDraft(g.versions[0]),prompt:'未完成的旧草稿',negative:'旧排除词',media:clone(g.versions[0].media)};
  const before=clone(g),created=createVersion(g,'p2','2026-09-26T12:00:00Z');
  assert.equal(created.number,4);assert.equal(created.parentId,'p2');
  assert.equal(created.prompt,'');assert.equal(created.negative,'');assert.deepEqual(created.media,[]);
  assert.deepEqual(g.versions.slice(0,3),before.versions);assert.deepEqual(g.draft,before.draft);
  assert.equal(validateLibrary({schema:2,groups:[g]}).groups[0].versions.length,4);
});
test('direct prompt edits and clearing stay in the selected version while preserving drafts and other versions',()=>{
  const g=seedLibrary().groups[0];g.draft={...createDraft(g.versions[0]),prompt:'保留的草稿'};
  const before=clone(g);
  updateVersionField(g,'p2','prompt','自由修改当前版本');updateVersionField(g,'p2','negative','新的负面提示词');
  assert.equal(g.versions[1].prompt,'自由修改当前版本');assert.equal(g.versions[1].negative,'新的负面提示词');
  assert.equal(g.versions.length,3);assert.deepEqual(g.draft,before.draft);
  assert.deepEqual(g.versions[0],before.versions[0]);assert.deepEqual(g.versions[2],before.versions[2]);
  assert.deepEqual(g.versions[1].media,before.versions[1].media);
  updateVersionField(g,'p2','prompt','');updateVersionField(g,'p2','negative','');
  assert.equal(validateLibrary({schema:2,groups:[g]}).groups[0].versions[1].prompt,'');
  updateVersionField(g,'draft','prompt','继续草稿');assert.equal(g.draft.prompt,'继续草稿');
  assert.equal(g.versions[0].prompt,before.versions[0].prompt);
});
test('a version can contain images without a prompt; blank versions are rejected',()=>{
  const g=seedLibrary().groups[0],draft=createDraft(g.versions[0]);draft.prompt='   ';
  assert.throws(()=>commitDraft(g,draft),/至少/);
  draft.media=[clone(g.versions[0].media[0])];assert.equal(commitDraft(g,draft).media.length,1);
});
test('committed version owns an independent copy of its draft images',()=>{
  const g=seedLibrary().groups[0],draft=createDraft(g.versions[0]);draft.media=[clone(g.versions[0].media[0])];
  const v=commitDraft(g,draft);draft.media[0].name='changed';assert.notEqual(v.media[0].name,'changed');
});
test('deleting a result image only changes the selected version, preserving prompts and shared references elsewhere',()=>{
  const g=seedLibrary().groups[0],before=clone(g);
  g.versions[1].media=[clone(g.versions[0].media[0])];
  const removed=removeMedia(g,'p1',g.versions[0].media[0].id);
  assert.equal(g.versions[0].media.length,0);
  assert.equal(g.versions[0].prompt,before.versions[0].prompt);
  assert.deepEqual(g.versions[1].media,[removed]);
  assert.equal(g.versions.length,3);
  assert.equal(validateLibrary({schema:2,groups:[g]}).groups.length,1);
});
test('draft image deletion cannot remove parent images, and stale or trashed targets are rejected',()=>{
  const g=seedLibrary().groups[0];g.draft=createDraft(g.versions[0]);g.draft.media=clone(g.versions[0].media);
  removeMedia(g,'draft',g.draft.media[0].id);
  assert.equal(g.draft.media.length,0);assert.equal(g.versions[0].media.length,1);
  const before=clone(g);assert.throws(()=>removeMedia(g,'draft','missing'),/不存在/);assert.deepEqual(g,before);
  g.deletedAt=new Date().toISOString();assert.throws(()=>removeMedia(g,'p1',g.versions[0].media[0].id),/回收站/);
});
test('search includes historical prompts, negative prompts and source filters',()=>{
  const groups=seedLibrary().groups;
  assert.equal(searchGroups(groups,'ivory').length,1);
  assert.equal(searchGroups(groups,'watermark').length,6);
  assert.equal(searchGroups(groups,'','all','','Codex').length,2);
  assert.equal(searchGroups(groups,'','favorites').length,3);
  groups[0].deletedAt=new Date().toISOString();
  assert.equal(searchGroups(groups,'ivory').length,0);assert.equal(searchGroups(groups,'ivory','trash').length,1);
});
test('diff reconstructs both versions, including Chinese and whitespace',()=>{
  for(const [a,b] of [['白色背景，柔和光线','黑色背景，柔和的光线'],['a  b, c','a b, warm c'],['','something'],['same','same']]){
    const diff=diffTokens(a,b);
    assert.equal(diff.filter(t=>t.type!=='added').map(t=>t.text).join(''),a);
    assert.equal(diff.filter(t=>t.type!=='removed').map(t=>t.text).join(''),b);
  }
});
test('very long prompts use a bounded diff and preserve both versions',()=>{
  const a='soft light '.repeat(1200),b=a+' 中文变化',diff=diffTokens(a,b);
  assert.equal(diff.filter(t=>t.type!=='added').map(t=>t.text).join(''),a);
  assert.equal(diff.filter(t=>t.type!=='removed').map(t=>t.text).join(''),b);
});
test('backup validator rejects external image URLs and malformed draft references',()=>{
  const library=seedLibrary();assert.equal(validateLibrary(library),library);
  const bad=clone(library);bad.groups[0].versions[0].media[0].src='https://example.com/private.png';
  assert.throws(()=>validateLibrary(bad),/作品/);
  const draft=clone(library);draft.groups[0].draft=createDraft(draft.groups[0].versions[0]);draft.groups[0].draft.parentId='missing';
  assert.throws(()=>validateLibrary(draft),/草稿/);
  const unsafe=clone(library);unsafe.groups[0].id='\" onclick=\"';assert.throws(()=>validateLibrary(unsafe),/格式/);
});
