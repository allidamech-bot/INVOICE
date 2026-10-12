import { diagnosticSample, normalizeDiagnostics, type DiagnosticOperation } from './ai-local-diagnostics.js';
import { buildBusinessMemoryGraph, graphKindAllowed } from './ai-business-memory-graph.js';
import { financialReviewAllowed } from './ai-reliability-intelligence.js';
import { loadAssistantMemory, scopedAssistantMemories } from '../storage/assistant-memory-store.js';
import { commercialDraftCommand, savedDocumentPreviewId } from './ai-commercial-conversation.js';
import { createMission, missionStep, beginMissionStep, finishMissionStep, pendingMissionProposal, type MissionStep } from './ai-mission-runner.js';
import { activeAccountStorageUid } from '../storage/db.js';
import { newConversationKernel, normalizeConversationKernel, kernelScopeKey, composeKernelMemory, resolveKernelSelection, reviseKernelDraft, stageKernelArtifact, type ConversationKernel, type KernelScope } from './ai-conversation-kernel.js';
import { prepareFoundationApproval, assertFoundationApproval, canonicalFoundationJson, strictAiActor } from './ai-foundation-approval.js';
import { loadAssistantState, saveAssistantState, upsertAssistantThread } from '../storage/assistant-store.js';
import { resumeVaultSession } from '../storage/vault.js';
import { prepareAssistantContext } from './ai-assistant-foundation.js';
import { scopeVault } from './workspaces.js';
import { orchestrateAiToolRequest, type AiToolOrchestrationResult } from './ai-tool-client.js';
import type { VaultPayload } from '../types.js';
import { applyWorkspaceCommand, workspaceDrafting, type WorkspaceCommand } from './ai-workspace-model.js';
import { reviewAiDocumentProposal } from './ai-document-review.js';
import { DEFAULT_AI_CONVERSATION_PREFERENCES, normalizeAiConversationPreferences, resolveAiConversationReplyLanguage, type AiConversationExperiencePreferences } from './ai-conversation-mode.js';
import { conversationModePermitsCapability, normalizeAiConversationMode, type AiConversationMode } from './ai-conversation-mode.js';

