import { readFile, writeFile } from 'node:fs/promises';

const htmlPath='dist/index.html';
const cssPath='dist/styles/app.bundle.css';
const runtimePath='dist/runtime-config.js';
const entryPath='dist/document-entry-v302.js';
const swPath='dist/sw.js';

let html=await readFile(htmlPath,'utf8');
const themeBootstrap='./theme-bootstrap-v347.js?v=361';
const inlineTheme=/<script id="lourex-theme-bootstrap">[\s\S]*?<\/script>/;
if(inlineTheme.test(html))html=html.replace(inlineTheme,`<script src="${themeBootstrap}"></script>`);
if(!html.includes(themeBootstrap))throw new Error('v351: canonical external theme bootstrap is missing from production HTML.');

/* Accept either a historical source artifact or the canonical v351 source. The
   final artifact must always end with one palette from the parser's first paint
   through the mounted application. */
const legacyLightBoot='html[data-ui-theme="light"]{--boot-bg:#f9fafb;--boot-text:#101828;--boot-track:#e4e7ec;--boot-accent:#465fff}';
const canonicalLightBoot='html[data-ui-theme="light"]{--boot-bg:#f3f7fc;--boot-text:#102235;--boot-track:#c3d1dc;--boot-accent:#129da1}';
const legacyDarkBoot='html[data-ui-theme="dark"]{--boot-bg:#0c111d;--boot-text:#f9fafb;--boot-track:#344054;--boot-accent:#7592ff}';
const canonicalDarkBoot='html[data-ui-theme="dark"]{--boot-bg:#0a1826;--boot-text:#f7fbff;--boot-track:#353535;--boot-accent:#7399E3}';
html=html
  .replace('<meta name="theme-color" content="#0c111d" />','<meta name="theme-color" content="#0a1826" />')
  .replace(legacyLightBoot,canonicalLightBoot)
  .replace(legacyDarkBoot,canonicalDarkBoot)
  .replaceAll('var(--boot-bg,#0c111d)','var(--boot-bg,#0a1826)')
  .replaceAll('var(--boot-track,#344054)','var(--boot-track,#353535)')
  .replaceAll('var(--boot-accent,#7592ff)','var(--boot-accent,#7399E3)');
if(!html.includes(canonicalLightBoot)||!html.includes(canonicalDarkBoot))throw new Error('v351: canonical source boot palette is missing.');

const oldWatchdog='./startup-watchdog-v321.js?v=321';
const newWatchdog='./startup-watchdog-v321.js?v=347';
html=html.replaceAll(oldWatchdog,newWatchdog);
if(!html.includes(newWatchdog))throw new Error('v351: startup watchdog reference is missing.');

const oldPresentationGuard='./home-final-closeout-v286.js?v=320';
const newPresentationGuard='./home-final-closeout-v286.js?v=361';
html=html.replaceAll(oldPresentationGuard,newPresentationGuard);
if(!html.includes(newPresentationGuard))throw new Error('v351: presentation guard reference is missing.');

const oldDocumentEntry='./document-entry-v302.js?v=337-3';
const newDocumentEntry='./document-entry-v302.js?v=361';
html=html.replaceAll(oldDocumentEntry,newDocumentEntry);
if(!html.includes(newDocumentEntry))throw new Error('v351: document-entry runtime reference is missing.');

const runtimeSafety='<script src="./runtime-safety-v334.js?v=344"></script>';
if(!html.includes(runtimeSafety))throw new Error('v351: runtime safety script reference is missing.');
const runtimeNoAutoReload='./runtime-no-auto-reload-v482.js?v=482';
if(!html.includes(runtimeNoAutoReload))html=html.replace(runtimeSafety,`${runtimeSafety}\n  <script src="${runtimeNoAutoReload}"></script>`);
if(!html.includes(runtimeNoAutoReload))throw new Error('v482: no-auto-reload runtime guard is missing.');
if(html.indexOf(runtimeNoAutoReload)<=html.indexOf(runtimeSafety)||html.indexOf(runtimeNoAutoReload)>=html.indexOf(newDocumentEntry))throw new Error('v482: no-auto-reload guard must load after runtime safety and before document entry.');
const storageCleanup='./storage-cleanup-v347.js?v=351';
html=html.replaceAll('./storage-cleanup-v347.js?v=347',storageCleanup);
if(!html.includes('storage-cleanup-v347.js'))html=html.replace(runtimeSafety,`${runtimeSafety}\n  <script src="${storageCleanup}"></script>`);
if(!html.includes(storageCleanup))throw new Error('v351: hardened storage cleanup reference is missing.');

const iosOutputBridge='<script src="./ios-print-bridge.js"></script>';
if(!html.includes(iosOutputBridge))throw new Error('v351: iOS output bridge reference is missing.');
const mobilePreviewOutput='./mobile-preview-output-v350.js?v=350';
if(!html.includes('mobile-preview-output-v350.js'))html=html.replace(iosOutputBridge,`${iosOutputBridge}\n  <script src="${mobilePreviewOutput}"></script>`);
if(!html.includes(mobilePreviewOutput))throw new Error('v351: mobile Preview output bridge is missing.');

