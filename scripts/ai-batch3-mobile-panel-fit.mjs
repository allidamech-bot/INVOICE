import {readFile,writeFile} from 'node:fs/promises';

const target='dist/styles/app.bundle.css';
let css=await readFile(target,'utf8');
if(!css.includes('LOUREX AI Batch 3 — Premium Conversation Experience'))throw new Error('Batch 3 premium conversation CSS must be installed first.');
if(css.includes('LOUREX AI Batch 3 — Mobile Panel Fit'))throw new Error('Batch 3 mobile panel fit already installed.');

// v482 owns the prior mobile geometry with the highly-specific selector
// html body #lourex-ai-panel.lourex-ai-panel and !important declarations.
// Match that specificity (and remain later in the cascade) so Batch 3 can
// intentionally promote the advisor to a true full-viewport mobile surface.
css+=`\n/* LOUREX AI Batch 3 — Mobile Panel Fit */\n@media(max-width:720px){\n  html body #lourex-ai-panel.lourex-ai-panel,\n  html body #lourex-ai-panel.lourex-ai-panel[dir=rtl]{\n    box-sizing:border-box!important;\n    inset:0!important;\n    width:100vw!important;\n    max-width:none!important;\n    height:100dvh!important;\n    max-height:none!important;\n    margin:0!important;\n  }\n}\n`;

if(!css.includes('html body #lourex-ai-panel.lourex-ai-panel'))throw new Error('Batch 3 mobile panel selector lost legacy-owner specificity.');
await writeFile(target,css);
console.log('[LOUREX AI] Batch 3 mobile panel overrides legacy inset with matching specificity and full-viewport border-box geometry.');
