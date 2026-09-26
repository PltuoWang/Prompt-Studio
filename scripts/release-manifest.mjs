import {readdir} from 'node:fs/promises';
import path from 'node:path';
export async function releaseFiles(root){
  async function files(directory){
    const result=[];
    for(const entry of await readdir(path.join(root,directory),{withFileTypes:true})){
      const relative=path.posix.join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error(`Symlinks cannot be released: ${relative}`);
      if(entry.isDirectory())result.push(...await files(relative));else result.push(relative);
    }
    return result;
  }
  const publicFiles=await files('public');
  if(publicFiles.some(file=>!/^public\/(?:[a-z0-9-]+\.(?:js|css|html)|assets\/[a-z0-9-]+\.svg)$/.test(file)))throw new Error('Unexpected public file; review before publishing');
  const runtime=['package.json','server.mjs','launcher.mjs','media-store.mjs','backups.mjs','export-files.mjs','Start Prompt Studio.cmd','README.md','COPYRIGHT','CHANGELOG.md','RELEASE-NOTES.md',...publicFiles];
  const tests=(await files('tests')).filter(file=>file.endsWith('.mjs'));
  const source=[...runtime,'.gitignore','.vscode/launch.json','ARCHITECTURE.md','TEST-RESULTS.md','scripts/create-art.mjs','scripts/build-release.mjs','scripts/release-manifest.mjs',...tests];
  return {runtime:runtime.sort(),source:source.sort()};
}
