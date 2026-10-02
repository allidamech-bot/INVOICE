import { readFile, writeFile } from 'node:fs/promises';

const sourcePath='src/styles/v484-responsive-visual-hierarchy.css';
const bundlePath='dist/styles/app.bundle.css';
const standalonePath='dist/styles/v482-mobile-ux-repair.css';
const marker='/* --- v484-responsive-visual-hierarchy.css --- */';

const css=(await readFile(sourcePath,'utf8')).trim();
if(!css)throw new Error('v484 visual hierarchy: source stylesheet is empty.');
if(!css.includes('@media screen and (min-width:901px)'))throw new Error('v484 visual hierarchy: iPad/desktop activation contract is missing.');
if(!css.includes('.ta-documents-header-actions')||!css.includes('margin-inline:auto!important'))throw new Error('v484 visual hierarchy: centered Documents actions contract is missing.');
if(!css.includes('--lx484-surface:#0f1d2d')||!css.includes('--lx484-surface-2:#13243a'))throw new Error('v484 visual hierarchy: dark surface separation tokens are missing.');

for(const path of [bundlePath,standalonePath]){
  let content=await readFile(path,'utf8');
  if(content.includes(marker))throw new Error(`v484 visual hierarchy: duplicate owner marker in ${path}.`);
  content=`${content.trimEnd()}\n\n${marker}\n${css}\n`;
  await writeFile(path,content);
  const emitted=await readFile(path,'utf8');
  const v483Index=emitted.lastIndexOf('/* --- v483-mobile-density.css --- */');
  const v484Index=emitted.lastIndexOf(marker);
  if(v484Index<0||v484Index<=v483Index)throw new Error(`v484 visual hierarchy: final owner order is invalid in ${path}.`);
}

console.log('LOUREX v484 responsive visual owner appended after v483 in bundle + standalone production cascade.');
