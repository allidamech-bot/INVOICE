import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {stageKernelArtifact,newConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const result=()=>({results:[],proposal:null,plan:{version:1,goal:'Synthetic',calls:[]},plannedBy:'local'});

test('planning discards a result after its kernel was invalidated, without a raw TypeError',async()=>{
 const planned=deferred(),started=deferred();
 const {runtime,host,vault}=await compiledReliabilityHarness(emptyVault(),async()=>{started.resolve();return planned.promise;});
 const h=host();h.props.language='en';await runtime.refreshIntelligenceWorkspace(h);
 const pending=runtime.intelligenceTools(h,{message:'Synthetic review',language:'en',context:{}});
 await started.promise;h.__intelligenceKernel=undefined;planned.resolve(result());
 await assert.rejects(pending,error=>!(error instanceof TypeError)&&/reopen|changed/i.test(error.message));
 assert.equal(h.state.proposal,null);
});

// A deferred, synthetic remote installer uses the real encrypted assistant store.
// No Firebase, browser, or live AI provider is involved.
async function raceFixture({deleted=false,artifact=false}={}){
 const planning=deferred(),started=deferred(),synced=deferred();let calls=0,signal,fixture,armed=false;const initialSync=deferred();
 const dependencies={activeAccountStorageUid:()=> 'synthetic-account',synchronizeAssistantHistory:async(_uid,key,options)=>{
   if(options.installRemote&&!armed){initialSync.resolve();return {uploaded:0,downloaded:0};}
   if(options.installRemote){
     await fixture.store.mutateAssistantState(key,current=>{
       if(deleted)return {...current,threads:current.threads.filter(t=>t.id!=='reliability-thread'),deletedThreads:{...current.deletedThreads,'reliability-thread':'2026-10-27T00:00:00Z'}};
       const saved=fixture.store.upsertAssistantThread(current,{threadId:'reliability-thread',scope:'business',workspaceId:'default',branchId:'main',messages:[{id:'remote',role:'assistant',text:'Synthetic remote update'}]});
       saved.thread.kernel={version:1,scope:{scope:'business',workspaceId:'default',branchId:'main',threadId:'reliability-thread',accountId:'synthetic-account'},turn:0,mode:'controller',focus:'auto'};return saved.state;
     });synced.resolve();
   }return {uploaded:0,downloaded:1};
 }};
 fixture=await compiledReliabilityHarness(emptyVault(),async input=>{calls++;signal=input.signal;started.resolve();return planning.promise;},dependencies);
 const h=fixture.host();h.props.language='en';
 h.ask=async raw=>{
   const controller=new AbortController();h.requestController=controller;h.pending=true;h.setState({busy:true});
   try{const output=await fixture.runtime.intelligenceTools(h,{message:raw,language:'en',context:{},signal:controller.signal});
     if(!controller.signal.aborted)h.setState({messages:[...h.state.messages,{id:'stale-reply',role:'assistant',text:output.answer||'Old reply'}]});
   }finally{h.pending=false;h.requestController=null;h.setState({busy:false});}
 };
 fixture.runtime.installIntelligenceRuntime(h);
 await fixture.runtime.refreshIntelligenceWorkspace(h);await initialSync.promise;await setImmediate();armed=true;
 if(artifact){
   const proposal={capability:'document.createDraft',kind:'proforma',customerId:'synthetic-customer',currency:'USD',language:'en',items:[1,2,3,4,5,6].map(i=>({savedItemId:'',descriptionEn:'Synthetic '+i,descriptionAr:'',quantity:'1',unit:'PCS',unitPrice:'10'})),incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',label:'Synthetic recovery',rationale:'unsaved'};
   stageKernelArtifact(h.__intelligenceKernel,proposal);h.__intelligenceKernel.cancelledApprovals=['declined-synthetic'];
   h.__intelligenceKernel.artifact.proposal.foundationApproval={id:'obsolete-synthetic'};
 }
 return {...fixture,h,planning,started,synced,calls:()=>calls,signal:()=>signal};
}

for(const deleted of [false,true])test('remote '+(deleted?'deletion':'advance')+' cancels a live turn and preserves an unapproved local recovery', {timeout:4000},async()=>{
 const f=await raceFixture({deleted,artifact:true}),{runtime,h,planning,started,synced,store,session}=f;
 const before=structuredClone(session.vault),artifact=structuredClone(h.__intelligenceKernel.artifact);
 const turn=h.ask('Analyze synthetic company information');await started.promise;
 await runtime.refreshIntelligenceWorkspace(h);await synced.promise;
 await turn;assert.equal(f.signal().aborted,true);assert.equal(f.calls(),1);
 assert.equal(h.state.busy,false);assert.equal(h.pending,false);assert.equal(h.__foundationTurnBusy,false);
 assert.equal(h.state.__workspaceTurnPending,false);assert.equal(h.requestController,null);assert.equal(h.state.proposal,null);
 assert.match(h.state.error,/reopen|changed/i);assert.doesNotMatch(h.state.error,/undefined|TypeError/);
 planning.resolve({...result(),answer:'MUST NOT APPEAR'});await setImmediate();
 assert.ok(!h.state.messages.some(m=>m.id==='stale-reply'));
 // Finish the bounded local encrypted recovery write and reopen the active thread.
 await setImmediate();await runtime.refreshIntelligenceWorkspace(h);await setImmediate();
 if(deleted)assert.notEqual(h.__lourexAssistantThreadId,'reliability-thread','a tombstoned thread cannot reopen under its old identity');
 const state=await store.loadAssistantState(session.key),recovery=state.threads.find(t=>t.id.startsWith('ai-recovery-'));
 assert.ok(recovery);
 if(!deleted)assert.ok(state.threads.find(t=>t.id==='reliability-thread').kernel.cancelledApprovals.includes('declined-synthetic'));
 assert.deepEqual(recovery.kernel.artifact.lineIds,artifact.lineIds);
 assert.deepEqual(recovery.kernel.artifact.proposal.items,artifact.proposal.items);
 assert.deepEqual(recovery.kernel.artifact.undo,artifact.undo);
 assert.equal(recovery.kernel.artifact.proposal.foundationApproval,undefined);
 assert.ok(recovery.kernel.cancelledApprovals.includes('declined-synthetic'));
 assert.ok(recovery.kernel.cancelledApprovals.includes('obsolete-synthetic'));
 assert.deepEqual(session.vault,before);assert.equal(f.calls(),1);
 // A new, local turn is available after reopening; no provider retry.
 h.__lourexAssistantThreadId=recovery.id;h.__intelligenceKernel=undefined;await runtime.refreshIntelligenceWorkspace(h);await h.ask('١٢٣٤');assert.equal(f.calls(),1);assert.equal(h.state.busy,false);
});

for(const change of ['thread','account','company','branch','mode','replacement'])test('stale '+change+' cannot install a planner result or diagnostics in the new conversation',async()=>{
 const started=deferred(),planning=deferred();let uid='synthetic-account';
 const f=await compiledReliabilityHarness(emptyVault(),async()=>{started.resolve();return planning.promise;},{activeAccountStorageUid:()=>uid});
 const h=f.host();h.props.language='en';await f.runtime.refreshIntelligenceWorkspace(h);const old=h.__intelligenceKernel;
 const pending=f.runtime.intelligenceTools(h,{message:'synthetic',language:'en',context:{}});await started.promise;
 if(change==='thread'){h.__lourexAssistantThreadId='other';h.__intelligenceKernel=newConversationKernel({...old.scope,threadId:'other'});}
 if(change==='account')uid='other-account';
 if(change==='company'){f.session.vault.workspaces.push({...f.session.vault.workspaces[0],id:'other'});f.session.vault.branches.push({...f.session.vault.branches[0],workspaceId:'other',id:'other'});f.session.vault.appSettings.activeWorkspaceId='other';}
 if(change==='branch'){f.session.vault.branches.push({...f.session.vault.branches[0],id:'other'});f.session.vault.appSettings.activeBranchId='other';}
 if(change==='mode')old.mode='advisor';
 if(change==='replacement')h.__intelligenceKernel=structuredClone(old);
 const before=structuredClone(h.__intelligenceKernel);planning.resolve(result());
 await assert.rejects(pending,error=>error.name!=='TypeError'&&/reopen|changed/i.test(error.message));
 assert.deepEqual(h.__intelligenceKernel,before);assert.equal(h.state.proposal,null);
});

test('one provider failure releases the installed turn without automatic retry or vault mutation',async()=>{
 let calls=0;const f=await compiledReliabilityHarness(emptyVault(),async()=>{calls++;throw new Error('Synthetic provider unavailable');});const h=f.host();
 h.ask=async raw=>{h.requestController=new AbortController();h.pending=true;h.state.busy=true;return f.runtime.intelligenceTools(h,{message:raw,language:'en',context:{},signal:h.requestController.signal});};
 f.runtime.installIntelligenceRuntime(h);const before=structuredClone(f.session.vault);await h.ask('Analyze synthetic data');
 assert.equal(calls,1);assert.match(h.state.error,/provider unavailable/);assert.equal(h.state.busy,false);assert.equal(h.pending,false);assert.equal(h.requestController,null);assert.equal(h.state.__workspaceTurnPending,false);assert.deepEqual(f.session.vault,before);
});

test('saved quote read and exact follow-up prepare the correct unsaved review locally; approval remains separate',async()=>{
 const vault=emptyVault(),doc=createBlankDocument('proforma','QUO-2026-0009',vault.company);
 Object.assign(doc,{workspaceId:'default',branchId:'main',status:'draft',currency:'USD'});
 doc.items=Array.from({length:6},(_,i)=>({...doc.items[0],id:'synthetic-line-'+i,descriptionEn:'Synthetic '+i,quantity:'1',unit:'PCS',unitPrice:String([100,200,853,400,500,194][i])}));vault.documents=[doc];
 let calls=0;const f=await compiledReliabilityHarness(vault,async()=>{calls++;throw Error('Provider must not run');});const h=f.host();h.ask=async()=>{throw Error('Provider must not run');};f.runtime.installIntelligenceRuntime(h);
 const before=structuredClone(vault);await h.ask('Open preview quotation QUO-2026-0009');
 assert.equal(h.state.error,'');assert.equal(h.state.__workspaceSavedId,doc.id);
 await h.ask('Set quantity of line 3 in quotation QUO-2026-0009 to 12');
 assert.equal(h.state.error,'');assert.equal(h.__intelligenceKernel.artifact.proposal.documentId,doc.id);
 assert.deepEqual(h.__intelligenceKernel.artifact.proposal.itemEdits,[{itemId:'synthetic-line-2',quantity:'12'}]);
 assert.equal(h.state.proposal,null);await h.ask('احفظ المسودة');
 assert.equal(h.state.proposal.documentId,doc.id);assert.ok(h.state.proposal.foundationApproval);assert.equal(calls,0);assert.deepEqual(vault,before);
});

test('cancellation releases a provider that ignores abort; late resolution cannot append a reply', {timeout:4000},async()=>{
 const f=await raceFixture(),{h,started,planning}=f;
 const turn=h.ask('Analyze synthetic data');await started.promise;h.requestController.abort();await turn;
 assert.equal(f.calls(),1);assert.equal(h.state.busy,false);assert.equal(h.pending,false);assert.equal(h.requestController,null);assert.equal(h.__foundationTurnBusy,false);
 planning.resolve({...result(),answer:'LATE CANCELLED REPLY'});await setImmediate();assert.ok(!h.state.messages.some(m=>m.id==='stale-reply'));
});

test('optional explanatory handoff discards a late answer after a same-ID kernel replacement',async()=>{
 const started=deferred(),explanation=deferred();let calls=0;
 const f=await compiledReliabilityHarness(emptyVault(),async()=>({...result(),results:[{id:'read',tool:'reports.getMetrics',class:'read',ok:true,data:{},summary:'Synthetic aggregate',source:'fixture'}]}),{requestAiJson:async()=>{calls++;started.resolve();return explanation.promise;}});
 const h=f.host();h.props.language='en';await f.runtime.refreshIntelligenceWorkspace(h);
 const pending=f.runtime.intelligenceTools(h,{message:'Explain the synthetic aggregate',language:'en',context:{}});await started.promise;
 h.__intelligenceKernel=structuredClone(h.__intelligenceKernel);const before=structuredClone(h.__intelligenceKernel);explanation.resolve({answer:'STALE EXPLANATION'});
 await assert.rejects(pending,/Reopen/);assert.deepEqual(h.__intelligenceKernel,before);assert.equal(calls,1);
});