// Compatibility boundary only. Product logic lives in typed kernel/gateway modules.
type Host=any;
let storeQueue:Promise<unknown>=Promise.resolve();
const flush=(host:Host)=>new Promise<void>(resolve=>host.setState({},resolve));
const currentConversationMode=(host:Host):AiConversationMode=>normalizeAiConversationMode(host.__intelligenceKernel?.mode);
export const currentAiExperiencePreferences=(host:Host):AiConversationExperiencePreferences=>normalizeAiConversationPreferences(host.__aiConversationPreferences||DEFAULT_AI_CONVERSATION_PREFERENCES);
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
  const run=async()=>{const resumed=await resumeVaultSession();if(!resumed)throw new Error('Account workspace is not ready to save this conversation. Sign in and retry.');
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
  const generation=host.__workspaceLoadGeneration;
  const resumed=await resumeVaultSession();if(!resumed)throw new Error('Account workspace is not ready. Sign in and retry.');
  const store=scope.scope==='temporary'?null:await loadAssistantState(resumed.key);
  // Superseded loads may finish after the user retries, changes thread or
  // switches account. Never let an old cache read install its scoped kernel.
  if(generation!==host.__workspaceLoadGeneration||kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(scope))
    throw new Error('Conversation changed while loading. Retry loading.');
  host.__aiConversationPreferences=normalizeAiConversationPreferences(store?.aiPreferences);
  const thread=store?.threads.find(row=>row.id===scope.threadId&&row.scope===scope.scope&&row.workspaceId===scope.workspaceId&&row.branchId===scope.branchId);
  // A truly new thread defaults to Controller. Existing legacy threads without
  // valid mode metadata fail closed to Advisor; never infer elevated permission.
  host.__intelligenceKernel=thread?normalizeConversationKernel(thread.kernel,scope):newConversationKernel(scope);
  host.__foundationReceipts=thread?.foundationReceipts||[];
  host.__foundationVault=vault;
  // Read-only Advisor must never surface or re-stage a stored execution proposal.
  if(currentConversationMode(host)==='advisor'){
    if(host.state.proposal||host.state.review){host.setState({proposal:null,review:null});await flush(host);}
  }else{
    if(!host.__intelligenceKernel.artifact){const pending=[...(host.__intelligenceKernel.missions||[])].reverse().find((m:any)=>m.steps.some((s:any)=>s.status==='needs_approval'));if(pending){host.setState({proposal:pendingMissionProposal(pending),review:null});await flush(host);}}
    if(host.__intelligenceKernel.artifact){const proposal=host.__intelligenceKernel.artifact.proposal;const review=reviewAiDocumentProposal(proposal,workspaceDrafting(vault,proposal.capability==='document.updateDraft'?proposal.documentId:''),host.props.language==='ar'?'ar':'en');host.setState({proposal,review});await flush(host);}
  }
}
/** Refresh when opening/switching workspace, not only when sending a model request. */
export async function refreshIntelligenceWorkspace(host:Host):Promise<void>{
  await host.__lourexLoadPromise;
  const generation=host.__workspaceLoadGeneration;
  const resumed=await resumeVaultSession();if(!resumed)throw new Error('Account workspace is not ready. Sign in and retry.');
  const requestedScope=scopeFor(host,resumed.vault),expected=requestedScope.scope==='personal'?'personal':requestedScope.scope==='temporary'?'temporary':requestedScope.workspaceId+'|'+requestedScope.branchId;
  if(host.__lourexAssistantWorkspaceKey!==expected){
    // Use the saved scope loader directly; the public UI wrapper also calls
    // refresh(), and invoking it from refresh would recurse on a failed load.
    const setScope=host.__workspaceBaseSetScope||host.__lourexSetScope;
    if(!setScope)throw new Error('Conversation scope loader is unavailable.');
    await setScope(requestedScope.scope);
    if(host.__lourexAssistantWorkspaceKey!==expected)throw new Error('Conversation scope did not load. Retry loading.');
  }
  if(generation!==host.__workspaceLoadGeneration)throw new Error('Conversation changed while loading. Retry loading.');
  strictAiActor(resumed.vault);await hydrateKernel(host,resumed.vault);host.__foundationVault=resumed.vault;
  // hydrateKernel creates the first thread ID when none has been saved. Read the
  // scope AFTER hydration, otherwise the fresh-session check compares the old
  // empty thread ID with the newly generated ID and the UI never becomes ready.
  const scope=scopeFor(host,resumed.vault);
  if(generation!==host.__workspaceLoadGeneration)throw new Error('Conversation changed while loading. Retry loading.');
  if(scope.scope==='business'){
    const [memory,threads]=await Promise.all([loadAssistantMemory(resumed.key),loadAssistantState(resumed.key)]);
    const fresh=await resumeVaultSession();if(!fresh||kernelScopeKey(scopeFor(host,fresh.vault))!==kernelScopeKey(scope))throw new Error('Scope changed while reading business memory.');
    host.__businessMemories=scopedAssistantMemories(memory,'business',scope.workspaceId,scope.branchId);
    host.__businessThreads=threads.threads.filter(t=>t.scope==='business'&&t.workspaceId===scope.workspaceId&&t.branchId===scope.branchId&&(!t.kernel?.scope.accountId||t.kernel.scope.accountId===scope.accountId)).map(t=>({id:t.id,title:t.title,updatedAt:t.updatedAt,hasArtifact:Boolean(t.kernel?.artifact),artifactTitle:t.kernel?.artifact?.proposal.label||'',mode:normalizeAiConversationMode(t.kernel?.mode)}));
  }else{host.__businessMemories=[];host.__businessThreads=[];}

  // A Personal or Temporary thread must obey the same account/thread stability
  // rule as Business after asynchronous hydration. Never expose stale state
  // across a user switch while local cache reads are still pending.
  const live=await resumeVaultSession();
  if(!live||generation!==host.__workspaceLoadGeneration||kernelScopeKey(scopeFor(host,live.vault))!==kernelScopeKey(scope))
    throw new Error('Account, conversation or workspace changed during loading.');
  const proposal=host.state.proposal;
  if(currentConversationMode(host)==='controller'&&(proposal?.capability==='document.createDraft'||proposal?.capability==='document.updateDraft')){
    stageKernelArtifact(host.__intelligenceKernel,proposal);
    host.setState({review:reviewAiDocumentProposal(proposal,workspaceDrafting(resumed.vault,proposal.capability==='document.updateDraft'?proposal.documentId:''),host.props.language==='ar'?'ar':'en')});
  }
  await flush(host);
}
async function runIntelligenceWorkspace(host:Host,command:WorkspaceCommand):Promise<void>{
  if(currentConversationMode(host)!=='controller')throw new Error('Advisor can analyze but cannot edit a workspace. Switch to Controller.');
  if(host.state.busy||host.applying||host.__foundationTurnBusy||host.__workspaceCommandBusy)return;
  host.__workspaceCommandBusy=true;
  try{
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Account workspace is not ready. Sign in and retry.');
    strictAiActor(resumed.vault);const kernel=host.__intelligenceKernel as ConversationKernel|undefined;
    if(!kernel||kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))throw new Error('Company, branch, account or conversation changed. Reopen the workspace.');
    const changesDraft=['cell','customer','product','add-line','undo','redo','reprice','terms','composer'].includes(command.kind);
    // Reject stale reviewed business state before changing an existing proposal.
    if(changesDraft&&kernel.artifact?.proposal&&(kernel.artifact.proposal as any).foundationApproval)assertFoundationApproval(resumed.vault,kernel.artifact.proposal);
    const next=structuredClone(kernel);applyWorkspaceCommand(next,resumed.vault,command);
    let review;
    if(changesDraft&&next.artifact){
      const p=next.artifact.proposal as any;delete p.foundationApproval;stampProposal(host,p,resumed.vault);
      review=reviewAiDocumentProposal(p,workspaceDrafting(resumed.vault,p.capability==='document.updateDraft'?p.documentId:''),host.props.language==='ar'?'ar':'en');
    }
    if(changesDraft&&next.artifact)stageReviewedMission(next,next.artifact.proposal);
    host.__intelligenceKernel=next;host.__foundationVault=resumed.vault;
    if(changesDraft&&next.artifact)host.setState({proposal:next.artifact.proposal,review,error:''});
    if(command.kind==='cancel-mission'){const p=host.state.proposal,steps=p?.capability==='tool.plan'?p.steps:[p];if(steps?.some((s:any)=>missionStep(next.missions||[],s)?.mission.id===command.missionId))host.setState({proposal:null,review:null});}
    host.setState({error:''});await flush(host);await persistKernel(host);
  }catch(error){host.setState({error:error instanceof Error?error.message:String(error)});}
  finally{host.__workspaceCommandBusy=false;await flush(host);}
}
export async function dismissIntelligenceWorkspace(host:Host):Promise<void>{
  if(host.__workspaceCommandBusy||host.applying||host.state.busy)return;
  if(host.__intelligenceKernel)host.__intelligenceKernel.artifact=undefined;
  host.setState({proposal:null,review:null,__workspaceSavedId:'',__workspaceEditing:false});await flush(host);await persistKernel(host);
}
/** Encrypted AI-only preferences are account-scoped and independent from
 * LOUREX site locale. Uses the same serialized store queue as chat persistence
 * so a simultaneous conversation save cannot discard a settings change. */
