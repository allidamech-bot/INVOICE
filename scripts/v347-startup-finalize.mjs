import { readFile, writeFile } from 'node:fs/promises';

const htmlPath='dist/index.html';
const cssPath='dist/styles/app.bundle.css';
const runtimePath='dist/runtime-config.js';
const entryPath='dist/document-entry-v302.js';
const swPath='dist/sw.js';

let html=await readFile(htmlPath,'utf8');
const inlineTheme=/<script id="lourex-theme-bootstrap">[\s\S]*?<\/script>/;
if(!inlineTheme.test(html))throw new Error('v347: production HTML is missing the legacy inline theme bootstrap.');
const themeBootstrap='./theme-bootstrap-v347.js?v=351';
html=html.replace(inlineTheme,`<script src="${themeBootstrap}"></script>`);

/* The parser can paint the static boot surface before any application module runs.
   Normalize that literal HTML/CSS palette too so there is no one-frame blue/gray
   generation between navigation and the canonical v351 turquoise application. */
const legacyLightBoot='html[data-ui-theme="light"]{--boot-bg:#f9fafb;--boot-text:#101828;--boot-track:#e4e7ec;--boot-accent:#465fff}';
const canonicalLightBoot='html[data-ui-theme="light"]{--boot-bg:#f4f7fb;--boot-text:#102235;--boot-track:#c3d1dc;--boot-accent:#129da1}';
const legacyDarkBoot='html[data-ui-theme="dark"]{--boot-bg:#0c111d;--boot-text:#f9fafb;--boot-track:#344054;--boot-accent:#7592ff}';
const canonicalDarkBoot='html[data-ui-theme="dark"]{--boot-bg:#081321;--boot-text:#f7fbff;--boot-track:#354c67;--boot-accent:#4ed4d0}';
if(!html.includes(legacyLightBoot)||!html.includes(legacyDarkBoot))throw new Error('v351: expected legacy inline boot palette was not found for canonicalization.');
html=html
  .replace('<meta name="theme-color" content="#0c111d" />','<meta name="theme-color" content="#081321" />')
  .replace(legacyLightBoot,canonicalLightBoot)
  .replace(legacyDarkBoot,canonicalDarkBoot)
  .replaceAll('var(--boot-bg,#0c111d)','var(--boot-bg,#081321)')
  .replaceAll('var(--boot-track,#344054)','var(--boot-track,#354c67)')
  .replaceAll('var(--boot-accent,#7592ff)','var(--boot-accent,#4ed4d0)');

const oldWatchdog='./startup-watchdog-v321.js?v=321';
const newWatchdog='./startup-watchdog-v321.js?v=347';
if(!html.includes(oldWatchdog))throw new Error('v347: startup watchdog script reference was not found.');
html=html.replaceAll(oldWatchdog,newWatchdog);

const oldPresentationGuard='./home-final-closeout-v286.js?v=320';
const newPresentationGuard='./home-final-closeout-v286.js?v=351';
if(!html.includes(oldPresentationGuard))throw new Error('v351: presentation guard script reference was not found.');
html=html.replaceAll(oldPresentationGuard,newPresentationGuard);

const oldDocumentEntry='./document-entry-v302.js?v=337-3';
const newDocumentEntry='./document-entry-v302.js?v=351';
if(!html.includes(oldDocumentEntry))throw new Error('v351: document-entry runtime reference was not found.');
html=html.replaceAll(oldDocumentEntry,newDocumentEntry);

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
   build.mjs inserts the application palette explicitly immediately before the
   reliability bridge. Finalization owns only the startup layer and appends that
   once at the very end, so there is no duplicate palette and no runtime @import. */
let css=await readFile(cssPath,'utf8');
const paletteMarker='/* --- v346-template-color-visual-closeout.css --- */';
const startupMarker='/* --- v347-startup-single-layer.css — final startup owner --- */';
if(!css.includes(paletteMarker))throw new Error('v350: explicit application palette owner is missing from the production bundle.');
const startupCss=await readFile('src/styles/v347-startup-single-layer.css','utf8');
if(!css.includes(startupMarker))css+=`\n\n${startupMarker}\n${startupCss.trim()}\n`;
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

/* document-entry historically repainted the active boot canvas with the pre-v351
   gray/navy colors whenever its reconciliation loop ran. Keep the behavior but
   resolve it to the same canonical palette used by bootstrap/ui-theme/v346. */
