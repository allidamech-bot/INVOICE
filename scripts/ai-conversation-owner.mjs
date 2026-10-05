import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/ai-composer-v449.js';
let source=await readFile(target,'utf8');

if(!source.includes('__lourexContextualVoiceBatch7'))throw new Error('AI conversation owner requires the merged Batch 7 voice runtime.');
if(source.includes('__lourexConversationOwnerBatch1'))throw new Error('AI conversation owner Batch 1 is already installed.');

const stateToken='  let statusSequence=0;';
if(!source.includes(stateToken))throw new Error('AI conversation owner could not find canonical voice state.');
source=source.replace(stateToken,`${stateToken}\n  let recognitionReleaseTimer=0;\n  let nativeReleaseUntil=0;\n  const NATIVE_RELEASE_GRACE_MS=420;`);

const clearToken="  function clearCaptureTimer(){if(recognitionCaptureTimer){window.clearTimeout(recognitionCaptureTimer);recognitionCaptureTimer=0;}}";
if(!source.includes(clearToken))throw new Error('AI conversation owner could not find capture timer cleanup.');
source=source.replace(clearToken,`${clearToken}\n  function clearRecognitionReleaseTimer(){if(recognitionReleaseTimer){window.clearTimeout(recognitionReleaseTimer);recognitionReleaseTimer=0;}}\n  function queueVoiceAfterNativeRelease(panel){\n    if(!(panel instanceof HTMLElement)||!panel.isConnected)return;\n    voiceRestartPanel=panel;clearRecognitionReleaseTimer();\n    const wait=Math.max(36,nativeReleaseUntil-Date.now());\n    recognitionReleaseTimer=window.setTimeout(()=>{recognitionReleaseTimer=0;const restart=voiceRestartPanel;voiceRestartPanel=null;if(restart?.isConnected&&document.querySelector(PANEL)===restart&&!recognition)toggleVoice(restart);},wait);\n  }`);

const finishToken="    recognition=null;recognitionPanel=null;\n    const restart=voiceRestartPanel;voiceRestartPanel=null;\n    composerStatus(panel,state,messageKey,hideAfter);resetVoiceState();\n    if(restart?.isConnected)window.setTimeout(()=>{if(document.querySelector(PANEL)===restart&&!recognition)toggleVoice(restart);},0);";
if(!source.includes(finishToken))throw new Error('AI conversation owner could not find recognition finish lifecycle.');
source=source.replace(finishToken,"    recognition=null;recognitionPanel=null;\n    nativeReleaseUntil=Date.now()+NATIVE_RELEASE_GRACE_MS;\n    const restart=voiceRestartPanel;voiceRestartPanel=null;\n    composerStatus(panel,state,messageKey,hideAfter);resetVoiceState();\n    if(restart?.isConnected)queueVoiceAfterNativeRelease(restart);");

const fallbackToken="    recognitionStopTimer=window.setTimeout(()=>{if(recognition!==instance)return;try{instance.abort?.();}catch{}finishRecognition(instance,panel,state,messageKey,hideAfter);},1200);";
if(!source.includes(fallbackToken))throw new Error('AI conversation owner could not find Safari fallback release lifecycle.');
source=source.replace(fallbackToken,"    recognitionStopTimer=window.setTimeout(()=>{if(recognition!==instance)return;try{instance.abort?.();}catch{}nativeReleaseUntil=Date.now()+NATIVE_RELEASE_GRACE_MS;recognitionStopTimer=window.setTimeout(()=>{if(recognition===instance)finishRecognition(instance,panel,state,messageKey,hideAfter);},NATIVE_RELEASE_GRACE_MS);},1200);");

const ctorToken="    const Ctor=recognitionCtor();if(!Ctor){composerStatus(panel,'error','voiceUnavailable',3600);return;}";
if(!source.includes(ctorToken))throw new Error('AI conversation owner could not find voice constructor gate.');
source=source.replace(ctorToken,"    const releaseWait=nativeReleaseUntil-Date.now();if(releaseWait>0){composerStatus(panel,'starting','starting');queueVoiceAfterNativeRelease(panel);return;}\n    const Ctor=recognitionCtor();if(!Ctor){composerStatus(panel,'error','voiceUnavailable',3600);return;}");

const abortToken="  function abortVoice(){\n    voiceRestartPanel=null;clearRecognitionStopTimer();clearCaptureTimer();const current=recognition;\n    recognition=null;recognitionPanel=null;resetVoiceState();\n    if(current){current.onstart=null;current.onresult=null;current.onerror=null;current.onend=null;try{current.abort?.();}catch{try{current.stop?.();}catch{}}}\n  }";
if(!source.includes(abortToken))throw new Error('AI conversation owner could not find panel teardown lifecycle.');
source=source.replace(abortToken,"  function abortVoice(){\n    voiceRestartPanel=null;clearRecognitionStopTimer();clearCaptureTimer();clearRecognitionReleaseTimer();const current=recognition;\n    recognition=null;recognitionPanel=null;resetVoiceState();\n    if(current){nativeReleaseUntil=Date.now()+NATIVE_RELEASE_GRACE_MS;current.onstart=null;current.onresult=null;current.onerror=null;current.onend=null;try{current.abort?.();}catch{try{current.stop?.();}catch{}}}\n  }");

source+=`\nconst __lourexConversationOwnerBatch1=true;\n`;
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
console.log('[LOUREX AI] Conversation owner Batch 1 installed: Safari/iOS voice sessions now serialize across native microphone release.');
