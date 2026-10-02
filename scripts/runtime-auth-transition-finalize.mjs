import { readFile, writeFile } from 'node:fs/promises';

/*
 * Runtime-only compatibility hardening extracted from the former v482 visual
 * bundler. This file must never emit or own CSS.
 */
const entryPath='dist/document-entry-v302.js';
let entry=await readFile(entryPath,'utf8');

const lateAuthRecovery=/function recoverLateAuthenticatedAccount\(\)\{[\s\S]*?\n  \}\n\n  function noteAppliedCloudVault/;
if(!lateAuthRecovery.test(entry))throw new Error('runtime auth transition: late-auth recovery block is missing.');

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
if(recoveryStart<0||recoveryEnd<=recoveryStart)throw new Error('runtime auth transition: safe late-auth recovery block could not be isolated.');
const recoveryBlock=entry.slice(recoveryStart,recoveryEnd);
if(/(?:window\.)?location\s*\.\s*(?:reload|replace|assign)\s*\(/.test(recoveryBlock))throw new Error('runtime auth transition: automatic late-auth page navigation remains.');
if(!recoveryBlock.includes('lourex-account-transition-request')||!recoveryBlock.includes('automaticReload:false'))throw new Error('runtime auth transition: in-app transition contract is missing.');

await writeFile(entryPath,entry);
console.log('LOUREX runtime auth transition finalized without visual ownership or hard reload.');
