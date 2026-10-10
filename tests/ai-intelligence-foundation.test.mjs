import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newConversationKernel,normalizeConversationKernel,stageKernelArtifact,composeKernelMemory,resolveKernelSelection,reviseKernelDraft} from '../dist/src/lib/ai-conversation-kernel.js';
import {prepareFoundationApproval,assertFoundationApproval} from '../dist/src/lib/ai-foundation-approval.js';
import {normalizeAssistantState,upsertAssistantThread} from '../dist/src/storage/assistant-store.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime,executeAiToolCall} from '../dist/src/lib/ai-tool-orchestrator.js';
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'t1'};
const proposal=()=>({capability:'document.createDraft',kind:'proforma',currency:'USD',language:'en',customerId:'',items:Array.from({length:3},(_,i)=>({savedItemId:'',descriptionEn:'Item '+i,descriptionAr:'',quantity:'10',unit:'CTN',unitPrice:'25'})),label:'Review',rationale:'Explicit user request'});
const drafting={activeDocument:null,items:[],customers:[],defaults:{currency:'USD',language:'en'}};
const person=(id,name)=>({id,workspaceId:'default',companyNameEn:name,companyNameAr:'',contactPerson:'',phone:'',email:''});
test('50 mixed Arabic/English turns retain exact draft and stable third-line identity',()=>{
 const k=newConversationKernel(scope);const p=proposal();stageKernelArtifact(k,p);const line=k.artifact.lineIds[2];
 for(let i=0;i<50;i++){k.turn++;k.focus=i%2?'advisor':'financial';const restored=normalizeConversationKernel(JSON.parse(JSON.stringify(k)),scope);Object.assign(k,restored);}
 const change=reviseKernelDraft(k,k.artifact.proposal,'عدل line 3 وخليه ٢٦ USD',drafting,'ar');
 assert.equal(change.changed,true);assert.equal(change.proposal.items[2].unitPrice,'26');assert.equal(k.artifact.selectedLineId,line);assert.equal(k.turn,50);
 const correction=reviseKernelDraft(k,change.proposal,'لا، اللي قبله',drafting,'ar');
 assert.deepEqual(correction.proposal.items.map(r=>r.unitPrice),['25','26','25']);assert.equal(k.artifact.selectedLineId,k.artifact.lineIds[1]);
 const undo=reviseKernelDraft(k,correction.proposal,'undo',drafting,'en');assert.deepEqual(undo.proposal.items.map(r=>r.unitPrice),['25','25','26']);
 const redo=reviseKernelDraft(k,undo.proposal,'redo',drafting,'en');assert.deepEqual(redo.proposal.items.map(r=>r.unitPrice),['25','26','25']);
 assert.deepEqual(p.items.map(r=>r.unitPrice),['25','25','25']);
});
test('correction with no last exact edit and currency mismatch fail without edits',()=>{
 const k=newConversationKernel(scope),p=proposal();
 assert.equal(reviseKernelDraft(k,p,'لا، اللي قبله',drafting,'ar').changed,false);
 assert.equal(reviseKernelDraft(k,p,'عدل line 3 وخليه 26 EUR',drafting,'en').changed,false);
 assert.equal(k.artifact.proposal.items[2].unitPrice,'25');
});
test('selection is from a specific display list; previous uses the selected ID',()=>{
 const k=newConversationKernel(scope);assert.throws(()=>resolveKernelSelection(k,'الثاني'),/قائمة/);
 k.selection={id:'visible-1',items:[{entityType:'customer',entityId:'c10',label:'Duplicate'},{entityType:'customer',entityId:'c2',label:'Duplicate'}]};
 assert.equal(resolveKernelSelection(k,'الثاني').entityId,'c2');assert.equal(resolveKernelSelection(k,'لا، اللي قبله').entityId,'c10');
 assert.throws(()=>resolveKernelSelection(k,'the one before'),/current list/);
});
test('exact company, branch, thread and Personal isolation discard foreign references',()=>{
 const k=newConversationKernel(scope);stageKernelArtifact(k,proposal());k.selection={id:'s',items:[{entityType:'customer',entityId:'secret',label:'Private'}]};
 for(const other of [{...scope,workspaceId:'other'},{...scope,branchId:'other'},{...scope,threadId:'other'},{...scope,scope:'personal',workspaceId:'',branchId:''}]){
  const restored=normalizeConversationKernel(k,other);assert.equal(restored.artifact,undefined);assert.equal(restored.selection,undefined);assert.ok(!composeKernelMemory(restored,[]).includes('Private'));
 }
});
test('AES store normalization preserves kernel and receipt through history upsert',()=>{
 const k=newConversationKernel(scope);stageKernelArtifact(k,proposal());
 const stored=normalizeAssistantState({version:1,threads:[{id:'t1',scope:'business',workspaceId:'default',branchId:'main',messages:[],kernel:k,foundationReceipts:[{id:'a1',state:'applying',at:'now'}]}]});
 const next=upsertAssistantThread(stored,{threadId:'t1',scope:'business',workspaceId:'default',branchId:'main',messages:[{role:'user',text:'Hello'}]});
 assert.equal(next.thread.kernel.artifact.id,k.artifact.id);assert.equal(next.thread.foundationReceipts[0].state,'applying');
});
test('working context excludes approval snapshot and includes complete draft rows',()=>{
 const k=newConversationKernel(scope),p=proposal();p.foundationApproval={baseline:'DO_NOT_SEND_COMPANY_RECORDS'};stageKernelArtifact(k,p);
 const memory=composeKernelMemory(k,[]);assert.ok(!memory.includes('DO_NOT_SEND'));assert.ok(memory.includes('Item 2'));
});
test('approval blocks payload alteration, actor changes, stale data and branch switches',()=>{
 const v=emptyVault(),p=proposal();p.foundationApproval=prepareFoundationApproval(v,p,scope);assert.doesNotThrow(()=>assertFoundationApproval(v,p));
 const stale=structuredClone(v);stale.customers.push(person('new','New'));assert.throws(()=>assertFoundationApproval(stale,p),/changed since review/);
 const modified=structuredClone(p);modified.items[0].unitPrice='100';assert.throws(()=>assertFoundationApproval(v,modified),/payload changed/);
 const branch=structuredClone(v);branch.branches.push({...branch.branches[0],id:'second'});branch.appSettings.activeBranchId='second';assert.throws(()=>assertFoundationApproval(branch,p),/branch changed/);
 const viewer=structuredClone(v);viewer.teamMembers[0].role='viewer';assert.throws(()=>prepareFoundationApproval(viewer,proposal(),scope),/role/);
});
test('commit bridge rechecks stale envelope inside the real mutation callback',async()=>{
 const {registerVaultMutationBridge}=await import('../dist/src/storage/vault-mutation-bridge.js');
 const {applyApprovedToolExecution}=await import('../dist/src/lib/ai-tool-actions.js');
 const v=emptyVault();const p={capability:'tool.execute',tool:'product.bulkUpdate',args:{rows:[]},label:'Review'};
 p.foundationApproval=prepareFoundationApproval(v,p,scope);const changed=structuredClone(v);changed.customers.push(person('new','changed'));
 let writes=0;registerVaultMutationBridge(async mutation=>{const next=mutation(changed);writes++;return next;});
 await assert.rejects(()=>applyApprovedToolExecution(p),/changed since review/);assert.equal(writes,0);
});
test('duplicate names are blocked across customers, suppliers and products',()=>{
 const v=emptyVault();v.customers=[person('1','Twin'),person('2','Twin')];v.suppliers=[{id:'1',nameEn:'Twin'},{id:'2',nameEn:'Twin'}];v.savedItems=[{id:'1',descriptionEn:'Twin'},{id:'2',descriptionEn:'Twin'}];
 const runtime=createAiToolRuntime(v,{assistantRuntime:scope});
 for(const tool of ['customer.getSummary','supplier.getSummary','product.getSummary']){const result=executeAiToolCall(runtime,{id:'x',tool,args:{query:'Twin'},reason:'User'});assert.equal(result.ok,false);assert.match(result.summary,/Multiple records/);}
});
test('deterministic finance and high impact protections remain intact',()=>{
 const runtime=createAiToolRuntime(emptyVault(),{assistantRuntime:scope});
 const call=(tool,args)=>executeAiToolCall(runtime,{id:'t',tool,args,reason:'User request'});
 assert.equal(call('landedCost.calculate',{quantity:'100',unitCost:'25',freight:'500'}).data.landedTotal,'3000.00');
 assert.equal(call('pricing.margin',{cost:'20',price:'25'}).data.percent,'20.00');
 assert.equal(call('accounting.post',{}).ok,false);assert.equal(call('fx.convertUsingRecordedRate',{amount:'100',fromCurrency:'USD',toCurrency:'SAR',date:'2026-10-10'}).ok,false);
});
test('final shipped runtime routes memory, revisions, tools and both approval paths through foundation',async()=>{
 const built=await readFile('dist/src/components/AiCopilot.js','utf8');
 for(const token of ['installIntelligenceRuntime(this)','intelligenceReviseDraft(this,','await intelligenceTools(this,','intelligenceApprove(instance,step,','context.conversationWorkingMemory =','requestMessage = message;'])assert.ok(built.includes(token),token);
 assert.match(built,/String\(r.branchId\|\|'main'\)/);
});

