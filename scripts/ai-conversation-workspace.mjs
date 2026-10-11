import {readFile,writeFile} from 'node:fs/promises';
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
await writeFile('dist/ai-composer-v449.css',(await readFile('dist/ai-composer-v449.css','utf8'))+'\n'+css);
console.log('[LOUREX AI] Conversation Workspace typed presentation boundary installed.');

// Imported TS modules have stable URLs. Change SW bytes when their content changes
// so installed local-first clients recache them with the existing reload contract.
const workspaceModules=['components/AiConversationWorkspace','components/AiCommercialWorkspace','lib/ai-conversation-kernel','lib/ai-intelligence-runtime','lib/ai-workspace-model','lib/ai-commercial-intelligence','lib/ai-commercial-conversation','lib/ai-mission-runner','components/AiReliabilityWorkspace','lib/ai-business-memory-graph','lib/ai-reliability-intelligence','lib/ai-local-diagnostics','lib/ai-foundation-approval','storage/assistant-memory-store'];
const moduleHash=createHash('sha256');
for(const name of workspaceModules){const asset='./src/'+name+'.js';const sw=await readFile('dist/sw.js','utf8');if(!sw.includes(asset))throw new Error('Workspace module missing from precache: '+asset);moduleHash.update(name).update(await readFile('dist/src/'+name+'.js'));}
await writeFile('dist/sw.js',(await readFile('dist/sw.js','utf8'))+'\n// LOUREX AI workspace modules SHA256 '+moduleHash.digest('hex')+'\n');
