import { readFile, writeFile } from 'node:fs/promises';

const sourcePath='src/styles/v483-mobile-density.css';
const bundlePath='dist/styles/app.bundle.css';
const standalonePath='dist/styles/v482-mobile-ux-repair.css';
const marker='/* --- v483-mobile-density.css --- */';

const css=(await readFile(sourcePath,'utf8')).trim();
if(!css)throw new Error('v483 mobile density: source stylesheet is empty.');
if(!css.includes('.ta-documents-header-actions')||!css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'))throw new Error('v483 mobile density: compact Documents command grid contract is missing.');
if(!css.includes('min-height:48px!important')&&!css.includes('min-height:46px!important'))throw new Error('v483 mobile density: mobile touch target contract is missing.');

for(const path of [bundlePath,standalonePath]){
  let content=await readFile(path,'utf8');
  if(content.includes(marker))throw new Error(`v483 mobile density: duplicate owner marker in ${path}.`);
  content=`${content.trimEnd()}\n\n${marker}\n${css}\n`;
  await writeFile(path,content);
  const emitted=await readFile(path,'utf8');
  if(emitted.lastIndexOf(marker)<emitted.lastIndexOf('v482'))throw new Error(`v483 mobile density: final owner order is invalid in ${path}.`);
}

console.log('LOUREX v483 mobile density owner appended after v482 in bundle + standalone production cascade.');
