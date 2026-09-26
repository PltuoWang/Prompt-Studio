import test from 'node:test';
import assert from 'node:assert/strict';
import {ratioLabel,fitCrop,moveCrop,resizeCrop,pixelCrop} from '../public/image-utils.js';

test('image ratios distinguish exact and approximate common formats',()=>{
  assert.equal(ratioLabel(1080,1920),'9:16');assert.equal(ratioLabel(960,720),'4:3');
  assert.equal(ratioLabel(1001,751),'≈ 4:3');assert.equal(ratioLabel(800,800),'1:1');
  assert.equal(ratioLabel(0,720),'尺寸未知');assert.equal(ratioLabel(700,500),'7:5');
});
test('preset crops stay within the source and preserve aspect ratios',()=>{
  for(const [w,h] of [[960,720],[720,960],[31,73],[1920,1080]])for(const aspect of [9/16,16/9,4/3,3/4,1]){
    const rect=fitCrop(w,h,aspect);assert.ok(rect.x>=0&&rect.y>=0);
    assert.ok(rect.x+rect.width<=w+1e-8&&rect.y+rect.height<=h+1e-8);
    assert.ok(Math.abs(rect.width/rect.height-aspect)<1e-8);
    const pixels=pixelCrop(rect,w,h);assert.ok(pixels.width>0&&pixels.height>0&&pixels.x+pixels.width<=w&&pixels.y+pixels.height<=h);
  }
});
test('moving and resizing are clamped without changing a locked ratio',()=>{
  const rect=fitCrop(960,720,9/16),moved=moveCrop(rect,-9999,9999,960,720);
  assert.equal(moved.x,0);assert.equal(moved.y,0);
  for(const corner of ['nw','ne','sw','se'])for(const [dx,dy] of [[150,100],[-200,-100],[3000,3000],[-5000,20]]){
    const result=resizeCrop(rect,dx,dy,corner,960,720,9/16);
    assert.ok(result.x>=-1e-8&&result.y>=-1e-8&&result.width>0&&result.height>0);
    assert.ok(result.x+result.width<=960+1e-8&&result.y+result.height<=720+1e-8);
    assert.ok(Math.abs(result.width/result.height-9/16)<1e-8);
  }
});
