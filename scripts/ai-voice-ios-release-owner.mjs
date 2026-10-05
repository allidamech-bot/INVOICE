import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/ai-composer-v449.js';
let source=await readFile(target,'utf8');

if(!source.includes('__lourexConversationOwnerBatch1'))throw new Error('iOS voice release owner requires the canonical conversation owner.');
if(source.includes('__lourexIosVoiceReleaseOwner'))throw new Error('iOS voice release owner is already installed.');

const graceToken='  const NATIVE_RELEASE_GRACE_MS=420;';
if(!source.includes(graceToken))throw new Error('iOS voice release owner could not find the native release grace.');
source=source.replace(graceToken,`  const __lourexWebKitVoice=/iP(?:hone|ad|od)/i.test(navigator.userAgent)||(/AppleWebKit/i.test(navigator.userAgent)&&!/Chrome|Chromium|Edg|OPR/i.test(navigator.userAgent));\n  const NATIVE_RELEASE_GRACE_MS=__lourexWebKitVoice?1600:420;\n  const NATIVE_RELEASE_RETRY_MS=__lourexWebKitVoice?320:220;\n  const NATIVE_RELEASE_RETRY_LIMIT=__lourexWebKitVoice?6:4;`);

const toggleToken='  function toggleVoice(panel){';
if(!source.includes(toggleToken))throw new Error('iOS voice release owner could not find the voice toggle owner.');
const startOwner=`  function __lourexTransientVoiceStartError(error){\n    const name=String(error?.name||'').toLowerCase();const message=String(error?.message||'').toLowerCase();\n    return name==='invalidstateerror'||name==='aborterror'||name==='notreadableerror'||name==='operationerror'||/native microphone|microphone.*owned|already.*start|busy|in use/.test(message);\n  }\n  function __lourexStartVoice(instance,panel,attempt=0){\n    if(recognition!==instance||!(panel instanceof HTMLElement)||!panel.isConnected||document.querySelector(PANEL)!==panel)return;\n    try{instance.start();return;}catch(error){\n      const name=String(error?.name||'').toLowerCase();\n      if(name==='notallowederror'||name==='securityerror'){stopRecognition(instance,panel,'error','voiceDenied',4200,true);return;}\n      if(__lourexTransientVoiceStartError(error)&&attempt<NATIVE_RELEASE_RETRY_LIMIT){\n        composerStatus(panel,'starting','starting');nativeReleaseUntil=Math.max(nativeReleaseUntil,Date.now()+NATIVE_RELEASE_RETRY_MS);clearRecognitionReleaseTimer();\n        recognitionReleaseTimer=window.setTimeout(()=>{recognitionReleaseTimer=0;if(recognition===instance)__lourexStartVoice(instance,panel,attempt+1);},NATIVE_RELEASE_RETRY_MS);return;\n      }\n      stopRecognition(instance,panel,'error','voiceFailed',3200,true);\n    }\n  }\n`;
source=source.replace(toggleToken,`${startOwner}${toggleToken}`);

const startToken="    try{instance.start();}catch{stopRecognition(instance,panel,'error','voiceFailed',3200,true);}";
if(!source.includes(startToken))throw new Error('iOS voice release owner could not find the canonical recognition start call.');
source=source.replace(startToken,'    __lourexStartVoice(instance,panel);');

source+=`\nconst __lourexIosVoiceReleaseOwner=true;\nwindow.__LOUREX_VOICE_RUNTIME_OWNER__='ios-release-v2';\n`;
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
console.log('[LOUREX AI] iOS/WebKit voice release owner v2 installed: extended post-onend lease barrier, bounded transient retry, and runtime owner diagnostics are active.');
