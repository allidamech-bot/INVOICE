import {readFile,writeFile} from 'node:fs/promises';

const sourcePath='src/styles/batch5-editor-surface-closeout.css';
const targets=['dist/styles/app.bundle.css','dist/styles/v482-mobile-ux-repair.css'];
const previousMarker='/* --- v485-visible-ui-corrections.css --- */';
const marker='/* --- batch5-editor-surface-closeout.css --- */';

const css=(await readFile(sourcePath,'utf8')).trim();
if(!css)throw new Error('Batch 5 editor closeout: source CSS is empty.');
for(const token of ['@media screen','.screen-editor .premium-item-card .item-pricing-grid','.screen-editor .premium-item-card .item-advanced-fields','background:transparent!important','grid-column:1/-1!important']){
  if(!css.includes(token))throw new Error(`Batch 5 editor closeout: missing ${token}.`);
}
for(const forbidden of ['@media print','.invoice-page','.document-page','display:grid!important;\n    grid-template-columns']){
  if(css.includes(forbidden))throw new Error(`Batch 5 editor closeout: forbidden output/behavior token ${forbidden}.`);
}

for(const path of targets){
  let content=await readFile(path,'utf8');
  if(content.includes(marker))throw new Error(`Batch 5 editor closeout: duplicate owner in ${path}.`);
  const previousIndex=content.lastIndexOf(previousMarker);
  if(previousIndex<0)throw new Error(`Batch 5 editor closeout: v485 owner missing from ${path}.`);
  content=`${content.trimEnd()}\n\n${marker}\n${css}\n`;
  await writeFile(path,content);
  const emitted=await readFile(path,'utf8');
  const ownerIndex=emitted.lastIndexOf(marker);
  if(ownerIndex<=previousIndex)throw new Error(`Batch 5 editor closeout: final owner order invalid in ${path}.`);
  if((emitted.match(/\/\* --- batch5-editor-surface-closeout\.css --- \*\//g)||[]).length!==1)throw new Error(`Batch 5 editor closeout: owner must appear exactly once in ${path}.`);
}

console.log('LOUREX Batch 5 editor surface closeout emitted after v485 in bundle + standalone runtime owner.');