export async function updateAiExperiencePreferences(host:Host,patch:Partial<AiConversationExperiencePreferences>):Promise<void>{
  if(host.__aiPreferencesSaving){host.setState({__workspaceSettingsError:'AI settings are still being saved. Please try again shortly.'});return;}
  host.__aiPreferencesSaving=true;
  host.setState({__workspaceSettingsSaving:true,__workspaceSettingsError:''});
  const accountId=activeAccountStorageUid()||'';
  try{
    const run=async()=>{
      const session=await resumeVaultSession();
      if(!session||!accountId||activeAccountStorageUid()!==accountId)throw new Error('Account changed. Reopen AI settings.');
      const state=await loadAssistantState(session.key);
      if(activeAccountStorageUid()!==accountId)throw new Error('Account changed during settings update.');
      const preferences=normalizeAiConversationPreferences({...state.aiPreferences,...patch});
      await saveAssistantState(session.key,{...state,aiPreferences:preferences});
      if(activeAccountStorageUid()!==accountId)throw new Error('Account changed while saving AI settings. Reopen the assistant.');
      host.__aiConversationPreferences=preferences;
      host.setState({__workspaceSettingsError:''});
    };
    const task=storeQueue.catch(()=>undefined).then(run);
    storeQueue=task;
    await task;
  }catch(error){
    host.setState({__workspaceSettingsError:error instanceof Error?error.message:String(error)});
  }finally{
    host.__aiPreferencesSaving=false;
    host.setState({__workspaceSettingsSaving:false});
  }
}

/**
 * Assign a mode only to an empty, authenticated thread. Never relabel a
 * conversation that already contains business messages or working artifacts:
 * mode changes must switch threads, not silently grant permissions.
 */
