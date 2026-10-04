import {readFile,writeFile} from 'node:fs/promises';

const targets=['dist/styles/app.bundle.css','dist/styles/v482-mobile-ux-repair.css'];
const marker='LOUREX AI Batch 3 — Mobile Panel Fit';
const patch=`\n/* ${marker} */\n@media(max-width:720px){\n  html body #lourex-ai-panel.lourex-ai-panel,\n  html body #lourex-ai-panel.lourex-ai-panel[dir=rtl]{\n    box-sizing:border-box!important;\n    inset:0!important;\n    width:100vw!important;\n    max-width:none!important;\n    height:100dvh!important;\n    max-height:none!important;\n    margin:0!important;\n  }\n}\n`;

for(const target of targets){
  let css=await readFile(target,'utf8');
  if(target.endsWith('app.bundle.css')&&!css.includes('LOUREX AI Batch 3 — Premium Conversation Experience'))throw new Error('Batch 3 premium conversation CSS must be installed first.');
  if(css.includes(marker))throw new Error(`Batch 3 mobile panel fit already installed in ${target}.`);
  css+=patch;
  if(!css.includes('html body #lourex-ai-panel.lourex-ai-panel'))throw new Error(`Batch 3 mobile panel selector lost legacy-owner specificity in ${target}.`);
  await writeFile(target,css);
}

console.log('[LOUREX AI] Batch 3 mobile panel fit appended after both bundled and standalone v482 mobile owners.');
