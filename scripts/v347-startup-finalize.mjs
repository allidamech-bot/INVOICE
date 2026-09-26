import { readFile, writeFile } from 'node:fs/promises';

const htmlPath='dist/index.html';
const cssPath='dist/styles/app.bundle.css';
const runtimePath='dist/runtime-config.js';
const swPath='dist/sw.js';

let html=await readFile(htmlPath,'utf8');
const inlineTheme=/<script id="lourex-theme-bootstrap">[\s\S]*?<\/script>/;
if(!inlineTheme.test(html))throw new Error('v347: production HTML is missing the legacy inline theme bootstrap.');
html=html.replace(inlineTheme,'<script src="./theme-bootstrap-v347.js?v=347"></script>');

const oldWatchdog='./startup-watchdog-v321.js?v=321';
const newWatchdog='./startup-watchdog-v321.js?v=347';
if(!html.includes(oldWatchdog))throw new Error('v347: startup watchdog script reference was not found.');
html=html.replaceAll(oldWatchdog,newWatchdog);

const runtimeSafety='<script src="./runtime-safety-v334.js?v=344"></script>';
if(!html.includes(runtimeSafety))throw new Error('v347: runtime safety script reference was not found.');
if(!html.includes('storage-cleanup-v347.js')){
  html=html.replace(runtimeSafety,`${runtimeSafety}\n  <script src="./storage-cleanup-v347.js?v=347"></script>`);
}
const iosOutputBridge='<script src="./ios-print-bridge.js"></script>';
if(!html.includes(iosOutputBridge))throw new Error('v350: iOS output bridge reference was not found.');
if(!html.includes('mobile-preview-output-v350.js')){
  html=html.replace(iosOutputBridge,`${iosOutputBridge}\n  <script src="./mobile-preview-output-v350.js?v=350"></script>`);
}
await writeFile(htmlPath,html);

/* v350 ownership order inside the single production CSS bundle:
   application palette first, then the startup owner last. Neither is a runtime
   @import, so Safari never sees a late network-delivered recolor layer. */
let css=await readFile(cssPath,'utf8');
const paletteCss=await readFile('src/styles/v346-template-color-visual-closeout.css','utf8');
const startupCss=await readFile('src/styles/v347-startup-single-layer.css','utf8');
if(!css.includes('v346-template-color-visual-closeout.css — application palette owner')){
  css+=`\n\n/* --- v346-template-color-visual-closeout.css — application palette owner --- */\n${paletteCss.trim()}\n`;
}
if(!css.includes('v347-startup-single-layer.css — final startup owner')){
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

/* v347/v350 run after the normal precache passes. Keep final HTML and SW cache in
   lockstep so non-iOS/offline launches never reference uncached runtime assets. */
let sw=await readFile(swPath,'utf8');
sw=sw.replaceAll(oldWatchdog,newWatchdog);
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
if(!sw.includes(cacheMarker))throw new Error('v347: service-worker cache insertion marker is missing.');
for(const asset of ['./theme-bootstrap-v347.js?v=347','./storage-cleanup-v347.js?v=347','./mobile-preview-output-v350.js?v=350']){
  if(!sw.includes(`LOCAL_CORE.push('${asset}');`))sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${asset}');\n${cacheMarker}`);
}
await writeFile(swPath,sw);

const finalHtml=await readFile(htmlPath,'utf8');
const finalCss=await readFile(cssPath,'utf8');
const finalSw=await readFile(swPath,'utf8');
if(finalHtml.includes('<script id="lourex-theme-bootstrap">'))throw new Error('v347: inline theme bootstrap remains in production HTML.');
if(!finalHtml.includes('theme-bootstrap-v347.js?v=347'))throw new Error('v347: external theme bootstrap is not wired.');
if(!finalHtml.includes('storage-cleanup-v347.js?v=347'))throw new Error('v347: safe storage cleanup is not wired.');
if(!finalHtml.includes('mobile-preview-output-v350.js?v=350'))throw new Error('v350: mobile preview output validation bridge is not wired.');
if(!finalHtml.includes(newWatchdog))throw new Error('v347: cache-busted startup watchdog is not wired.');
if(!finalCss.includes('v346-template-color-visual-closeout.css — application palette owner'))throw new Error('v350: application palette is not bundled explicitly.');
if(!finalCss.includes('v347-startup-single-layer.css — final startup owner'))throw new Error('v347: startup single-layer CSS is not final in the production bundle.');
if(/@import\s+url\([^)]*v346-template-color-visual-closeout/i.test(finalCss))throw new Error('v350: late v346 runtime @import remains in the production bundle.');
for(const asset of [newWatchdog,'./theme-bootstrap-v347.js?v=347','./storage-cleanup-v347.js?v=347','./mobile-preview-output-v350.js?v=350']){
  if(!finalSw.includes(asset))throw new Error(`v350: service worker is missing ${asset}.`);
}

console.log('LOUREX v350 startup finalization applied: explicit palette bundle, single loading owner, no automatic stuck-boot reload, safe storage cleanup, mobile Preview output feedback, final PWA precache aligned.');
