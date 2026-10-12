import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newConversationKernel,normalizeConversationKernel,reconcileCancelledApprovals} from '../dist/src/lib/ai-conversation-kernel.js';
import {createMission,beginMissionStep,pendingMissionProposal} from '../dist/src/lib/ai-mission-runner.js';
import {normalizeAssistantState} from '../dist/src/storage/assistant-store.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f14-thread'};
const approvalId='declined-approval-001';
function makeKernel(){
  const k=newConversationKernel(scope);
  const proposal={capability:'tool.execute',tool:'product.importSource',args:{},label:'Import products',foundationApproval:{id:approvalId}};
  const mission=createMission(scope,proposal);
  k.missions=[mission];
  // A stale artifact may have been stored by an older render while the dialog was visible.
  k.artifact={id:'artifact-f14',revision:1,proposal,undo:[],redo:[],lineIds:[]};
  return{k,proposal};
}
function decline(kernel){
  kernel.cancelledApprovals=[...(kernel.cancelledApprovals||[]),approvalId];
  return reconcileCancelledApprovals(kernel);
}
test('F14 rejected approval stays cancelled after JSON rehydration, not a pending action',()=>{
  const {k,proposal}=makeKernel();const rejected=decline(k);
  const restored=normalizeConversationKernel(JSON.parse(JSON.stringify(rejected)),scope);
  assert.equal(restored.artifact,undefined);
  assert.equal(restored.missions[0].steps[0].status,'cancelled');
  assert.equal(pendingMissionProposal(restored.missions[0]),null);
  assert.throws(()=>beginMissionStep(restored.missions,proposal),/replayed|changed/);
});
test('F14 old kernel snapshots cannot revive a rejected proposal',()=>{
  const {k}=makeKernel();
  const stale=structuredClone(k),rejected=decline(k);
  const reconciled=reconcileCancelledApprovals(stale,rejected);
  assert.equal(reconciled.artifact,undefined);
  assert.equal(reconciled.missions[0].steps[0].status,'cancelled');
  assert.deepEqual(reconciled.cancelledApprovals,[approvalId]);
});
test('F14 encrypted local store survives late legacy messages and stale saves',async()=>{
  const records=new Map();
  globalThis.__f14Db={getRecord:async id=>records.get(id)||null,putRecord:async value=>{records.set(value.id,structuredClone(value));}};
  const storeSource=(await readFile(new URL('../dist/src/storage/assistant-store.js',import.meta.url),'utf8'))
    .replace(/import .* from '.*';/g,line=>line.includes("'./db.js'")
      ?'const {getRecord,putRecord}=globalThis.__f14Db;'
      :line.replace("'../lib/ai-conversation-kernel.js'",JSON.stringify(new URL('../dist/src/lib/ai-conversation-kernel.js',import.meta.url).href))
        .replace("'../lib/ai-conversation-mode.js'",JSON.stringify(new URL('../dist/src/lib/ai-conversation-mode.js',import.meta.url).href)));
  const store=await import('data:text/javascript;base64,'+Buffer.from(storeSource).toString('base64')+'#'+crypto.randomUUID());
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  const {k}=makeKernel();
  const initial=normalizeAssistantState({version:1,threads:[{id:scope.threadId,scope:'business',workspaceId:scope.workspaceId,branchId:scope.branchId,messages:[],kernel:k}]});
  await store.saveAssistantState(key,initial);
  const stale=await store.loadAssistantState(key);
  // A declining conversation and a previous-generation message save run close together.
  await store.mutateAssistantState(key,state=>{
    const thread=state.threads.find(row=>row.id===scope.threadId);
    decline(thread.kernel);
    return state;
  });
  await store.persistAssistantThread(key,{threadId:scope.threadId,scope:'business',workspaceId:scope.workspaceId,branchId:scope.branchId,messages:[{role:'user',text:'Analyze the CURRENT file only'}]});
  await store.saveAssistantState(key,stale); // Simulates an outdated UI snapshot arriving last.
  const final=await store.loadAssistantState(key);
  const restored=final.threads[0].kernel;
  assert.equal(restored.artifact,undefined);
  assert.deepEqual(restored.cancelledApprovals,[approvalId]);
  assert.equal(restored.missions[0].steps[0].status,'cancelled');
  assert.equal(pendingMissionProposal(restored.missions[0]),null);
  assert.equal(records.get('assistant-state').version,1);
  assert.ok(!JSON.stringify(records.get('assistant-state')).includes('Import products'));
  delete globalThis.__f14Db;
});
test('F14 close handler persists cancellation before clearing proposal or recording legacy dismissal',async()=>{
  const runtime=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
  const ui=await readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
  const dismiss=runtime.slice(runtime.indexOf('export async function dismissIntelligenceWorkspace('),runtime.indexOf('/** Encrypted AI-only preferences'));
  assert.match(dismiss,/await persistKernel\(host\)/);
  assert.match(dismiss,/reconcileCancelledApprovals\(next\)/);
  assert.ok(dismiss.indexOf('await persistKernel(host)')<dismiss.indexOf('host.setState({review:null'));
  assert.match(ui,/dismissIntelligenceWorkspace\(host,proposal\)\.then\(\(\)=>/);
  assert.match(ui,/host\.__workspaceDismissBusy=true/);
});
