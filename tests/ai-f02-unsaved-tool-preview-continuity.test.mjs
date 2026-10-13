import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {previewOnlyWorkingDraft} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,normalizeConversationKernel,stageKernelArtifact,reviseKernelDraft} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument,workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';

function fixture(mode='controller'){
 const vault=emptyVault();
 const customer={id:'buyer-f02',workspaceId:'default',companyNameEn:'Review Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 vault.customers=[customer];
 const context={conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};
 const runtime=createAiToolRuntime(vault,context);
 const plan={version:1,goal:'Preview quotation only, do not save',calls:[{id:'review-1',tool:'quotation.prepare',args:{
  kind:'proforma',customerId:customer.id,currency:'USD',language:'en',
  items:[{descriptionEn:'First',quantity:'10',unit:'CTN',unitPrice:'20'},
   {descriptionEn:'Second',quantity:'5',unit:'CTN',unitPrice:'30'},
   {descriptionEn:'Third',quantity:'2',unit:'CTN',unitPrice:'40'}],
  incoterm:'CIF',paymentTerms:'30 days'
 },reason:'Only show a draft preview.'}]};
 return{vault,context,runtime,plan,scope:{scope:'business',workspaceId:'default',branchId:'main',threadId:'f02'}};
}
test('F02 quotation.prepare creates review-only result AND editable draft, never an executable approval',()=>{
 const {vault,runtime,plan,scope}=fixture();
 const before=structuredClone(vault);
 const executed=executeAiToolPlan(runtime,plan);
 assert.equal(executed.proposal,null);
 assert.equal(executed.results[0].class,'prepare');
 const draft=previewOnlyWorkingDraft(plan,executed.results,runtime);
 assert.ok(draft);assert.equal(draft.capability,'document.createDraft');
 assert.equal(draft.kind,'proforma');assert.equal(draft.items.length,3);
 assert.equal(draft.customerId,'buyer-f02');
 assert.equal(draft.termsPatch,undefined);
 assert.equal(draft.incoterm,'CIF');
 assert.equal(draft.foundationApproval,undefined);
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,draft);
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'430.00');
 assert.equal(vault.documents.length,0);assert.deepEqual(vault,before);
});
test('F02 staged preview survives reload, quantity revision and creates a PDF without issue/save',()=>{
 const {vault,runtime,plan,scope}=fixture();
 const execute=executeAiToolPlan(runtime,plan);
 const draft=previewOnlyWorkingDraft(plan,execute.results,runtime);
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,draft);
 const persisted=JSON.parse(JSON.stringify(kernel)),restored=normalizeConversationKernel(persisted,scope);
 assert.equal(restored.artifact.proposal.items.length,3);
 assert.equal(workspaceDocument(restored,vault,'en').subtotal,'430.00');
 // Numeric follow-up: the third item becomes 26 instead of 2.
 const edited=reviseKernelDraft(restored,restored.artifact.proposal,'غيّر كمية الصنف 3 إلى 26',workspaceDrafting(vault),'ar');
 assert.ok(edited?.changed);
 assert.equal(workspaceDocument(restored,vault,'en').subtotal,'1390.00');
 const pdf=prepareAiPdfPreview(restored,vault,'en');
 assert.equal(pdf.items[2].quantity,'26');
 assert.equal(pdf.status,'draft');assert.equal(pdf.number,'UNSAVED-PREVIEW');
 assert.deepEqual(vault.documents,[]);assert.deepEqual(vault.documentEvents,[]);
});
test('F02 fails closed on truncated or mismatched previews, mixed plans, and Advisor',()=>{
 const {vault,plan,runtime}=fixture();
 const actual=executeAiToolPlan(runtime,plan).results;
 assert.equal(previewOnlyWorkingDraft({...plan,calls:[...plan.calls,{id:'extra',tool:'finance.getSummary',args:{},reason:''}]},actual,runtime),null);
 assert.equal(previewOnlyWorkingDraft(plan,[{...actual[0],data:{truncated:true,preview:'...'}}],runtime),null);
 assert.equal(previewOnlyWorkingDraft(plan,[{...actual[0],data:{...actual[0].data,items:[actual[0].data.items[0]]}}],runtime),null);
 assert.equal(previewOnlyWorkingDraft(plan,[{...actual[0],id:'other'}],runtime),null);
 assert.equal(previewOnlyWorkingDraft(plan,[{...actual[0],ok:false}],runtime),null);
 assert.equal(previewOnlyWorkingDraft(plan,actual,createAiToolRuntime(vault,{conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}})),null);
});
test('F02 server planner outcome is stored in kernel, not written to vault or turned into approval',async()=>{
 const [runtime,client]=await Promise.all([
  readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/ai-tool-client.ts',import.meta.url),'utf8')
 ]);
 assert.match(runtime,/if\(result\.workingDraft\)/);
 assert.match(runtime,/stageKernelArtifact\(kernel,result\.workingDraft\)/);
 assert.match(runtime,/__workspaceOpen:true/);
 assert.match(runtime,/__workspacePane:'workspace',__workspaceTab:'preview'/);
 assert.match(runtime,/host\.setState\(\{proposal:null,review:null/);
 assert.match(client,/result\.data as any/);
 assert.match(client,/previewOnlyWorkingDraft\(plan,execution\.results,runtime\)/);
 assert.match(client,/workingDraft:workingDraft\|\|undefined/);
 assert.doesNotMatch(client,/workingDraft:.*mutateVaultSafely/);
});