export async function assignIntelligenceConversationMode(host:Host,mode:AiConversationMode):Promise<void>{
  if(mode!=='controller'&&mode!=='advisor')throw new Error('Unknown conversation mode.');
  if(host.state.busy||host.applying||host.__foundationTurnBusy||host.__workspaceCommandBusy)throw new Error('Wait for the current AI operation to finish.');
  const resumed=await resumeVaultSession();
  if(!resumed)throw new Error('Sign in before changing conversation mode.');
  const kernel=host.__intelligenceKernel as ConversationKernel|undefined;
  if(!kernel||kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))throw new Error('Conversation scope changed. Reopen LOUREX AI.');
  const previous=currentConversationMode(host);
  if(previous!==mode&&(kernel.turn>0||kernel.artifact||(host.state.messages||[]).length||host.state.proposal))throw new Error('Start another thread to change conversation mode; existing messages remain in their original mode.');
  kernel.mode=mode;
  kernel.focus=mode==='controller'?'operator':'advisor';
  await persistKernel(host);
  host.setState({__workspaceMode:mode,error:'',__workspaceOpen:false,__workspacePane:'chat',__workspaceSavedId:'',__workspaceEditing:false,proposal:null,review:null});
  await flush(host);
}

export function intelligenceContext(host:Host,context:any):any{
  const settings=currentAiExperiencePreferences(host);
  if(context&&typeof context==='object'){
    const latest=String(host.state.input||'').trim()||(host.state.messages||[]).filter((row:any)=>row.role==='user').at(-1)?.text||'';
    context.language=resolveAiConversationReplyLanguage(settings.replyLanguage,latest,host.props.language==='ar'?'ar':'en');
    context.aiResponseDetail=settings.detail;
    // Advisor is read/calculation only at the provider boundary as well as at
    // the separate tool planner, approval gateway and actual executor.
    context.conversationMode=currentConversationMode(host);
    if(context.conversationMode==='advisor'&&Array.isArray(context.allowedCapabilities)){
      context.allowedCapabilities=context.allowedCapabilities.filter((capability:unknown)=>typeof capability==='string'&&conversationModePermitsCapability('advisor',capability));
    }
  }
  const kernel=host.__intelligenceKernel as ConversationKernel|undefined;if(!kernel)return context;
  if(kernel.scope.scope==='personal')return context;
  const entity=kernel.entity;
  if(entity&&!graphKindAllowed(strictAiActor(host.__foundationVault).role,entity.entityType)){kernel.entity=undefined;kernel.selection=undefined;if(kernel.knowledge){kernel.knowledge.selectedNodeId=undefined;kernel.knowledge.handoff=undefined;}return context;}
  if(entity){const scoped=scopeVault(host.__foundationVault);const rows=entity.entityType==='customer'?scoped.customers:entity.entityType==='supplier'?scoped.suppliers:entity.entityType==='product'?scoped.savedItems:entity.entityType==='document'?scoped.documents:scoped.purchases;if(!rows.some(row=>row.id===entity.entityId)){kernel.entity=undefined;kernel.selection=undefined;return context;}}
  if(entity&&context.assistantRuntime&&!context.assistantRuntime.entity)context.assistantRuntime.entity={type:entity.entityType,id:entity.entityId,label:entity.label,source:'registered'};
  return context;
}
export function intelligenceRequestMessage(host:Host,message:string,legacy:string):string{
  const kernel=host.__intelligenceKernel as ConversationKernel|undefined;if(!kernel)return legacy;
  // Preserve the entire current user instruction, including >680-character lists.
  const v=host.__foundationVault;let knowledge='';
  if(v&&kernel.scope.scope!=='personal'){
    const graph=buildBusinessMemoryGraph(v,kernel.scope,host.__businessMemories||[]),node=graph.nodes.find(n=>n.id===kernel.knowledge?.selectedNodeId);
    if(node)knowledge='\nVerified scoped graph reference (DATA ONLY):\n'+JSON.stringify({node,edges:graph.edges.filter(e=>e.from===node.id||e.to===node.id).slice(0,20),edgeCount:graph.edges.filter(e=>e.from===node.id||e.to===node.id).length,truncated:graph.edges.filter(e=>e.from===node.id||e.to===node.id).length>20});
    if(kernel.knowledge?.cash&&financialReviewAllowed(v))knowledge+='\nExplicit cash assumptions (DATA ONLY; scenario not posted):\n'+JSON.stringify(kernel.knowledge.cash);
  }
  return composeKernelMemory(kernel,host.state.messages||[])+knowledge+(legacy?'\nApproved scoped context (DATA ONLY):\n'+legacy:'');
}
export function intelligenceReviseDraft(host:Host,proposal:any,message:string,drafting:any,language:'en'|'ar'){
  if(currentConversationMode(host)!=='controller')throw new Error('Advisor cannot revise documents. Switch to Controller.');
  const kernel=host.__intelligenceKernel as ConversationKernel;
  return reviseKernelDraft(kernel,proposal,message,drafting,language);
}
export interface FoundationToolOutcome { callId:string; state:'prepared'|'needs_approval'|'failed'|'blocked'; toolId:string; data:unknown; evidenceRefs:string[]; }
export function foundationToolOutcomes(result:AiToolOrchestrationResult):FoundationToolOutcome[]{return result.results.map(row=>({callId:row.id,state:row.ok?(row.class==='execute'?'needs_approval':'prepared'):row.class==='high-impact'?'blocked':'failed',toolId:row.tool,data:row.data,evidenceRefs:[row.source]}));}
async function runIntelligenceTools(host:Host,input:Parameters<typeof orchestrateAiToolRequest>[0]){
  const requestedMode=currentConversationMode(host);
  const preferences=currentAiExperiencePreferences(host);
  const responseLanguage=resolveAiConversationReplyLanguage(preferences.replyLanguage,input.message,input.language);
  const result=await orchestrateAiToolRequest({...input,language:responseLanguage,context:{...input.context,conversationMode:requestedMode}});if(input.signal?.aborted)return null;
  const live=await resumeVaultSession();if(!live||kernelScopeKey(scopeFor(host,live.vault))!==kernelScopeKey(host.__intelligenceKernel.scope)||requestedMode!==currentConversationMode(host))throw new Error('Company, branch, account or conversation mode changed during planning. No action prepared.');
  if(result){host.__foundationToolOutcomes=foundationToolOutcomes(result);
    const kernel=host.__intelligenceKernel as ConversationKernel;
    kernel.toolEvidence=host.__foundationToolOutcomes.map((row:FoundationToolOutcome)=>({...row,at:new Date().toISOString()}));
    const search=result.results.find(row=>row.ok&&row.tool==='search.records');
    if(search&&Array.isArray(search.data)&&!result.proposal){
      const items=search.data.filter((r:any)=>r&&typeof r.id==='string'&&typeof r.label==='string'&&['customer','supplier','product','document','purchase'].includes(r.type)).map((r:any)=>({entityType:r.type,entityId:r.id,label:r.label}));
      kernel.selection={id:crypto.randomUUID(),items};
      (result as any).foundationSelectionText=(responseLanguage==='ar'?'نتائج البحث:':'Search results:')+'\n'+items.map((r:any,i:number)=>`${i+1}. ${r.label} [${r.entityId}]`).join('\n');
    }
  }
  // No ordinal set from compact summaries: only an explicitly displayed exact list.
  return result;
}
function stampProposal(host:Host,proposal:any,vault:VaultPayload):void{
  if(!proposal)return;
  if(proposal.capability==='tool.plan'){for(const step of proposal.steps||[])stampProposal(host,step,vault);return;}
  const kernel=host.__intelligenceKernel as ConversationKernel;
  if(!conversationModePermitsCapability(currentConversationMode(host),proposal.capability))throw new Error('Advisor cannot prepare or approve business actions. Switch to Controller.');
  const previous=proposal.foundationApproval;
  if(previous&&canonicalFoundationJson(proposal)===previous.payload)return;
  proposal.foundationApproval=prepareFoundationApproval(vault,proposal,kernel.scope);
}
function stageReviewedMission(kernel:ConversationKernel,proposal:any):void{
  if(kernel.scope.scope==='personal')return;
  const steps=proposal?.capability==='tool.plan'?proposal.steps:[proposal];
  if(!steps?.length||steps.some((p:any)=>!p?.foundationApproval))return;
  if(steps.every((p:any)=>missionStep(kernel.missions||[],p)))return;
  const all=kernel.missions||[];
  // Editing the active draft supersedes only its unstarted review. Completed writes survive.
  if(['document.createDraft','document.updateDraft'].includes(proposal.capability))for(const mission of all)for(const s of mission.steps){const previous=s.proposal;if(s.status==='needs_approval'&&previous?.capability===proposal.capability&&(proposal.capability==='document.createDraft'||previous.documentId===proposal.documentId)){s.status='cancelled';mission.interruptedReason='Draft revised; review the new revision.';}}

  // Keep pending/uncertain receipts; only discard old wholly terminal missions.
  if(all.length>=10){const i=all.findIndex(m=>m.steps.every(s=>['completed','cancelled'].includes(s.status)));if(i<0)throw new Error('Review or cancel pending missions before preparing another.');all.splice(i,1);}
  kernel.missions=[...all,createMission(kernel.scope,proposal,kernel.toolEvidence||[])];
}
/** Match the exact visible proposal or a step of its currently displayed plan.
 * A stale proposal cannot become actionable just because its envelope was valid. */
