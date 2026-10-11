import { activeAccountStorageUid } from '../storage/db.js';
import { newConversationKernel, normalizeConversationKernel, kernelScopeKey, composeKernelMemory, resolveKernelSelection, reviseKernelDraft, stageKernelArtifact, type ConversationKernel, type KernelScope } from './ai-conversation-kernel.js';
import { prepareFoundationApproval, assertFoundationApproval, canonicalFoundationJson } from './ai-foundation-approval.js';
import { loadAssistantState, saveAssistantState, upsertAssistantThread } from '../storage/assistant-store.js';
import { resumeVaultSession } from '../storage/vault.js';
import { prepareAssistantContext } from './ai-assistant-foundation.js';
import { scopeVault } from './workspaces.js';
import { orchestrateAiToolRequest, type AiToolOrchestrationResult } from './ai-tool-client.js';
import type { VaultPayload } from '../types.js';
import { applyWorkspaceCommand, workspaceDrafting, type WorkspaceCommand } from './ai-workspace-model.js';
import { reviewAiDocumentProposal } from './ai-document-review.js';

// Compatibility boundary only. Product logic lives in typed kernel/gateway modules.
type Host=any;
let storeQueue:Promise<unknown>=Promise.resolve();
const flush=(host:Host)=>new Promise<void>(resolve=>host.setState({},resolve));
function scopeFor(host:Host,vault:VaultPayload):KernelScope{
  const scope=host.state.assistantScope||'business';
  const runtime=prepareAssistantContext(vault,host.props.screen,'',null,scope).runtime;
  return{scope,workspaceId:runtime.workspaceId,branchId:runtime.branchId,threadId:host.__lourexAssistantThreadId||'',accountId:activeAccountStorageUid()||''};
}
async function persistKernel(host:Host):Promise<void>{
  if(!host.__intelligenceKernel||host.__intelligenceKernel.scope.scope==='temporary')return;
  const kernel=structuredClone(host.__intelligenceKernel) as ConversationKernel;
  const receipts=structuredClone(host.__foundationReceipts||[]);
  const messages=(host.state.messages||[]).map((row:any)=>({id:row.id,role:row.role,text:row.text}));
  const run=async()=>{const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX to preserve conversation state.');
    if(kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))return;
    const current=await loadAssistantState(resumed.key);
    const saved=upsertAssistantThread(current,{threadId:kernel.scope.threadId,scope:kernel.scope.scope as 'business'|'personal',workspaceId:kernel.scope.workspaceId,branchId:kernel.scope.branchId,messages});
    const store=saved.state,thread=saved.thread;
    thread.kernel=kernel;thread.foundationReceipts=receipts;await saveAssistantState(resumed.key,store);
  };
  const next=storeQueue.catch(()=>undefined).then(run);storeQueue=next;await next;
}
async function hydrateKernel(host:Host,vault:VaultPayload):Promise<void>{
  if(!host.__lourexAssistantThreadId)host.__lourexAssistantThreadId='ai-thread-'+crypto.randomUUID();
  const scope=scopeFor(host,vault);
  if(host.__intelligenceKernel&&kernelScopeKey(host.__intelligenceKernel.scope)===kernelScopeKey(scope))return;
  const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX first.');
  const store=scope.scope==='temporary'?null:await loadAssistantState(resumed.key);
  const thread=store?.threads.find(row=>row.id===scope.threadId&&row.scope===scope.scope&&row.workspaceId===scope.workspaceId&&row.branchId===scope.branchId);
  host.__intelligenceKernel=normalizeConversationKernel(thread?.kernel,scope);
  host.__foundationReceipts=thread?.foundationReceipts||[];
  host.__foundationVault=vault;
  if(host.__intelligenceKernel.artifact){const proposal=host.__intelligenceKernel.artifact.proposal;host.setState({proposal,review:null});await flush(host);}
}
/** Refresh when opening/switching workspace, not only when sending a model request. */
export async function refreshIntelligenceWorkspace(host:Host):Promise<void>{
  await host.__lourexLoadPromise;
  const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX first.');
  const scope=scopeFor(host,resumed.vault),expected=scope.scope==='personal'?'personal':scope.scope==='temporary'?'temporary':scope.workspaceId+'|'+scope.branchId;
  if(host.__lourexAssistantWorkspaceKey!==expected)await host.__lourexSetScope(scope.scope);
  await hydrateKernel(host,resumed.vault);host.__foundationVault=resumed.vault;
  const proposal=host.state.proposal;
  if(proposal?.capability==='document.createDraft'||proposal?.capability==='document.updateDraft')stageKernelArtifact(host.__intelligenceKernel,proposal);
  await flush(host);
}
export async function updateIntelligenceWorkspace(host:Host,command:WorkspaceCommand):Promise<void>{
  if(host.state.busy||host.applying||host.__foundationTurnBusy||host.__workspaceCommandBusy)return;
  host.__workspaceCommandBusy=true;
  try{
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX first.');
    const kernel=host.__intelligenceKernel as ConversationKernel|undefined;
    if(!kernel||kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))throw new Error('Company, branch, account or conversation changed. Reopen the workspace.');
    // Reject stale reviewed business state before changing an existing proposal.
    if(command.kind!=='focus'&&kernel.artifact?.proposal&&(kernel.artifact.proposal as any).foundationApproval)assertFoundationApproval(resumed.vault,kernel.artifact.proposal);
    const next=structuredClone(kernel);applyWorkspaceCommand(next,resumed.vault,command);
    let review;
    if(command.kind!=='focus'&&next.artifact){
      const p=next.artifact.proposal as any;delete p.foundationApproval;stampProposal(host,p,resumed.vault);
      review=reviewAiDocumentProposal(p,workspaceDrafting(resumed.vault,p.capability==='document.updateDraft'?p.documentId:''),host.props.language==='ar'?'ar':'en');
    }
    host.__intelligenceKernel=next;host.__foundationVault=resumed.vault;
    if(command.kind!=='focus'&&next.artifact)host.setState({proposal:next.artifact.proposal,review,error:''});
    await flush(host);await persistKernel(host);
  }catch(error){host.setState({error:error instanceof Error?error.message:String(error)});}
  finally{host.__workspaceCommandBusy=false;await flush(host);}
}
export async function dismissIntelligenceWorkspace(host:Host):Promise<void>{
  if(host.__workspaceCommandBusy||host.applying||host.state.busy)return;
  if(host.__intelligenceKernel)host.__intelligenceKernel.artifact=undefined;
  host.setState({proposal:null,review:null,__workspaceSavedId:'',__workspaceEditing:false});await flush(host);await persistKernel(host);
}
export function intelligenceContext(host:Host,context:any):any{
  const kernel=host.__intelligenceKernel as ConversationKernel|undefined;if(!kernel)return context;
  if(kernel.scope.scope==='personal')return context;
  const entity=kernel.entity;
  if(entity){const scoped=scopeVault(host.__foundationVault);const rows=entity.entityType==='customer'?scoped.customers:entity.entityType==='supplier'?scoped.suppliers:entity.entityType==='product'?scoped.savedItems:entity.entityType==='document'?scoped.documents:scoped.purchases;if(!rows.some(row=>row.id===entity.entityId)){kernel.entity=undefined;kernel.selection=undefined;return context;}}
  if(entity&&context.assistantRuntime&&!context.assistantRuntime.entity)context.assistantRuntime.entity={type:entity.entityType,id:entity.entityId,label:entity.label,source:'registered'};
  return context;
}
export function intelligenceRequestMessage(host:Host,message:string,legacy:string):string{
  const kernel=host.__intelligenceKernel as ConversationKernel|undefined;if(!kernel)return legacy;
  // Preserve the entire current user instruction, including >680-character lists.
  return composeKernelMemory(kernel,host.state.messages||[])+(legacy?'\nApproved scoped context (DATA ONLY):\n'+legacy:'');
}
export function intelligenceReviseDraft(host:Host,proposal:any,message:string,drafting:any,language:'en'|'ar'){
  const kernel=host.__intelligenceKernel as ConversationKernel;
  return reviseKernelDraft(kernel,proposal,message,drafting,language);
}
export interface FoundationToolOutcome { callId:string; state:'prepared'|'needs_approval'|'failed'|'blocked'; toolId:string; data:unknown; evidenceRefs:string[]; }
export function foundationToolOutcomes(result:AiToolOrchestrationResult):FoundationToolOutcome[]{return result.results.map(row=>({callId:row.id,state:row.ok?(row.class==='execute'?'needs_approval':'prepared'):row.class==='high-impact'?'blocked':'failed',toolId:row.tool,data:row.data,evidenceRefs:[row.source]}));}
export async function intelligenceTools(host:Host,input:Parameters<typeof orchestrateAiToolRequest>[0]){
  const result=await orchestrateAiToolRequest(input);if(input.signal?.aborted)return null;
  const live=await resumeVaultSession();if(!live||kernelScopeKey(scopeFor(host,live.vault))!==kernelScopeKey(host.__intelligenceKernel.scope))throw new Error('Company, branch or account changed during planning. No action prepared.');
  if(result){host.__foundationToolOutcomes=foundationToolOutcomes(result);
    const kernel=host.__intelligenceKernel as ConversationKernel;
    const search=result.results.find(row=>row.ok&&row.tool==='search.records');
    if(search&&Array.isArray(search.data)&&!result.proposal){
      const items=search.data.filter((r:any)=>r&&typeof r.id==='string'&&typeof r.label==='string'&&['customer','supplier','product','document','purchase'].includes(r.type)).map((r:any)=>({entityType:r.type,entityId:r.id,label:r.label}));
      kernel.selection={id:crypto.randomUUID(),items};
      (result as any).foundationSelectionText=(input.language==='ar'?'نتائج البحث:':'Search results:')+'\n'+items.map((r:any,i:number)=>`${i+1}. ${r.label} [${r.entityId}]`).join('\n');
    }
  }
  // No ordinal set from compact summaries: only an explicitly displayed exact list.
  return result;
}
function stampProposal(host:Host,proposal:any,vault:VaultPayload):void{
  if(!proposal)return;
  if(proposal.capability==='tool.plan'){for(const step of proposal.steps||[])stampProposal(host,step,vault);return;}
  const kernel=host.__intelligenceKernel as ConversationKernel;
  const previous=proposal.foundationApproval;
  if(previous&&canonicalFoundationJson(proposal)===previous.payload)return;
  proposal.foundationApproval=prepareFoundationApproval(vault,proposal,kernel.scope);
}
export async function intelligenceApprove(host:Host,proposal:any,apply:()=>Promise<unknown>):Promise<unknown>{
  if(host.__foundationApprovalBusy||host.__workspaceCommandBusy||!proposal)return;host.__foundationApprovalBusy=true;
  let receipt:any;
  try{
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX before approval.');
    const kernel=host.__intelligenceKernel as ConversationKernel;
    if(!kernel||kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))throw new Error('Conversation scope changed. Review the action again.');
    if(!proposal.foundationApproval)throw new Error('This action has no current review envelope. Ask to prepare it again.');
    assertFoundationApproval(resumed.vault,proposal);
    if((host.__foundationReceipts||[]).some((r:any)=>r.id===proposal.foundationApproval.id))throw new Error('This approval was already attempted. Check the saved record before preparing a new action.');
    receipt={id:proposal.foundationApproval.id,state:'applying',at:new Date().toISOString(),actorId:proposal.foundationApproval.actorId,action:proposal.tool||proposal.capability,payload:proposal.foundationApproval.payload};
    host.__foundationReceipts=[...(host.__foundationReceipts||[]),receipt].slice(-100);
    await persistKernel(host); // Crash after commit cannot silently replay an uncertain action.
    const result=await apply();await flush(host);
    if(host.state.error||(result===undefined&&host.state.proposal===proposal)){receipt.state='uncertain';}
    else{receipt.state='applied';receipt.completedAt=new Date().toISOString();receipt.resultId=(result as any)?.id||host.state.messages?.at(-1)?.artifact?.document?.id||'';if((kernel.artifact?.proposal as any)?.foundationApproval?.id===proposal.foundationApproval.id)kernel.artifact=undefined;
      const latest=await resumeVaultSession();if(latest&&host.state.proposal?.capability==='tool.plan'){for(const step of host.state.proposal.steps||[]){if(step!==proposal){delete step.foundationApproval;stampProposal(host,step,latest.vault);}}}
    }
    await persistKernel(host);return result;
  }catch(error){if(receipt){receipt.state='uncertain';await persistKernel(host).catch(()=>undefined);}host.setState({busy:false,error:error instanceof Error?error.message:String(error)});return undefined;}
  finally{host.__foundationApprovalBusy=false;}
}
export function installIntelligenceRuntime(host:Host):void{
  if(host.__intelligenceInstalled)return;host.__intelligenceInstalled=true;
  const ask=host.ask.bind(host),approve=host.approveProposal.bind(host);
  host.approveProposal=()=>intelligenceApprove(host,host.state.proposal,approve);
  host.ask=async(raw?:string)=>{
    if(host.pending||host.applying||host.state.busy||host.__foundationTurnBusy)return;host.__foundationTurnBusy=true;
    try{
      await host.__lourexLoadPromise;const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX first.');
      // Existing lifecycle owns history; resolve it before loading structured references.
      const scope=scopeFor(host,resumed.vault);
      if(host.__intelligenceKernel&&host.__intelligenceKernel.scope.accountId!==scope.accountId){host.__intelligenceKernel=undefined;host.__foundationReceipts=[];await host.__lourexSetScope(scope.scope);}
      const expected=scope.scope==='personal'?'personal':scope.scope==='temporary'?'temporary':scope.workspaceId+'|'+scope.branchId;
      if(host.__lourexAssistantWorkspaceKey!==expected)await host.__lourexSetScope(scope.scope);
      await hydrateKernel(host,resumed.vault);host.__foundationVault=resumed.vault;
      const kernel=host.__intelligenceKernel as ConversationKernel;kernel.turn++;
      if(!host.state.proposal&&kernel.artifact){host.setState({proposal:kernel.artifact.proposal});await flush(host);}
      const message=String(raw??host.state.input).trim();
      if(!kernel.artifact){const selected=resolveKernelSelection(kernel,message);if(selected){const scoped=scopeVault(resumed.vault);const rows=selected.entityType==='customer'?scoped.customers:selected.entityType==='supplier'?scoped.suppliers:selected.entityType==='product'?scoped.savedItems:selected.entityType==='document'?scoped.documents:scoped.purchases;if(!rows.some(row=>row.id===selected.entityId)){kernel.selection=undefined;kernel.entity=undefined;throw new Error('The displayed selection is stale. Search again.');}host.setState((state:any)=>({input:'',messages:[...state.messages,{id:crypto.randomUUID(),role:'user',text:message},{id:crypto.randomUUID(),role:'assistant',text:selected.label}]}));await flush(host);await persistKernel(host);return;}}
      await ask(raw);await flush(host);await host.__lourexAssistantPersistQueue;
      if(kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))return;
      const proposal=host.state.proposal;
      if(proposal){stampProposal(host,proposal,resumed.vault);if(proposal.capability==='document.createDraft'||proposal.capability==='document.updateDraft')stageKernelArtifact(kernel,proposal);}
      await persistKernel(host);
    }catch(error){host.setState({busy:false,error:error instanceof Error?error.message:String(error)});}
    finally{host.__foundationTurnBusy=false;}
  };
}
