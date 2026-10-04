import {readFile,writeFile} from 'node:fs/promises';

const target='dist/styles/app.bundle.css';
let css=await readFile(target,'utf8');
if(!css.includes('LOUREX AI Batch 3 — Premium Conversation Experience'))throw new Error('Batch 3 premium conversation CSS must be installed first.');
if(css.includes('LOUREX AI Batch 3 — Mobile Panel Fit'))throw new Error('Batch 3 mobile panel fit already installed.');

css+=`\n/* LOUREX AI Batch 3 — Mobile Panel Fit */\n@media(max-width:720px){\n  html body #lourex-ai-panel,html body #lourex-ai-panel[dir=rtl]{\n    box-sizing:border-box!important;\n    inset:0!important;\n    width:100vw!important;\n    max-width:none!important;\n    height:100dvh!important;\n    max-height:none!important;\n    margin:0!important;\n  }\n}\n`;

await writeFile(target,css);
console.log('[LOUREX AI] Batch 3 mobile panel uses border-box full-viewport geometry.');