let entry=await readFile(entryPath,'utf8');
entry=entry.replaceAll("const bootBackground=dark?'#0c111d':'#f9fafb';","const bootBackground=dark?'#081321':'#f4f7fb';");
if(entry.includes("const bootBackground=dark?'#0c111d':'#f9fafb';"))throw new Error('v351: stale document-entry boot canvas colors remain.');
if(!entry.includes("const bootBackground=dark?'#081321':'#f4f7fb';"))throw new Error('v351: canonical document-entry boot canvas contract is missing.');
await writeFile(entryPath,entry);

/* v347/v351 run after the normal precache passes. Keep final HTML and SW cache in
   lockstep so non-iOS/offline launches never reference uncached runtime assets. */
let sw=await readFile(swPath,'utf8');
sw=sw.replaceAll(oldWatchdog,newWatchdog);
sw=sw.replaceAll(oldPresentationGuard,newPresentationGuard);
sw=sw.replaceAll(oldDocumentEntry,newDocumentEntry);
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
if(!sw.includes(cacheMarker))throw new Error('v347: service-worker cache insertion marker is missing.');
for(const asset of [themeBootstrap,'./storage-cleanup-v347.js?v=347','./mobile-preview-output-v350.js?v=350',newPresentationGuard,newDocumentEntry]){
  if(!sw.includes(`LOCAL_CORE.push('${asset}');`))sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${asset}');\n${cacheMarker}`);
}
await writeFile(swPath,sw);

const finalHtml=await readFile(htmlPath,'utf8');
const finalCss=await readFile(cssPath,'utf8');
const finalSw=await readFile(swPath,'utf8');
const finalEntry=await readFile(entryPath,'utf8');
if(finalHtml.includes('<script id="lourex-theme-bootstrap">'))throw new Error('v347: inline theme bootstrap remains in production HTML.');
if(!finalHtml.includes(themeBootstrap))throw new Error('v351: external theme bootstrap is not wired with the current cache key.');
if(!finalHtml.includes(canonicalLightBoot)||!finalHtml.includes(canonicalDarkBoot))throw new Error('v351: canonical first-paint boot palette is missing from production HTML.');
if(finalHtml.includes(legacyLightBoot)||finalHtml.includes(legacyDarkBoot))throw new Error('v351: legacy first-paint boot palette remains in production HTML.');
if(!finalHtml.includes('<meta name="theme-color" content="#081321" />'))throw new Error('v351: production theme-color meta is not canonical.');
if(!finalHtml.includes('storage-cleanup-v347.js?v=347'))throw new Error('v347: safe storage cleanup is not wired.');
if(!finalHtml.includes('mobile-preview-output-v350.js?v=350'))throw new Error('v350: mobile preview output validation bridge is not wired.');
if(!finalHtml.includes(newWatchdog))throw new Error('v347: cache-busted startup watchdog is not wired.');
if(!finalHtml.includes(newPresentationGuard))throw new Error('v351: presentation guard is not wired with the current cache key.');
if(!finalHtml.includes(newDocumentEntry))throw new Error('v351: document-entry runtime is not wired with the current cache key.');
if(!finalCss.includes(paletteMarker))throw new Error('v350: explicit application palette owner is not bundled.');
if(!finalCss.includes(startupMarker))throw new Error('v347: startup single-layer CSS is not final in the production bundle.');
if((finalCss.match(/\/\* --- v346-template-color-visual-closeout\.css --- \*\//g)||[]).length!==1)throw new Error('v350: application palette owner appears more than once in the production bundle.');
if(/@import\s+url\([^)]*v346-template-color-visual-closeout/i.test(finalCss))throw new Error('v350: late v346 runtime @import remains in the production bundle.');
if(finalEntry.includes("const bootBackground=dark?'#0c111d':'#f9fafb';"))throw new Error('v351: stale document-entry boot canvas survived finalization.');
for(const asset of [newWatchdog,themeBootstrap,'./storage-cleanup-v347.js?v=347','./mobile-preview-output-v350.js?v=350',newPresentationGuard,newDocumentEntry]){
  if(!finalSw.includes(asset))throw new Error(`v351: service worker is missing ${asset}.`);
}

console.log('LOUREX v351 startup finalization applied: canonical first-paint/runtime palette, single loading owner, no automatic stuck-boot reload, safe storage cleanup, mobile Preview output feedback, presentation guard and final PWA precache aligned.');
