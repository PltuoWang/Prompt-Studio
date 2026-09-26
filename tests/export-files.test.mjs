import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {exportFolder,safeFilename,saveVersionFiles} from '../export-files.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),publicDir=path.join(root,'public');
async function directory(){await mkdir(path.join(root,'test-output'),{recursive:true});return mkdtemp(path.join(root,'test-output','export-'));}
test('image and prompt exports share a safe name and preserve original bytes and both prompts',async()=>{
  const folder=await directory(),bytes=Buffer.from('original image bytes'),picture={src:`data:image/png;base64,${bytes.toString('base64')}`};
  const result=await saveVersionFiles({folder,name:'照片/探索:V1',picture,version:{prompt:'窗边的光\n自然构图',negative:'模糊，水印'},publicDir});
  assert.deepEqual(result.files.map(file=>file.name),['照片_探索_V1.png','照片_探索_V1.txt']);
  assert.deepEqual(await readFile(result.files[0].path),bytes);
  assert.equal(await readFile(result.files[1].path,'utf8'),'窗边的光\n自然构图\n\n【负面提示词】\n模糊，水印\n');
});
test('existing files remain intact and concurrent exports reserve matching file pairs',async()=>{
  const folder=await directory();await writeFile(path.join(folder,'配对.txt'),'existing');
  const options={folder,name:'配对',picture:{src:'/assets/perfume-1.svg'},version:{prompt:'new',negative:''},publicDir};
  const results=await Promise.all([saveVersionFiles(options),saveVersionFiles(options)]);
  assert.equal(await readFile(path.join(folder,'配对.txt'),'utf8'),'existing');
  assert.equal(new Set(results.map(result=>result.stem)).size,2);
  for(const result of results){assert.equal(path.parse(result.files[0].name).name,path.parse(result.files[1].name).name);assert.equal(await readFile(result.files[1].path,'utf8'),'new\n');}
  assert.equal((await readdir(folder)).includes('配对.svg'),false);
});
test('prompt-only exports work while invalid folders and blank content are rejected',async()=>{
  const folder=await directory();
  const result=await saveVersionFiles({folder,name:'只有提示词',version:{prompt:'',negative:'不要水印'},publicDir});
  assert.deepEqual(result.files.map(file=>file.name),['只有提示词.txt']);
  assert.throws(()=>exportFolder('relative/path'),/完整路径/);
  assert.equal(safeFilename('CON'),'_CON');assert.throws(()=>safeFilename('...'),/有效/);
  await assert.rejects(()=>saveVersionFiles({folder,name:'empty',version:{prompt:'',negative:''},publicDir}),/请先添加/);
});