function approvalIsCurrent(host:Host,proposal:any):boolean{
  const active=host.state.proposal;
  return active===proposal||(active?.capability==='tool.plan'&&Array.isArray(active.steps)&&active.steps.includes(proposal));
}
/** Reviewing a whole plan acknowledges only steps still belonging to that plan. */
function approvalWasReviewed(host:Host,proposal:any):boolean{
  return approvalIsCurrent(host,proposal)&&
    (host.state.__workspaceReviewedProposal===proposal||host.state.__workspaceReviewedProposal===host.state.proposal);
}
async function runIntelligenceApproval(host:Host,proposal:any,apply:()=>Promise<unknown>):Promise<unknown>{
  if(host.__foundationApprovalBusy||host.__workspaceCommandBusy||host.__workspaceModeSwitchBusy||!proposal)return;host.__foundationApprovalBusy=true;
  let receipt:any,step:MissionStep|undefined;
  try{
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Account workspace is not ready for approval. Sign in and retry.');
    const kernel=host.__intelligenceKernel as ConversationKernel;
    if(!kernel||kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))throw new Error('Conversation scope changed. Review the action again.');
    if(currentConversationMode(host)!=='controller')throw new Error('Advisor cannot approve actions. Switch to Controller and review again.');
    if(!proposal.foundationApproval)throw new Error('This action has no current review envelope. Ask to prepare it again.');
    assertFoundationApproval(resumed.vault,proposal);
    // Give an attempted receipt its precise non-replayable failure before
    // generic stale-view checks; never start a second write for the same ID.
    if((host.__foundationReceipts||[]).some((r:any)=>r.id===proposal.foundationApproval.id))throw new Error('This approval was already attempted. Check the saved record before preparing a new action.');
    // Block stale actions, including steps detached from a superseded plan.
    if(!approvalIsCurrent(host,proposal))throw new Error('The proposed action changed. Review it again.');
    // UI visibility alone is not authorization: acknowledge the exact active
    // proposal, or the current plan containing this step, before execution.
    if(kernel.scope.scope==='business'&&proposal.capability!=='workspace.navigate'&&!approvalWasReviewed(host,proposal))
      throw new Error('Review and acknowledge this exact action before approval.');
    if(proposal.capability==='document.createDraft'||proposal.capability==='document.updateDraft'){
      const review=reviewAiDocumentProposal(proposal,workspaceDrafting(resumed.vault,proposal.capability==='document.updateDraft'?proposal.documentId:''),host.props.language==='ar'?'ar':'en');
      host.setState({review});
      if(review.blockers.length)throw new Error(review.blockers.join(' '));
    }
    if(!missionStep(kernel.missions||[],proposal))stageReviewedMission(kernel,proposal);
    step=beginMissionStep(kernel.missions||[],proposal);
    receipt={id:proposal.foundationApproval.id,state:'applying',at:new Date().toISOString(),actorId:proposal.foundationApproval.actorId,action:proposal.tool||proposal.capability,payload:proposal.foundationApproval.payload};
    host.__foundationReceipts=[...(host.__foundationReceipts||[]),receipt].slice(-100);
    await persistKernel(host); // Crash after commit cannot silently replay an uncertain action.
    // Persistence can await IndexedDB. Re-check the live session and visible
    // proposal afterwards so switching account, thread or mode cannot race apply().
    const live=await resumeVaultSession();
    if(!live||kernelScopeKey(scopeFor(host,live.vault))!==kernelScopeKey(kernel.scope)||
       currentConversationMode(host)!=='controller'||!approvalIsCurrent(host,proposal))
      throw new Error('Account, company, conversation or action changed during approval. Nothing was applied.');
    if(kernel.scope.scope==='business'&&proposal.capability!=='workspace.navigate'&&!approvalWasReviewed(host,proposal))
      throw new Error('The action review changed during approval. Nothing was applied.');
    assertFoundationApproval(live.vault,proposal);
    const result=await apply();await flush(host);
    if(host.state.error||(result===undefined&&host.state.proposal===proposal)){receipt.state='uncertain';}
    else{receipt.state='applied';receipt.completedAt=new Date().toISOString();receipt.resultId=(result as any)?.id||host.state.messages?.at(-1)?.artifact?.document?.id||'';if((kernel.artifact?.proposal as any)?.foundationApproval?.id===proposal.foundationApproval.id)kernel.artifact=undefined;
      const latest=await resumeVaultSession(),mission=missionStep(kernel.missions||[],proposal)?.mission;
      if(latest&&mission){const visible=host.state.proposal?.capability==='tool.plan'?host.state.proposal.steps:[host.state.proposal];for(const pending of mission.steps){if(pending===step||pending.status!=='needs_approval'||!pending.proposal)continue;const oldId=pending.approvalId,p=structuredClone(pending.proposal);delete p.foundationApproval;stampProposal(host,p,latest.vault);pending.approvalId=p.foundationApproval.id;pending.proposal=p;pending.payload=canonicalFoundationJson(p);for(const row of visible||[])if(row?.foundationApproval?.id===oldId)row.foundationApproval=p.foundationApproval;}}

    }
    finishMissionStep(step,receipt.state==='applied',receipt.resultId||'');
    await persistKernel(host);return result;
  }catch(error){if(receipt){receipt.state='uncertain';finishMissionStep(step,false);await persistKernel(host).catch(()=>undefined);}host.setState({busy:false,error:error instanceof Error?error.message:String(error)});return undefined;}
  finally{host.__foundationApprovalBusy=false;}
}
export function installIntelligenceRuntime(host:Host):void{
  if(host.__intelligenceInstalled)return;host.__intelligenceInstalled=true;
  const ask=host.ask.bind(host),approve=host.approveProposal.bind(host);
  host.approveProposal=()=>intelligenceApprove(host,host.state.proposal,approve);
  host.ask=async(raw?:string)=>{
    if(host.pending||host.applying||host.state.busy||host.__foundationTurnBusy)return;host.__foundationTurnBusy=true;const started=performance.now();let turnScope='';
    try{
      await host.__lourexLoadPromise;const resumed=await resumeVaultSession();if(!resumed)throw new Error('Account workspace is not ready. Sign in and retry.');
      // Existing lifecycle owns history; resolve it before loading structured references.
      const scope=scopeFor(host,resumed.vault);
      if(host.__intelligenceKernel&&host.__intelligenceKernel.scope.accountId!==scope.accountId){host.__intelligenceKernel=undefined;host.__foundationReceipts=[];await host.__lourexSetScope(scope.scope);}
      const expected=scope.scope==='personal'?'personal':scope.scope==='temporary'?'temporary':scope.workspaceId+'|'+scope.branchId;
      if(host.__lourexAssistantWorkspaceKey!==expected)await host.__lourexSetScope(scope.scope);
      await hydrateKernel(host,resumed.vault);host.__foundationVault=resumed.vault;
      strictAiActor(resumed.vault);const kernel=host.__intelligenceKernel as ConversationKernel;turnScope=kernelScopeKey(kernel.scope);kernel.turn++;
      if(currentConversationMode(host)==='controller'&&!host.state.proposal&&kernel.artifact){host.setState({proposal:kernel.artifact.proposal});await flush(host);}
      if(currentConversationMode(host)==='advisor'&&host.state.proposal){host.setState({proposal:null,review:null});await flush(host);}
      const message=String(raw??host.state.input).trim();
      const previewId=currentConversationMode(host)==='controller'?savedDocumentPreviewId(kernel,resumed.vault,message):null;
      if(previewId){
        if(!graphKindAllowed(strictAiActor(resumed.vault).role,'document'))throw new Error('This role cannot review documents.');
        const fresh=await resumeVaultSession();
        if(!fresh||kernelScopeKey(scopeFor(host,fresh.vault))!==turnScope||savedDocumentPreviewId(kernel,fresh.vault,message)!==previewId)throw new Error('Document scope changed. Ask for the preview again.');
        host.__foundationVault=fresh.vault;
        host.setState((state:any)=>({input:'',error:'',__workspaceOpen:true,__workspacePane:'workspace',__workspaceTab:'preview',__workspaceSavedId:previewId,messages:[...state.messages,{id:crypto.randomUUID(),role:'user',text:message},{id:crypto.randomUUID(),role:'assistant',text:host.props.language==='ar'?'فتحت معاينة المستند للقراءة فقط. لم أعدّل أو أحفظ أي سجل.':'Opened a read-only document preview. No record changed or saved.'}]}));
        await flush(host);await persistKernel(host);return;
      }
      const commercialCommand=currentConversationMode(host)==='controller'?commercialDraftCommand(kernel,resumed.vault,message):null;
      if(commercialCommand){
        if((kernel.artifact!.proposal as any).foundationApproval)assertFoundationApproval(resumed.vault,kernel.artifact!.proposal);
        const next=structuredClone(kernel);applyWorkspaceCommand(next,resumed.vault,commercialCommand);
        const p=next.artifact!.proposal as any;delete p.foundationApproval;stampProposal(host,p,resumed.vault);stageReviewedMission(next,p);
        const review=reviewAiDocumentProposal(p,workspaceDrafting(resumed.vault,p.capability==='document.updateDraft'?p.documentId:''),host.props.language==='ar'?'ar':'en');
        host.__intelligenceKernel=next;host.setState((state:any)=>({input:'',proposal:p,review,error:'',__workspaceSavedId:'',messages:[...state.messages,{id:crypto.randomUUID(),role:'user',text:message},{id:crypto.randomUUID(),role:'assistant',text:host.props.language==='ar'?'عدّلت المسودة فقط. راجع الفروق والشروط قبل الحفظ.':'Draft revised only. Review its diff and terms before saving.'}]}));await flush(host);await persistKernel(host);return;
      }

      if(!kernel.artifact){const selected=resolveKernelSelection(kernel,message);if(selected){const scoped=scopeVault(resumed.vault);const rows=selected.entityType==='customer'?scoped.customers:selected.entityType==='supplier'?scoped.suppliers:selected.entityType==='product'?scoped.savedItems:selected.entityType==='document'?scoped.documents:scoped.purchases;if(!rows.some(row=>row.id===selected.entityId)){kernel.selection=undefined;kernel.entity=undefined;throw new Error('The displayed selection is stale. Search again.');}host.setState((state:any)=>({input:'',messages:[...state.messages,{id:crypto.randomUUID(),role:'user',text:message},{id:crypto.randomUUID(),role:'assistant',text:selected.label}]}));await flush(host);await persistKernel(host);return;}}
      await ask(raw);await flush(host);await host.__lourexAssistantPersistQueue;
      if(kernelScopeKey(scopeFor(host,resumed.vault))!==kernelScopeKey(kernel.scope))return;
      const proposal=host.state.proposal;
      if(currentConversationMode(host)==='advisor'){
        if(proposal){host.setState({proposal:null,review:null});await flush(host);}
      }else if(proposal){stampProposal(host,proposal,resumed.vault);stageReviewedMission(kernel,proposal);if(proposal.capability==='document.createDraft'||proposal.capability==='document.updateDraft')stageKernelArtifact(kernel,proposal);}
      await persistKernel(host);
    }catch(error){host.setState({busy:false,error:error instanceof Error?error.message:String(error)});}
    finally{host.__foundationTurnBusy=false;await recordDiagnostic(host,'turn',started,turnScope);}
  };
}

