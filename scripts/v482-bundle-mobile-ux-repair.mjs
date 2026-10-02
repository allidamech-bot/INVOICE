import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const standalonePath='dist/styles/v482-mobile-ux-repair.css';
const entryPath='dist/document-entry-v302.js';
const v481Marker='/* --- premium-regression-fixes-v481.css --- */';
const ownerName='v482-mobile-ux-repair.css';
const narrowOwnerName='v482-narrow-readability.css';
const marker=`/* --- ${ownerName} --- */`;
const narrowMarker=`/* --- ${narrowOwnerName} --- */`;

let bundle=await readFile(bundlePath,'utf8');
if(!bundle.includes(v481Marker))throw new Error('v482 production bundle: v481 final owner marker is missing.');
if(bundle.includes(marker)||bundle.includes(narrowMarker))throw new Error('v482 production bundle: duplicate mobile UX repair owner detected.');
const baseCss=(await readFile(`src/styles/${ownerName}`,'utf8')).trim();
const narrowCss=(await readFile(`src/styles/${narrowOwnerName}`,'utf8')).trim();
if(!baseCss||!narrowCss)throw new Error('v482 production bundle: mobile UX repair source is empty.');
const css=`${baseCss}\n\n${narrowMarker}\n${narrowCss}`;

bundle=`${bundle.trimEnd()}\n\n${marker}\n${css}\n`;
if(bundle.indexOf(marker)<=bundle.indexOf(v481Marker))throw new Error('v482 production bundle: repair owner must follow v481.');
if(!bundle.includes('.ta-documents-header-actions'))throw new Error('v482 production bundle: compact Documents command grid is missing.');
if(!bundle.includes('#lourex-ai-panel.lourex-ai-panel'))throw new Error('v482 production bundle: AI mobile safe-area repair is missing.');
if(!bundle.includes('#lourex-ai-panel .lourex-ai-head'))throw new Error('v482 production bundle: AI header overlap repair is missing.');
if(!bundle.includes('#lourex-ai-panel .lourex-ai-plus-copy')||!bundle.includes('grid-column:2!important'))throw new Error('v482 production bundle: narrow AI workflow readability repair is missing.');
if(!bundle.includes('.global-search-actions'))throw new Error('v482 production bundle: Global Search quick-create repair is missing.');
if(!bundle.includes('.ta-create-menu-grid'))throw new Error('v482 production bundle: Quick Create geometry repair is missing.');
if(!bundle.includes('.ta-business-health-card'))throw new Error('v482 production bundle: dashboard surface repair is missing.');
if(!bundle.includes('html[data-ui-theme="light"]'))throw new Error('v482 production bundle: Light mode repair ownership is missing.');
await writeFile(bundlePath,bundle);

/* Production index loads one v482 standalone stylesheet after v331/v332. Emit the
   base repair and the screenshot-driven narrow readability supplement as that
   single final artifact so no extra runtime cascade owner is introduced. */
await writeFile(standalonePath,`${css}\n`);
const emitted=(await readFile(standalonePath,'utf8')).trim();
if(emitted!==css)throw new Error('v482 production stylesheet: emitted standalone owner differs from composed source.');
if(!emitted.includes('.ta-documents-header-actions')||!emitted.includes('#lourex-ai-panel.lourex-ai-panel')||!emitted.includes('#lourex-ai-panel .lourex-ai-plus-copy'))throw new Error('v482 production stylesheet: required mobile repair contracts are missing.');

/* v302 kept a historical late-auth recovery fallback that hard-navigated the
   page when account setup was visible. Keep the source compatibility file intact,
   but make the generated production runtime use the same in-app transition
   protocol as current account switching. Explicit sign-out reload behavior is
   intentionally outside this narrowly scoped replacement. */
let entry=await readFile(entryPath,'utf8');
const lateAuthRecovery=/function recoverLateAuthenticatedAccount\(\)\{[\s\S]*?\n  \}\n\n  function noteAppliedCloudVault/;
if(!lateAuthRecovery.test(entry))throw new Error('v482 production runtime: late-auth recovery block is missing.');
entry=entry.replace(lateAuthRecovery,`function recoverLateAuthenticatedAccount(){
    const setup=document.querySelector('.account-managed-setup');if(!setup)return;
    if(editorOrUnsafeWorkspaceOpen())return;
    let uid='';try{uid=String(window.firebase?.auth?.().currentUser?.uid||'');}catch{}if(!uid)return;
    try{if(window.sessionStorage.getItem(accountScopeRecoveryKey)===uid)return;window.sessionStorage.setItem(accountScopeRecoveryKey,uid);}catch{}
    try{window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid,lateAuthRecovery:true,automaticReload:false,source:'document-entry'}}));}
    catch{completeDeferredAccount(uid);}
  }

  function noteAppliedCloudVault`);
const recoveryStart=entry.indexOf('function recoverLateAuthenticatedAccount(){');
const recoveryEnd=entry.indexOf('\n\n  function noteAppliedCloudVault',recoveryStart);
if(recoveryStart<0||recoveryEnd<=recoveryStart)throw new Error('v482 production runtime: safe late-auth recovery block could not be isolated.');
const recoveryBlock=entry.slice(recoveryStart,recoveryEnd);
if(/(?:window\.)?location\s*\.\s*(?:reload|replace|assign)\s*\(/.test(recoveryBlock))throw new Error('v482 production runtime: automatic late-auth page navigation remains.');
if(!recoveryBlock.includes('lourex-account-transition-request')||!recoveryBlock.includes('automaticReload:false'))throw new Error('v482 production runtime: in-app late-auth transition contract is missing.');
await writeFile(entryPath,entry);

console.log('LOUREX v482 final owner verified: bundle + standalone base/narrow mobile UX repairs emitted and generated late-auth recovery uses in-app transition without hard reload.');
