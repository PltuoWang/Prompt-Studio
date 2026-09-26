// Copyright (c) 2026 Haifeng. All rights reserved.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,copyFile,lstat,rename,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {APP_INFO} from '../public/version.js';
import {releaseFiles} from './release-manifest.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(process.platform!=='win32')throw new Error('Build the Windows portable release on Windows.');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(pkg.version!==APP_INFO.version)throw new Error('App and package versions do not match');
const nodeVersion='24.21.0',runtimeName=`node-v${nodeVersion}-win-x64`,cache=path.join(root,'test-output','release-cache'),dist=path.join(root,'dist');
await mkdir(cache,{recursive:true});await mkdir(dist,{recursive:true});
function powershell(script,env){const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; ${script}`],{encoding:'utf8',windowsHide:true,env:{...process.env,...env}});if(result.status!==0)throw new Error(result.stderr||result.stdout||'Archive operation failed');}
async function sha256(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function download(url,file){
  if(await lstat(file).then(info=>info.isFile()).catch(()=>false))return;
  const response=await fetch(url);if(!response.ok)throw new Error(`Download failed: ${url} (${response.status})`);
  const temporary=`${file}.${randomUUID()}.tmp`;
  try{await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary,{flags:'wx'}));await rename(temporary,file);}finally{await rm(temporary,{force:true});}
}
const nodeZip=path.join(cache,`${runtimeName}.zip`),sumsFile=path.join(cache,'node-SHASUMS256.txt');
await download(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`,sumsFile);
await download(`https://nodejs.org/dist/v${nodeVersion}/${runtimeName}.zip`,nodeZip);
const expected=(await readFile(sumsFile,'utf8')).split(/\r?\n/).find(line=>line.trim().endsWith(` ${runtimeName}.zip`))?.split(/\s+/)[0];
if(!expected||await sha256(nodeZip)!==expected)throw new Error('Node.js SHA-256 checksum mismatch');
const manifests=await releaseFiles(root),buildRoot=path.resolve(dist,`.build-${randomUUID()}`);
if(!buildRoot.startsWith(path.resolve(dist)+path.sep))throw new Error('Build path outside dist');
await mkdir(buildRoot);
const stem=`Prompt-Studio-v${APP_INFO.version}`,artifacts=[];
try{
  for(const [flavor,list] of [['source',manifests.source],['windows-x64',manifests.runtime]]){
    const name=`${stem}-${flavor}`,packageRoot=path.join(buildRoot,name);
    await mkdir(packageRoot);
    for(const relative of list){const target=path.join(packageRoot,relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,relative),target);}
    if(flavor==='windows-x64'){
      await mkdir(path.join(packageRoot,'runtime'));
      powershell("Add-Type -AssemblyName System.IO.Compression.FileSystem; $taskZip=[IO.Compression.ZipFile]::OpenRead($env:PS_NODE_ZIP); try { foreach($taskName in @('node.exe','LICENSE')) { $taskEntry=$taskZip.GetEntry($env:PS_NODE_PREFIX+'/'+$taskName); if(!$taskEntry){throw 'Missing Node.js runtime file'}; [IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry,[IO.Path]::Combine($env:PS_PACKAGE_ROOT,'runtime',$taskName),$false) } } finally { $taskZip.Dispose() }",{PS_NODE_ZIP:nodeZip,PS_NODE_PREFIX:runtimeName,PS_PACKAGE_ROOT:packageRoot});
      await writeFile(path.join(packageRoot,'runtime','ORIGIN.txt'),`Node.js ${nodeVersion}, Windows x64\nSource: https://nodejs.org/dist/v${nodeVersion}/${runtimeName}.zip\nSHA256: ${expected}\nLicense: runtime/LICENSE\n`);
    }
    const output=path.join(dist,`${name}.zip`),temporary=path.join(dist,`${name}.${randomUUID()}.tmp`);
    powershell('Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:PS_PACKAGE_ROOT,$env:PS_ARCHIVE,[IO.Compression.CompressionLevel]::Optimal,$true)',{PS_PACKAGE_ROOT:packageRoot,PS_ARCHIVE:temporary});
    await rename(temporary,output);artifacts.push({name:path.basename(output),sha256:await sha256(output),bytes:(await lstat(output)).size});
  }
  await writeFile(path.join(dist,'SHA256SUMS.txt'),artifacts.map(file=>`${file.sha256}  ${file.name}`).join('\n')+'\n');
  await copyFile(path.join(root,'RELEASE-NOTES.md'),path.join(dist,'RELEASE-NOTES.md'));
  await writeFile(path.join(dist,'release-manifest.json'),JSON.stringify({version:APP_INFO.version,nodeVersion,sourceFiles:manifests.source,runtimeFiles:manifests.runtime,artifacts},null,2));
  console.log(JSON.stringify({version:APP_INFO.version,artifacts},null,2));
}finally{
  // Only the unique staging directory created by this build is removed.
  if(path.dirname(buildRoot)!==path.resolve(dist)||!path.basename(buildRoot).startsWith('.build-'))throw new Error('Invalid staging cleanup path');
  await rm(buildRoot,{recursive:true,force:true});
}
