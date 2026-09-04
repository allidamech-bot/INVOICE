import { readFile, access } from 'node:fs/promises';

const html=await readFile('index.html','utf8');
const linkPattern=/<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>/g;
const styles=[...html.matchAll(linkPattern)].map(match=>match[1]);

function fail(message){throw new Error(`CSS architecture audit failed: ${message}`);}
function assert(condition,message){if(!condition)fail(message);}

assert(styles.length>0,'index.html has no local stylesheet layers');
assert(new Set(styles).size===styles.length,'index.html contains duplicate local stylesheet links');
assert(styles.at(-1)==='document-premium-redesign-v141.css','canonical printable v141 layer must be last');

const designIndex=styles.indexOf('design-system-v164.css');
const documentIndex=styles.indexOf('document-premium-redesign-v141.css');
assert(designIndex>=0,'design-system-v164.css is missing');
assert(designIndex===documentIndex-1,'design-system-v164.css must be the final application layer immediately before printable v141');

await Promise.all(styles.map(async name=>{
  try{await access(`src/styles/${name}`);}catch{fail(`missing stylesheet src/styles/${name}`);}
}));

const canonicalApplicationLayers=[
  'app-shell-v161.css',
  'dashboard-documents.css',
  'editor-workspace-v162.css',
  'settings-account-v163.css',
  'design-system-v164.css'
];
for(const name of canonicalApplicationLayers){
  assert(styles.includes(name),`${name} is not loaded by the application`);
  assert(styles.indexOf(name)<documentIndex,`${name} must stay below the printable document layer`);
  const css=await readFile(`src/styles/${name}`,'utf8');
  for(const forbidden of [/\.invoice-page\b/,/\.invoice-pages\b/,/\.doc-body\b/,/\.doc-title\b/,/\.party-grid\b/,/\.header-modern\b/]){
    assert(!forbidden.test(css),`${name} leaks into printable document internals (${forbidden})`);
  }
}

const designSystem=await readFile('src/styles/design-system-v164.css','utf8');
assert(!designSystem.includes('!important'),'canonical design system must not escalate specificity with !important');
assert((designSystem.match(/:where\(/g)||[]).length>=12,'canonical design system must use low-specificity shared primitives');
for(const token of ['--ui-brand-950','--ui-surface','--ui-border','--ui-text','--ui-success','--ui-danger','--ui-control-lg','--ui-shadow-md']){
  assert(designSystem.includes(token),`design token ${token} is missing`);
}
for(const legacyBridge of ['--navy:var(--ui-brand-950)','--gold:var(--ui-accent-600)','--line:var(--ui-border)','--danger:var(--ui-danger)']){
  assert(designSystem.includes(legacyBridge),`legacy token bridge ${legacyBridge} is missing`);
}

const documentCss=await readFile('src/styles/document-premium-redesign-v141.css','utf8');
for(const forbidden of [/\.app-ui\b/,/\.workspace-shell\b/,/\.workspace-content\b/,/\.editor-screen\b/,/\.settings-workspace-v2\b/,/\.documents-workspace-v2\b/]){
  assert(!forbidden.test(documentCss),`printable v141 leaks into application UI (${forbidden})`);
}

const recentOrder=['app-shell-v161.css','dashboard-documents.css','editor-workspace-v162.css','settings-account-v163.css','design-system-v164.css'];
for(let index=1;index<recentOrder.length;index++){
  assert(styles.indexOf(recentOrder[index-1])<styles.indexOf(recentOrder[index]),`${recentOrder[index]} is out of canonical application order`);
}

console.log(`CSS architecture audit passed: ${styles.length} source layers, ${canonicalApplicationLayers.length} canonical application layers, one final printable layer.`);
