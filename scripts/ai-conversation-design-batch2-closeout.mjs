import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const target='dist/ai-composer-v449.js';
let source=await readFile(target,'utf8');
if(!source.includes('__lourexConversationDesignBatch2'))throw new Error('Batch 2 closeout requires the interaction consolidation runtime.');
if(source.includes('__lourexConversationDesignBatch2Closeout'))throw new Error('Batch 2 closeout already installed.');
const triggerToken="trigger.querySelector('.lourex-ai-scope-trigger-label').textContent=active?.textContent?.trim()||(isAr()?'الأعمال':'Business');";
const triggerReplacement="const triggerLabel=trigger.querySelector('.lourex-ai-scope-trigger-label'),nextTriggerLabel=active?.textContent?.trim()||(isAr()?'الأعمال':'Business');if(triggerLabel instanceof HTMLElement&&triggerLabel.textContent!==nextTriggerLabel)triggerLabel.textContent=nextTriggerLabel;";
if(!source.includes(triggerToken))throw new Error('Batch 2 closeout could not find trigger-label sync.');
source=source.replace(triggerToken,triggerReplacement);
const optionToken="const source=native[index];\n    option.textContent=source?.textContent?.trim()||option.textContent;";
const optionReplacement="const source=native[index],nextLabel=source?.textContent?.trim()||option.textContent;\n    if(option.textContent!==nextLabel)option.textContent=nextLabel;";
if(!source.includes(optionToken))throw new Error('Batch 2 closeout could not find option-label sync.');
source=source.replace(optionToken,optionReplacement);
const escapeToken=String.raw`document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const root=panel()?.querySelector('.lourex-ai-scopes[data-lourex-scope-selector="2"]');
  if(root instanceof HTMLElement&&root.querySelector('.lourex-ai-scope-menu:not([hidden])')){event.preventDefault();event.stopPropagation();closeScopeMenu(root,true);}
},true);`;
const escapeReplacement=String.raw`document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const root=panel()?.querySelector('.lourex-ai-scopes[data-lourex-scope-selector="2"]');
  if(root instanceof HTMLElement&&event.target instanceof Element&&event.target.closest('[role="dialog"][aria-modal="true"]')===panel()&&root.querySelector('.lourex-ai-scope-menu:not([hidden])')){event.preventDefault();event.stopImmediatePropagation();closeScopeMenu(root,true);}
},true);`;
if(!source.includes(escapeToken))throw new Error('Batch 2 closeout could not find the scope Escape owner.');
source=source.replace(escapeToken,escapeReplacement);
source+='\nconst __lourexConversationDesignBatch2Closeout=true;\n';
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
console.log('[LOUREX] AI Conversation Design Batch 2 closeout installed: scope selector sync is mutation-stable.');