const draftScrollRuntime='./styles/v331-draft-scroll-recovery.css?v=365-1';
const criticalDocumentsRuntime='./styles/v332-critical-documents-deep-closeout.css?v=332-1';
const v482MobileRepair='./styles/v482-mobile-ux-repair.css?v=482';
const bundleTag='<link rel="stylesheet" href="./styles/app.bundle.css" />';
if(!html.includes(bundleTag)||!html.includes(draftScrollRuntime)||!html.includes(criticalDocumentsRuntime))throw new Error('v351: standalone v331/v332 document owner is missing before finalization.');
if((html.match(/data-lourex-v331-draft-recovery="true"/g)||[]).length!==1)throw new Error('v351: expected exactly one v331 standalone owner marker.');
if((html.match(/data-lourex-v332-critical-documents="true"/g)||[]).length!==1)throw new Error('v351: expected exactly one v332 standalone owner marker.');
const criticalDocumentsTag=`<link rel="stylesheet" href="${criticalDocumentsRuntime}" data-lourex-v332-critical-documents="true" />`;
const v482MobileRepairTag=`<link rel="stylesheet" href="${v482MobileRepair}" data-lourex-v482-mobile-ux="true" />`;
if(!html.includes(criticalDocumentsTag))throw new Error('v482: canonical v332 stylesheet tag is missing.');
if(!html.includes(v482MobileRepair))html=html.replace(criticalDocumentsTag,`${criticalDocumentsTag}\n  ${v482MobileRepairTag}`);
if(!html.includes(v482MobileRepairTag))throw new Error('v482: final standalone mobile UX repair stylesheet is missing.');
if(html.indexOf(draftScrollRuntime)<=html.indexOf(bundleTag)||html.indexOf(criticalDocumentsRuntime)<=html.indexOf(draftScrollRuntime)||html.indexOf(v482MobileRepair)<=html.indexOf(criticalDocumentsRuntime))throw new Error('v482: stylesheet owner order must be app.bundle.css -> v331 -> v332 -> v482.');
await writeFile(htmlPath,html);

/* build.mjs owns the palette insertion point. Finalization owns only the final
   startup paint layer and verifies that the palette has not been duplicated. */
let css=await readFile(cssPath,'utf8');
const paletteMarker='/* --- v346-template-color-visual-closeout.css --- */';
const startupMarker='/* --- v347-startup-single-layer.css — final startup owner --- */';
if(!css.includes(paletteMarker))throw new Error('v351: explicit application palette owner is missing from the production bundle.');
const startupCss=await readFile('src/styles/v347-startup-single-layer.css','utf8');
if(!css.includes(startupMarker))css+=`\n\n${startupMarker}\n${startupCss.trim()}\n`;
await writeFile(cssPath,css);

/* Keep generated runtime-config incapable of automatic stuck-boot activation or
   navigation. Explicit user update/retry flows remain elsewhere. */
let runtime=await readFile(runtimePath,'utf8');
const autoReload='window.location.replace(window.location.href);';
if(runtime.includes(autoReload))runtime=runtime.replaceAll(autoReload,"try{window.__LOUREX_DIAGNOSTICS__?.mark?.('startup-service-worker-waiting','automaticReload=no');}catch(_error){}");
const autoActivate="try{waiting.postMessage({type:'SKIP_WAITING'});}catch(_error){}";
if(runtime.includes(autoActivate))runtime=runtime.replaceAll(autoActivate,"try{window.__LOUREX_DIAGNOSTICS__?.mark?.('startup-service-worker-waiting','automaticActivation=no automaticReload=no');}catch(_error){}");
if(runtime.includes(autoReload)||runtime.includes("waiting.postMessage({type:'SKIP_WAITING'})"))throw new Error('v351: automatic stuck-boot service-worker navigation/activation remains in runtime-config.js.');
await writeFile(runtimePath,runtime);

/* Source document-entry still supports older copied builds; the generated file
   must resolve boot repainting to the canonical v351 canvas. */
let entry=await readFile(entryPath,'utf8');
entry=entry.replaceAll("const bootBackground=dark?'#0c111d':'#f9fafb';","const bootBackground=dark?'#0a1826':'#f3f7fc';");
entry=entry.replaceAll("const bootBackground=dark?'#0a1826':'#f4f7fb';","const bootBackground=dark?'#0a1826':'#f3f7fc';");
entry=entry.replaceAll("const bootBackground=dark?'#0D0D0D':'#f4f7fb';","const bootBackground=dark?'#0a1826':'#f3f7fc';");
if(entry.includes("const bootBackground=dark?'#0c111d':'#f9fafb';"))throw new Error('v351: stale document-entry boot canvas colors remain.');
if(!entry.includes("const bootBackground=dark?'#0a1826':'#f3f7fc';"))throw new Error('v351: canonical document-entry boot canvas contract is missing.');
await writeFile(entryPath,entry);

