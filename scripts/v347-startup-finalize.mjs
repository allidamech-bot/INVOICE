import { readFile, writeFile } from 'node:fs/promises';

const htmlPath='dist/index.html';
const cssPath='dist/styles/app.bundle.css';
const runtimePath='dist/runtime-config.js';

let html=await readFile(htmlPath,'utf8');
const inlineTheme=/<script id="lourex-theme-bootstrap">[\s\S]*?<\/script>/;
if(!inlineTheme.test(html))throw new Error('v347: production HTML is missing the legacy inline theme bootstrap.');
html=html.replace(inlineTheme,'<script src="./theme-bootstrap-v347.js?v=347"></script>');

if(!html.includes('./startup-watchdog-v321.js?v=321'))throw new Error('v347: startup watchdog script reference was not found.');
html=html.replace('./startup-watchdog-v321.js?v=321','./startup-watchdog-v321.js?v=347');

const runtimeSafety='<script src="./runtime-safety-v334.js?v=344"></script>';
if(!html.includes(runtimeSafety))throw new Error('v347: runtime safety script reference was not found.');
if(!html.includes('storage-cleanup-v347.js')){
  html=html.replace(runtimeSafety,`${runtimeSafety}\n  <script src="./storage-cleanup-v347.js?v=347"></script>`);
}
await writeFile(htmlPath,html);

let css=await readFile(cssPath,'utf8');
const startupCss=await readFile('src/styles/v347-startup-single-layer.css','utf8');
if(!css.includes('LOUREX v347 — startup is one visual layer only.')){
  css+=`\n\n/* --- v347-startup-single-layer.css — final startup owner --- */\n${startupCss.trim()}\n`;
}
await writeFile(cssPath,css);

let runtime=await readFile(runtimePath,'utf8');
const autoReload='window.location.replace(window.location.href);';
if(runtime.includes(autoReload)){
  runtime=runtime.replaceAll(autoReload,"try{window.__LOUREX_DIAGNOSTICS__?.mark?.('startup-service-worker-waiting','automaticReload=no');}catch(_error){}");
}
const autoActivate="try{waiting.postMessage({type:'SKIP_WAITING'});}catch(_error){}";
if(runtime.includes(autoActivate)){
  runtime=runtime.replaceAll(autoActivate,"try{window.__LOUREX_DIAGNOSTICS__?.mark?.('startup-service-worker-waiting','automaticActivation=no automaticReload=no');}catch(_error){}");
}
if(runtime.includes(autoReload)||runtime.includes("waiting.postMessage({type:'SKIP_WAITING'})")){
  throw new Error('v347: automatic stuck-boot service-worker navigation/activation remains in runtime-config.js.');
}
await writeFile(runtimePath,runtime);

const finalHtml=await readFile(htmlPath,'utf8');
const finalCss=await readFile(cssPath,'utf8');
if(finalHtml.includes('<script id="lourex-theme-bootstrap">'))throw new Error('v347: inline theme bootstrap remains in production HTML.');
if(!finalHtml.includes('theme-bootstrap-v347.js?v=347'))throw new Error('v347: external theme bootstrap is not wired.');
if(!finalHtml.includes('storage-cleanup-v347.js?v=347'))throw new Error('v347: safe storage cleanup is not wired.');
if(!finalCss.includes('v347-startup-single-layer.css — final startup owner'))throw new Error('v347: startup single-layer CSS is not final in the production bundle.');

console.log('LOUREX v347 startup finalization applied: single loading layer, CSP-safe theme bootstrap, no automatic stuck-boot reload, safe duplicate-storage cleanup.');