async function runtimeHarness(){
 const kernelModule=await import('../dist/src/lib/ai-conversation-kernel.js');
 const approvalModule=await import('../dist/src/lib/ai-foundation-approval.js');
 const foundationModule=await import('../dist/src/lib/ai-assistant-foundation.js');
 const workspaces=await import('../dist/src/lib/workspaces.js');
 const records=new Map();
 globalThis.__foundationDb={getRecord:async id=>records.get(id)||null,putRecord:async record=>{records.set(record.id,structuredClone(record));}};
 const storeSource=(await readFile('dist/src/storage/assistant-store.js','utf8')).replace(/import .* from '.*';/g,line=>line.includes("'./db.js'")?'const {getRecord,putRecord}=globalThis.__foundationDb;':line.replace("'../lib/ai-conversation-kernel.js'",JSON.stringify(new URL('../dist/src/lib/ai-conversation-kernel.js',import.meta.url).href)));
 const store=await import('data:text/javascript;base64,'+Buffer.from(storeSource).toString('base64')+'#'+crypto.randomUUID());
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const session={key,vault:emptyVault()};
 globalThis.__foundationRuntimeModules={activeAccountStorageUid:()=>null,...kernelModule,...approvalModule,...foundationModule,...workspaces,...store,resumeVaultSession:async()=>session,orchestrateAiToolRequest:async()=>null};
 let runtimeSource=await readFile('dist/src/lib/ai-intelligence-runtime.js','utf8');
 runtimeSource=runtimeSource.replace(/import \{([\s\S]*?)\} from '[^']+';/g,(_all,names)=>`const {${names}}=globalThis.__foundationRuntimeModules;`);
 const runtime=await import('data:text/javascript;base64,'+Buffer.from(runtimeSource).toString('base64')+'#'+crypto.randomUUID());
 function host(){const h={props:{screen:'home',language:'ar'},mounted:true,state:{assistantScope:'business',messages:[],proposal:null,error:'',busy:false},__lourexAssistantThreadId:'t1',__lourexAssistantWorkspaceKey:'default|main',__lourexLoadPromise:Promise.resolve(),setState(update,done){Object.assign(this.state,typeof update==='function'?update(this.state):update);done?.();},async ask(raw){this.state.messages.push({role:'user',text:raw});if(raw==='prepare')this.state.proposal=proposal();},async approveProposal(){this.state.proposal=null;this.state.error='';}};runtime.installIntelligenceRuntime(h);return h;}
 return{runtime,session,store,records,host};
}
test('real runtime adapter encrypts/reloads drafts and refuses approval replay after remount',async()=>{
 const {runtime,session,store,records,host}=await runtimeHarness();const h=host();
 await h.ask('prepare');const prepared=h.state.proposal;assert.ok(prepared.foundationApproval);
 const encrypted=records.get('assistant-state');assert.ok(encrypted.cipher);assert.ok(!JSON.stringify(encrypted).includes('Item 2'));
 const reloaded=host();await reloaded.ask('unrelated question');assert.equal(reloaded.state.proposal.items.length,3);
 let writes=0;await runtime.intelligenceApprove(reloaded,reloaded.state.proposal,async()=>{writes++;return{summary:'verified',id:'saved'};});assert.equal(writes,1);
 const state=await store.loadAssistantState(session.key);assert.equal(state.threads[0].foundationReceipts[0].state,'applied');assert.ok(state.threads[0].messages.some(row=>row.text==='unrelated question'));
 const restarted=host();await restarted.ask('hello');await runtime.intelligenceApprove(restarted,prepared,async()=>{writes++;return{summary:'bad replay'};});assert.equal(writes,1);assert.match(restarted.state.error,/already attempted/);
});
test('runtime rejects stale approval and an in-flight double click without any duplicate write',async()=>{
 const {runtime,session,host}=await runtimeHarness();const h=host();await h.ask('prepare');
 const p=h.state.proposal;session.vault.customers.push(person('new','Changed'));let writes=0;
 await runtime.intelligenceApprove(h,p,async()=>{writes++;});assert.equal(writes,0);assert.match(h.state.error,/changed since review/);
 session.vault.customers=[];h.state.error='';let release;const pending=new Promise(resolve=>release=resolve);
 const one=runtime.intelligenceApprove(h,p,async()=>{writes++;await pending;return{id:'one',summary:'saved'};});
 const two=runtime.intelligenceApprove(h,p,async()=>{writes++;return{id:'two'};});release();await Promise.all([one,two]);assert.equal(writes,1);
});
test('undo restores the same line IDs after removal; review envelope does not create duplicate undo',()=>{
 const k=newConversationKernel(scope),p=proposal();stageKernelArtifact(k,p);const ids=[...k.artifact.lineIds];
 const changed=reviseKernelDraft(k,p,'remove line 2',drafting,'en');assert.equal(changed.proposal.items.length,2);
 const undoCount=k.artifact.undo.length;changed.proposal.foundationApproval={id:'review'};stageKernelArtifact(k,changed.proposal);assert.equal(k.artifact.undo.length,undoCount);
 const restored=reviseKernelDraft(k,changed.proposal,'undo',drafting,'en');assert.equal(restored.proposal.items.length,3);assert.deepEqual(k.artifact.lineIds,ids);
});
test('restoring a kernel from another account loses working references',()=>{
 const k=newConversationKernel({...scope,accountId:'account-a'});stageKernelArtifact(k,proposal());
 const restored=normalizeConversationKernel(k,{...scope,accountId:'account-b'});assert.equal(restored.artifact,undefined);
});
test('new Personal task approval requires an explicit Personal scope',()=>{
 const v=emptyVault(),personal={...scope,scope:'personal',workspaceId:'',branchId:''};
 assert.throws(()=>prepareFoundationApproval(v,{capability:'tool.execute',tool:'task.create',args:{title:'Task'}},personal),/scope/);
 assert.doesNotThrow(()=>prepareFoundationApproval(v,{capability:'tool.execute',tool:'task.create',args:{scope:'personal',title:'Task'}},personal));
});
test('API cleaners preserve a long current instruction and keep working memory separate from intent',async()=>{
 const {buildAiFinanceContext}=await import('../dist/src/lib/ai-finance.js');
 const {buildAiBusinessContext}=await import('../dist/src/lib/ai-business.js');
 const {buildAdvisorDataV2}=await import('../dist/src/lib/ai-advisor-v2.js');
 const v=emptyVault();const finance=buildAiFinanceContext({documents:[],payments:[],customers:[],activeDocument:null},'');
 const business=buildAiBusinessContext(v);const advisorV2=buildAdvisorDataV2(v,finance,business);
 const context={version:5,screen:'home',language:'ar',advisorV2,conversationWorkingMemory:'create invoice for 1000 USD — OLD UNTRUSTED MEMORY'};
 const long='Discuss only. '.repeat(150);
 for(const name of ['ai-advisor-v2','ai-conversation-v3']){
  let source=await readFile(`api/${name}.js`,'utf8');
  source=source.replace(/from '([^']+)'/g,(_all,path)=>'from '+JSON.stringify(new URL('../api/'+path,import.meta.url).href));
  const endpoint=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {cleanRequest};').toString('base64'));
  const cleaned=endpoint.cleanRequest({message:long,context:{...context,conversationSources:[{id:'source',fileName:'test.txt',documentType:'unknown',route:'product_list',extracted:'Test facts',confidence:1}]}});
  assert.ok(cleaned,name);assert.equal(cleaned.message,long.trim());assert.equal((cleaned.context||cleaned).workingMemory,context.conversationWorkingMemory);
  assert.equal(endpoint.cleanRequest({message:'x'.repeat(6001),context}),null);
  assert.equal(endpoint.cleanRequest({message:'Discuss only',context:{...context,conversationWorkingMemory:'x'.repeat(36001)}}),null);
 }
});
test('actual final compiled ask preserves the user instruction, composes DATA memory and edits exact drafts',async()=>{
 const vm=await import('node:vm');const {runtime,session,host}=await runtimeHarness();
 const built=await readFile('dist/src/components/AiCopilot.js','utf8');
 const start=built.indexOf('    ask = async (raw) => {'),end=built.indexOf('    executeItemProposal =',start);assert.ok(start>0&&end>start);
 const requests=[];const env={AbortController,MAX_MESSAGE_CHARS:6000,id:()=>crypto.randomUUID(),capabilityFor:()=> 'business.explain',assistantProviderMemory:()=> 'old compact memory',advisorCalculation:()=>null,resumeVaultSession:async()=>session,t:en=>en,scopeVault:v=>v,aiProductArchived:()=>false,buildAiContext:()=>({version:5,screen:'home',language:'ar',assistantRuntime:{...scope},drafting:{...drafting,items:[]}}),assistantProviderContext:async()=> 'Approved personal/business scoped memory',assistantRequestMessage:()=> 'Legacy envelope',itemActionIntent:()=>false,__lourexGetConversationSources:()=>[],__lourexPendingImportContext:(_h,c)=>c,__lourexRememberProductImport:()=>{},__lourexToolPresentationFromResult:()=>null,aiToolAuditSummary:()=>[],__lourexNaturalizeToolAnswer:r=>r.answer,requestAiJson:async(endpoint,payload)=>{requests.push({endpoint,...payload});return{answer:'Prepared only',proposal:proposal()};},safeProposal:p=>p,reviewAiDocumentProposal:()=>({text:'Review all lines',blockers:[]}),...runtime};
 const Harness=vm.runInNewContext('class Harness{\n'+built.slice(start,end)+'\n};Harness',env);
 const actual=new Harness();const compiledAsk=actual.ask;const fake=host();Object.assign(actual,fake);actual.ask=compiledAsk;actual.__intelligenceInstalled=false;actual.currentRequest=()=>true;actual.addAudit=()=>{};actual.requestGeneration=0;runtime.installIntelligenceRuntime(actual);
 const long='Prepare a quotation with explicit data. '.repeat(40);await actual.ask(long);
 assert.equal(requests.length,1,actual.state.error);assert.equal(requests[0].message,long.trim());assert.ok(requests[0].context.conversationWorkingMemory.includes('Scoped working references'));assert.ok(requests[0].context.conversationWorkingMemory.includes('Approved personal/business'));
 await actual.ask('عدل line 3 وخليه 26 USD');assert.equal(actual.state.proposal.items[2].unitPrice,'26');
 await actual.ask('لا، اللي قبله');assert.deepEqual(Array.from(actual.state.proposal.items,r=>r.unitPrice),['25','26','25']);assert.equal(requests.length,1,'exact corrections remain deterministic; no provider writes');
});
