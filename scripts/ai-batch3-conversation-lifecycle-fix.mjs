import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const target='dist/src/components/AiCopilot.js';
const workflowTarget='dist/src/components/AiWorkflowTools.js';
let source=await readFile(target,'utf8');
if(!source.includes('__lourexPremiumConversationBatch3'))throw new Error('Batch 3 premium conversation runtime must be installed first.');
if(source.includes('__lourexConversationLifecycleFixBatch3'))throw new Error('Batch 3 conversation lifecycle fix already installed.');

// The premium installer is appended after several historical post-build owners.
// A top-level lexical `let` can therefore be referenced by already-installed
// runtime code during module bootstrap before its initialization (TDZ). Keep
// transient source state behind hoisted functions + a globalThis slot instead.
const lexical='let __lourexConversationSources=[];';
if(!source.includes(lexical))throw new Error('Batch 3 conversation source lexical state target changed.');
source=source.replace(lexical,"function __lourexGetConversationSources(){const value=globalThis.__lourexConversationSourcesV3;return Array.isArray(value)?value:[];}\nfunction __lourexSetConversationSources(value){globalThis.__lourexConversationSourcesV3=Array.isArray(value)?value:[];return globalThis.__lourexConversationSourcesV3;}");

const requiredStateTargets=[
  'conversationSources: __lourexConversationSources',
  "__lourexConversationSources.length ? '/api/ai-conversation-v3'",
  '__lourexConversationSources=analyses.map(item=>item.source);',
  'instance.__lourexLastConversationSources=__lourexConversationSources.slice();',
  '__lourexConversationSources=sources.slice();'
];
for(const token of requiredStateTargets)if(!source.includes(token))throw new Error(`Batch 3 source-state target changed: ${token}`);
source=source.replaceAll('conversationSources: __lourexConversationSources','conversationSources: __lourexGetConversationSources()');
source=source.replaceAll("__lourexConversationSources.length ? '/api/ai-conversation-v3'","__lourexGetConversationSources().length ? '/api/ai-conversation-v3'");
source=source.replaceAll('__lourexConversationSources=analyses.map(item=>item.source);','__lourexSetConversationSources(analyses.map(item=>item.source));');
source=source.replaceAll('instance.__lourexLastConversationSources=__lourexConversationSources.slice();','instance.__lourexLastConversationSources=__lourexGetConversationSources().slice();');
source=source.replaceAll('__lourexConversationSources=sources.slice();','__lourexSetConversationSources(sources.slice());');

const retry='try{await baseAsk(__lourexCleanUserText(last.text));}finally{__lourexConversationSources=[];}';
if(!source.includes(retry))throw new Error('Batch 3 retry lifecycle target changed.');
source=source.replace(retry,'try{await instance.ask(__lourexCleanUserText(last.text));}finally{__lourexSetConversationSources([]);}');
const stop="instance.__lourexStopConversation=()=>{instance.__lourexAttachmentAbort?.abort();instance.cancelRequest?.();instance.setState({busy:false,attachmentBusy:false,error:''});};";
if(!source.includes(stop))throw new Error('Batch 3 stop lifecycle target changed.');
source=source.replace(stop,"instance.__lourexStopConversation=()=>{instance.__lourexAttachmentStopped=true;instance.__lourexAttachmentAbort?.abort();instance.cancelRequest?.();instance.setState({busy:false,attachmentBusy:false,error:''});};");
const attachmentCatch="}catch(error){if(!instance.__lourexAttachmentAbort?.signal?.aborted)instance.setState({error:error instanceof Error?error.message:String(error)});}finally{__lourexConversationSources=[];}};";
if(!source.includes(attachmentCatch))throw new Error('Batch 3 attachment cancellation target changed.');
source=source.replace(attachmentCatch,"}catch(error){if(!instance.__lourexAttachmentStopped&&error?.name!=='AbortError')instance.setState({error:error instanceof Error?error.message:String(error)});}finally{instance.__lourexAttachmentStopped=false;__lourexSetConversationSources([]);}};");

// Repair the generated evidence-list branch. The list/map/button nesting needs
// four closing parentheses: span, button, map and outer aside. The original
// Batch 3 installer emitted only three, which browsers reported as a module
// SyntaxError before the application could mount.
const brokenEvidence="React.createElement('span',null,row.fact)));return React.createElement('aside'";
const fixedEvidence="React.createElement('span',null,row.fact))));return React.createElement('aside'";
if(!source.includes(brokenEvidence))throw new Error('Batch 3 evidence-panel syntax target changed.');
source=source.replace(brokenEvidence,fixedEvidence);

// The recursive render transform already transforms form children while walking
// the compose subtree. The compose branch must not call transform() on those
// children a second time, or the hidden legacy input bridge becomes another
// premium textarea and users see duplicate composers. Keep file/camera inputs
// behind a wrapper so historical Voice/Collections/Search code using the
// canonical direct-child selector `.lourex-ai-compose form>input` still resolves
// exactly one element: the hidden legacy text bridge.
const duplicateComposer="...React.Children.toArray(child.props.children).map(grand=>transform(grand,true)),fileInput,cameraInput";
const singleComposer="...React.Children.toArray(child.props.children),React.createElement('span',{className:'lourex-ai-attachment-inputs','aria-hidden':'true'},fileInput,cameraInput)";
if(!source.includes(duplicateComposer))throw new Error('Batch 3 duplicate-composer transform target changed.');
source=source.replace(duplicateComposer,singleComposer);

if(source.includes('let __lourexConversationSources'))throw new Error('Batch 3 lexical conversation source state survived TDZ hardening.');
if(source.includes('__lourexConversationSources.length'))throw new Error('Batch 3 direct source-state read survived TDZ hardening.');
if(source.includes(brokenEvidence))throw new Error('Batch 3 evidence-panel syntax repair did not apply.');
if(source.includes(duplicateComposer))throw new Error('Batch 3 duplicate composer transform survived hardening.');
if(!source.includes("className:'lourex-ai-attachment-inputs'"))throw new Error('Batch 3 attachment inputs did not preserve the legacy direct-input selector.');
source+='\nconst __lourexConversationLifecycleFixBatch3=true;\n';
await writeFile(target,source);

for(const runtime of [target,workflowTarget]){
  const checked=spawnSync(process.execPath,['--check',runtime],{encoding:'utf8'});
  if(checked.status!==0)throw new Error(`AI Batch 3 generated invalid JavaScript in ${runtime}:\n${checked.stderr||checked.stdout||'unknown syntax error'}`);
}
console.log('[LOUREX AI] Batch 3 syntax, source TDZ, single-composer, legacy voice selector and retry/cancel lifecycle hardened; generated runtimes parse cleanly.');
