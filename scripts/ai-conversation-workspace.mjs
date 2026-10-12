import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const target='dist/src/components/AiCopilot.js';let source=await readFile(target,'utf8');
if(!source.includes('__lourexIntelligenceFoundation')||source.includes('__lourexConversationWorkspace2'))throw new Error('Workspace requires exactly one audited Foundation owner.');
const replace=(before,after)=>{if(source.split(before).length!==2)throw new Error('Workspace compatibility drift: '+before);source=source.replace(before,after);};
// Preserve asynchronous lifecycle completion so hydration cannot race a new thread.
replace('instance.__lourexNewConversation=()=>void __lourexNewAssistantConversation(instance);','instance.__lourexNewConversation=()=>__lourexNewAssistantConversation(instance);');
replace('instance.__lourexDeleteThread=threadId=>void __lourexDeleteAssistantThread(instance,threadId);','instance.__lourexDeleteThread=threadId=>__lourexDeleteAssistantThread(instance,threadId);');
source="import { installConversationWorkspace, renderConversationWorkspace, updateConversationWorkspace, unmountConversationWorkspace } from './AiConversationWorkspace.js';\n"+source+`
const __lourexConversationWorkspace2=true;
const __lourexWorkspaceMount=AiCopilot.prototype.componentDidMount;
const __lourexWorkspaceRender=AiCopilot.prototype.render;
const __lourexWorkspaceUpdate=AiCopilot.prototype.componentDidUpdate;
const __lourexWorkspaceUnmount=AiCopilot.prototype.componentWillUnmount;
AiCopilot.prototype.componentDidMount=function(){__lourexWorkspaceMount.call(this);installConversationWorkspace(this);};
AiCopilot.prototype.render=function(){return renderConversationWorkspace(this,__lourexWorkspaceRender.call(this));};
AiCopilot.prototype.componentDidUpdate=function(previous,state){__lourexWorkspaceUpdate.call(this,previous,state);updateConversationWorkspace(this,previous);};
AiCopilot.prototype.componentWillUnmount=function(){unmountConversationWorkspace(this);__lourexWorkspaceUnmount.call(this);};
`;
await writeFile(target,source);execFileSync(process.execPath,['--check',target]);
const css=await readFile('src/styles/ai-conversation-workspace.css','utf8');
// Retire obsolete visual declarations for elements now owned by the typed
// workspace. Keep menu motion, focus, voice state and every behavioral selector.
const canonicalElements=/\.(?:lourex-ai-head|lourex-ai-title|lourex-ai-head-actions|lourex-ai-message(?:\.(?:user|assistant))?|lourex-ai-message-actions(?::hover|:focus-within)?|lourex-ai-error|lourex-ai-compose form|lourex-ai-premium-textarea|lourex-ai-send|lourex-ai-composer-plus|lourex-ai-composer-mic)(?:\[dir=['"](?:rtl|ltr)['"]\])?$/;
const ownedProperties=new Set(['background','background-color','color','border','border-radius','box-shadow','padding','padding-inline','min-height','height','display','flex-direction','align-items','gap','align-self','max-width','grid-template-columns','font','font-family','font-size','font-weight','line-height','margin','margin-inline-start','margin-inline-end','min-width','opacity','pointer-events']);
const migrateCss=previousCss=>previousCss.replace(/([^{}]+)\{([^{}]*)\}/g,(rule,selectors,declarations)=>{
  const list=selectors.trim().split(',').map(selector=>selector.trim());
  if(!list.length||!list.every(selector=>canonicalElements.test(selector)))return rule;
  const kept=declarations.split(';').filter(declaration=>!ownedProperties.has(declaration.split(':')[0].trim())).join(';');
  return selectors+'{'+kept+'}';
});
// Global app bundle and independently loaded tablet sheets also contain old
// AI-only layout rules. Migrate all emitted sheets, not merely composer CSS.
for(const file of await readdir('dist',{recursive:true})){
  if(!file.endsWith('.css'))continue;
  const path='dist/'+file,previous=await readFile(path,'utf8'),migrated=migrateCss(previous);
  if(previous!==migrated)await writeFile(path,migrated);
}
await writeFile('dist/ai-composer-v449.css',(await readFile('dist/ai-composer-v449.css','utf8'))+'\n'+css);
console.log('[LOUREX AI] Conversation Workspace typed presentation boundary installed.');

// Imported TS modules have stable URLs. Change SW bytes when their content changes
// so installed local-first clients recache them with the existing reload contract.
const workspaceModules=['components/AiConversationWorkspace','components/AiCommercialWorkspace','lib/ai-conversation-kernel','lib/ai-conversation-mode','lib/ai-intelligence-runtime','lib/ai-workspace-model','lib/ai-workspace-presentation','lib/ai-commercial-intelligence','lib/ai-commercial-conversation','lib/ai-mission-runner','components/AiReliabilityWorkspace','lib/ai-business-memory-graph','lib/ai-reliability-intelligence','lib/ai-local-diagnostics','lib/ai-foundation-approval','storage/assistant-memory-store'];
const toolPresentationModules=['lib/ai-tool-presentation','components/UI','components/AiWorkflowTools','components/BusinessMemoryTool','components/BusinessSearchTool','components/CfoScenarioTool','components/CollectionsAiTool','components/CustomerAiCapture','components/DailyCommandCenterTool','components/ProcurementAiCompare','components/ProductAiSourceReview','components/SupplierDocumentImport'];
const toolPresentationHash=createHash('sha256');
for(const name of toolPresentationModules){const asset='./src/'+name+'.js';if(!(await readFile('dist/sw.js','utf8')).includes(asset))throw new Error('AI tool presentation module missing from precache: '+asset);toolPresentationHash.update(name).update(await readFile('dist/src/'+name+'.js'));}
const moduleHash=createHash('sha256');
// Styles are changed after the earlier precache stage. Include their final
// emitted bytes so installed clients cannot retain an old visual generation.
const styleHash=createHash('sha256').update(css);
for(const file of (await readdir('dist',{recursive:true})).filter(file=>file.endsWith('.css')).sort())styleHash.update(file).update(await readFile('dist/'+file));
for(const name of workspaceModules){const asset='./src/'+name+'.js';const sw=await readFile('dist/sw.js','utf8');if(!sw.includes(asset))throw new Error('Workspace module missing from precache: '+asset);moduleHash.update(name).update(await readFile('dist/src/'+name+'.js'));}
await writeFile('dist/sw.js',(await readFile('dist/sw.js','utf8'))+'\n// LOUREX AI workspace modules SHA256 '+moduleHash.digest('hex')+'\n// LOUREX AI workspace styles SHA256 '+styleHash.digest('hex')+'\n// LOUREX AI tool presentation SHA256 '+toolPresentationHash.digest('hex')+'\n');