async function recordDiagnostic(host:Host,operation:DiagnosticOperation,start:number,expectedScope:string,override?:'failed'|'uncertain'):Promise<void>{
  const k=host.__intelligenceKernel as ConversationKernel|undefined;if(!k||!expectedScope||kernelScopeKey(k.scope)!==expectedScope)return;
  const state=override||(operation==='approval'&&(host.__foundationReceipts||[]).at(-1)?.state==='uncertain'?'uncertain':host.state.error?'failed':'completed');
  k.diagnostics=normalizeDiagnostics([...(k.diagnostics||[]),diagnosticSample(operation,start,state)]);
  // Diagnostics are not a prerequisite to an already verified business commit.
  await persistKernel(host).catch(()=>undefined);
}
export async function updateIntelligenceWorkspace(host:Host,command:WorkspaceCommand):Promise<void>{if(host.state.busy||host.applying||host.__foundationTurnBusy||host.__workspaceCommandBusy)return;const start=performance.now(),scope=host.__intelligenceKernel?.scope&&kernelScopeKey(host.__intelligenceKernel.scope);try{await runIntelligenceWorkspace(host,command);}catch(error){host.setState({error:error instanceof Error?error.message:String(error)});}if(command.kind!=='clear-diagnostics')await recordDiagnostic(host,'workspace',start,scope||'');}
export async function intelligenceApprove(host:Host,proposal:any,apply:()=>Promise<unknown>):Promise<unknown>{if(host.__foundationApprovalBusy||host.__workspaceCommandBusy||!proposal)return;const start=performance.now(),scope=host.__intelligenceKernel?.scope&&kernelScopeKey(host.__intelligenceKernel.scope);const result=await runIntelligenceApproval(host,proposal,apply);await recordDiagnostic(host,'approval',start,scope||'');return result;}
export async function intelligenceTools(host:Host,input:Parameters<typeof orchestrateAiToolRequest>[0]){const start=performance.now(),scope=host.__intelligenceKernel?.scope&&kernelScopeKey(host.__intelligenceKernel.scope);let state:'failed'|'uncertain'|undefined;try{const result=await runIntelligenceTools(host,input);if(input.signal?.aborted)state='uncertain';else if(result?.results.some(row=>!row.ok))state='failed';return result;}catch(error){state='failed';throw error;}finally{await recordDiagnostic(host,'tools',start,scope||'',state);}}