/* Finalize the Service Worker after all normal precache passes. */
let sw=await readFile(swPath,'utf8');
sw=sw.replaceAll(oldWatchdog,newWatchdog);
sw=sw.replaceAll(oldPresentationGuard,newPresentationGuard);
sw=sw.replaceAll(oldDocumentEntry,newDocumentEntry);
sw=sw.replaceAll('./storage-cleanup-v347.js?v=347',storageCleanup);
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
if(!sw.includes(cacheMarker))throw new Error('v351: service-worker cache insertion marker is missing.');
for(const asset of [themeBootstrap,runtimeNoAutoReload,storageCleanup,mobilePreviewOutput,newPresentationGuard,newDocumentEntry,draftScrollRuntime,criticalDocumentsRuntime,v482MobileRepair]){
  if(!sw.includes(`LOCAL_CORE.push('${asset}');`))sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${asset}');\n${cacheMarker}`);
}
await writeFile(swPath,sw);

const finalHtml=await readFile(htmlPath,'utf8');
const finalCss=await readFile(cssPath,'utf8');
const finalSw=await readFile(swPath,'utf8');
const finalEntry=await readFile(entryPath,'utf8');
if(finalHtml.includes('<script id="lourex-theme-bootstrap">'))throw new Error('v351: inline theme bootstrap remains in production HTML.');
if(!finalHtml.includes(themeBootstrap))throw new Error('v351: external theme bootstrap is not wired with the current cache key.');
if(!finalHtml.includes(canonicalLightBoot)||!finalHtml.includes(canonicalDarkBoot))throw new Error('v351: canonical first-paint boot palette is missing from production HTML.');
if(finalHtml.includes(legacyLightBoot)||finalHtml.includes(legacyDarkBoot))throw new Error('v351: legacy first-paint boot palette remains in production HTML.');
if(!finalHtml.includes('<meta name="theme-color" content="#0a1826" />'))throw new Error('v351: production theme-color meta is not canonical.');
if(!finalHtml.includes(runtimeNoAutoReload))throw new Error('v482: production HTML is missing no-auto-reload runtime guard.');
if(finalHtml.indexOf(runtimeNoAutoReload)<=finalHtml.indexOf(runtimeSafety)||finalHtml.indexOf(runtimeNoAutoReload)>=finalHtml.indexOf(newDocumentEntry))throw new Error('v482: final runtime guard order is invalid.');
if(!finalHtml.includes(storageCleanup)||finalHtml.includes('./storage-cleanup-v347.js?v=347'))throw new Error('v351: storage cleanup cache key is not canonical.');
if(!finalHtml.includes(mobilePreviewOutput))throw new Error('v351: mobile Preview output validation bridge is not wired.');
for(const asset of [newWatchdog,newPresentationGuard,newDocumentEntry,draftScrollRuntime,criticalDocumentsRuntime,v482MobileRepair])if(!finalHtml.includes(asset))throw new Error(`v482: production HTML is missing ${asset}.`);
if(finalHtml.indexOf(draftScrollRuntime)<=finalHtml.indexOf(bundleTag)||finalHtml.indexOf(criticalDocumentsRuntime)<=finalHtml.indexOf(draftScrollRuntime)||finalHtml.indexOf(v482MobileRepair)<=finalHtml.indexOf(criticalDocumentsRuntime))throw new Error('v482: final standalone stylesheet order is invalid.');
if((finalHtml.match(/data-lourex-v482-mobile-ux="true"/g)||[]).length!==1)throw new Error('v482: expected exactly one standalone mobile UX owner.');
if(!finalCss.includes(paletteMarker))throw new Error('v351: explicit application palette owner is not bundled.');
if(!finalCss.includes(startupMarker))throw new Error('v351: startup single-layer CSS is not final in the production bundle.');
if((finalCss.match(/\/\* --- v346-template-color-visual-closeout\.css --- \*\//g)||[]).length!==1)throw new Error('v351: application palette owner appears more than once in the production bundle.');
if(/@import\s+url\([^)]*v346-template-color-visual-closeout/i.test(finalCss))throw new Error('v351: late v346 runtime @import remains in the production bundle.');
if(finalEntry.includes("const bootBackground=dark?'#0c111d':'#f9fafb';"))throw new Error('v351: stale document-entry boot canvas survived finalization.');
for(const retiredRuntimeStyle of ['attachment-gallery-v304.css','mobile-layout-closeout-v305.css','release-hardening-v306.css'])if(finalEntry.includes(retiredRuntimeStyle))throw new Error(`v351: retired empty runtime stylesheet request survived finalization: ${retiredRuntimeStyle}.`);
for(const asset of [newWatchdog,themeBootstrap,runtimeNoAutoReload,storageCleanup,mobilePreviewOutput,newPresentationGuard,newDocumentEntry,draftScrollRuntime,criticalDocumentsRuntime,v482MobileRepair])if(!finalSw.includes(asset))throw new Error(`v482: service worker is missing ${asset}.`);
if(finalSw.includes('./storage-cleanup-v347.js?v=347'))throw new Error('v351: stale storage cleanup cache key remains in service worker.');

console.log('LOUREX v482 startup finalization verified: no automatic late-auth hard reload, final standalone mobile UX owner after v332, canonical source/production palette, one loading owner, conservative storage cleanup and final PWA precache aligned.');
