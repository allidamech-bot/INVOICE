import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {applyWorkingDraftPlan,wantsWorkingDraftPdfRefresh} from '../dist/src/lib/ai-working-draft-plan.js';
import {workspaceDocument,applyWorkspaceCommand} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
const request='عدّل عرض السعر الحالي فقط، دون إنشاء عرض جديد ودون حفظ أي بيانات. غيّر كمية بسكويت الشوكولاتة من 12 إلى 15 كرتون، مع إبقاء سعر الكرتون 125 دولارًا. لا تغيّر الصنفين الآخرين أو بيانات العميل أو شروط الدفع والتسليم أو صلاحية العرض. أعد حساب الإجمالي وحدّث معاينة PDF.';
function fixture(){
  const vault=emptyVault(),kernel=newConversationKernel({accountId:'qa',scope:'business',workspaceId:'default',branchId:'main',threadId:'qa-draft-preview'});
  stageKernelArtifact(kernel,{capability:'document.createDraft',kind:'proforma',customerId:'',customerDraft:{companyNameEn:'Al-Riyada Test Trading Co.',companyNameAr:'',contactPerson:'Samer Test',addressEn:'Test Street',country:'Jordan',city:'Amman',phone:'+1 202 555 0147',email:'qa.buyer@example.com'},currency:'USD',language:'en',
    items:[
      {savedItemId:'',descriptionEn:'Chocolate Biscuits (24 pcs/carton)',descriptionAr:'بسكويت الشوكولاتة',quantity:'12',unit:'carton',unitPrice:'125'},
      {savedItemId:'',descriptionEn:'Vanilla Wafers (36 pcs/carton)',descriptionAr:'ويفر بالفانيليا',quantity:'8',unit:'carton',unitPrice:'85'},
      {savedItemId:'',descriptionEn:'Instant Coffee (12 cans/carton)',descriptionAr:'قهوة سريعة التحضير',quantity:'5',unit:'carton',unitPrice:'60'}
    ],incoterm:'',paymentTerms:'50% advance and 50% before delivery',deliveryTime:'10 days after order confirmation',validity:'14 days',remarks:'Shipment not included',notes:'',label:'Test Quotation',rationale:'unsaved QA'});
  return {vault,kernel};
}
test('An Arabic edit + recalculate + refresh PDF changes only the targeted carton quantity and resulting A4 source',()=>{
  const {vault,kernel}=fixture(),originalVault=structuredClone(vault),old=workspaceDocument(kernel,vault,'en');
  assert.equal(old.subtotal,'2480.00');
  assert.equal(wantsWorkingDraftPdfRefresh(request),true);
  const plan={artifactId:kernel.artifact.id,revision:kernel.artifact.revision,action:'edit',operations:[{
    lineId:kernel.artifact.lineIds[0],field:'quantity',value:'15',evidence:'إلى 15'
  }]};
  const updated=applyWorkingDraftPlan(kernel,vault,plan,request);
  assert.equal(updated.artifact.revision,kernel.artifact.revision+1);
  assert.deepEqual(updated.artifact.lineIds,kernel.artifact.lineIds);
  assert.equal(updated.artifact.undo.length,1);
  const now=workspaceDocument(updated,vault,'en');
  assert.equal(now.subtotal,'2855.00');
  assert.deepEqual(now.rows.map(x=>x.quantity),['15','8','5']);
  assert.deepEqual(now.rows.map(x=>x.unitPrice),['125','85','60']);
  assert.deepEqual(now.terms,old.terms);
  assert.equal(now.customer,old.customer);
  const pdf=prepareAiPdfPreview(updated,vault,'en');
  assert.equal(pdf.number,'UNSAVED-PREVIEW');
  assert.equal(pdf.status,'draft');
  assert.deepEqual(pdf.items.map(x=>x.quantity),['15','8','5']);
  assert.deepEqual(pdf.items.map(x=>x.unitPrice),['125','85','60']);
  assert.equal(pdf.terms.validity,'14 days');
  assert.equal(pdf.customerSnapshot.companyNameEn,'Al-Riyada Test Trading Co.');
  assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'2480.00');
  assert.deepEqual(vault,originalVault);
  assert.deepEqual(vault.documents,[]);
  applyWorkspaceCommand(updated,vault,{kind:'undo',artifactId:updated.artifact.id,revision:updated.artifact.revision});
  assert.equal(workspaceDocument(updated,vault,'en').subtotal,'2480.00');
});
test('PDF intent only triggers for affirmative PDF refresh requests',()=>{
  for(const phrase of ['حدّث معاينة PDF','أعد الحساب ثم اعرض PDF','refresh the PDF preview'])
    assert.equal(wantsWorkingDraftPdfRefresh(phrase),true,phrase);
  for(const phrase of ['غيّر الكمية إلى 15 فقط','دون معاينة PDF','لا تحدّث معاينة PDF','update quantity only'])
    assert.equal(wantsWorkingDraftPdfRefresh(phrase),false,phrase);
});
test('Draft planner explicitly separates deterministic totals and PDF view from atomic data edits',async()=>{
  const [planner,runtime]=await Promise.all([
    readFile(new URL('../api/_ai/draft-plan.js',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8')
  ]);
  assert.match(planner,/Separate explicitly requested DATA edits from derived, read-only outcomes/);
  assert.match(planner,/A user asking to "recalculate the total"/);
  assert.match(planner,/NEVER ask which "Total" field should be manually updated/);
  assert.match(planner,/All independent DATA changes are atomic/);
  assert.match(runtime,/const previewAsked=wantsWorkingDraftPdfRefresh\(message\)/);
  assert.match(runtime,/prepareAiPdfPreview\(next,currentVault,requestLanguage\)/);
  assert.match(runtime,/__workspacePdfAutoStart:pdfIdentity/);
  assert.match(runtime,/const updatedSubtotal=updatedDocument\?\.subtotal\|\|''/);
  assert.match(runtime,/if\(result\?\.changed\)/);
  assert.doesNotMatch(runtime,/saveVault\(updatedDocument/);
});
test('A fabricated amount, obsolete revision or non-Controller plan never modifies the draft or vault',()=>{
  for(const tamper of [p=>p.revision++,p=>p.operations[0].value='99',p=>p.operations[0].lineId='foreign']){
    const {vault,kernel}=fixture(),before=structuredClone(kernel),saved=structuredClone(vault);
    const p={artifactId:kernel.artifact.id,revision:kernel.artifact.revision,action:'edit',operations:[{lineId:kernel.artifact.lineIds[0],field:'quantity',value:'15',evidence:'إلى 15'}]};
    tamper(p);assert.throws(()=>applyWorkingDraftPlan(kernel,vault,p,request));assert.deepEqual(kernel,before);assert.deepEqual(vault,saved);
  }
});
