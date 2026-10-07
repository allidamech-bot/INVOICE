import {readFile,writeFile} from 'node:fs/promises';

const dir='dist/styles/';
const entry='v331-draft-scroll-recovery.css';
const importRule=/^[ \t]*@import\s+url\(["']\.\/([A-Za-z0-9-]+\.css)(?:\?[^"']*)?["']\);[ \t]*\r?\n?/gm;
const allowed=new Set([
  'v331-draft-scroll-recovery.css',
  'v333-critical-documents-visual-functional-closeout.css',
  'v337-template-layout-balance.css',
  'v364-document-template-layout-refinement.css',
  'v365-mobile-editor-scroll-draft-templates.css'
]);
const expanded=[];
async function inline(name,stack=[]){
  if(!allowed.has(name))throw new Error(`Unknown document CSS import: ${name}`);
  if(stack.includes(name))throw new Error(`Circular document CSS import: ${[...stack,name].join(' -> ')}`);
  if(expanded.includes(name))throw new Error(`Duplicate document CSS owner: ${name}`);
  expanded.push(name);
  const source=await readFile(dir+name,'utf8');
  let compiled='',last=0;
  for(const match of source.matchAll(importRule)){
    const child=match[1];
    compiled+=source.slice(last,match.index);
    compiled+=`/* document dependency: ${child} */\n${await inline(child,[...stack,name])}\n`;
    last=match.index+match[0].length;
  }
  compiled+=source.slice(last);
  if(/@import\b/.test(compiled))throw new Error(`Unresolved import in ${name}`);
  return compiled;
}
const flat=await inline(entry);
for(const expected of allowed)if(!expanded.includes(expected))throw new Error(`Expected document dependency not included: ${expected}`);
await writeFile(dir+entry,flat);
const saved=await readFile(dir+entry,'utf8');
if(saved!==flat||/@import\b/.test(saved))throw new Error('Document CSS flatten verification failed');
console.log(`LOUREX document CSS: ${expanded.length} owner files resolved into one v331 stylesheet, with no runtime @import dependencies.`);
