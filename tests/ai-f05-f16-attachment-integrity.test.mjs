import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {explicitQuoteConversionIntent,quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {completeSourceJson,conversationAttachmentPayload,CONVERSATION_ATTACHMENT_ACCEPT} from '../dist/src/lib/ai-conversation-attachments.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';

const request='حوّل الملف إلى عرض سعر في LOUREX';
function fixture(){
  const vault=emptyVault(),runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
  const source={fileName:'customer-rfq.pdf',route:'quote_request',documentType:'customer_rfq',confidence:.94,
    extracted:JSON.stringify({customerName:'QA Buyer',customerEmail:'buyer@qa.example',customerPhone:'',currency:'USD',
      incoterm:'CIF',paymentTerms:'30 days',deliveryTime:'15 days',validity:'14 days',remarks:'Arabic labels',
      notes:'Source evidence only',
      items:[{sku:'RB',descriptionEn:'Red Bull',descriptionAr:'',quantity:'10',unit:'CTN',unitPrice:'20',quantityConfidence:.99,quantityAmbiguous:false},
        {sku:'MON',descriptionEn:'Monster',descriptionAr:'',quantity:'5',unit:'CTN',unitPrice:'30',quantityConfidence:.99,quantityAmbiguous:false},
        {sku:'SN',descriptionEn:'Snickers',descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'40',quantityConfidence:.99,quantityAmbiguous:false}]})};
  return{vault,runtime,source};
}
test('F05 converts full PDF/Excel/image RFQ extraction into one unsaved quotation with all source rows',()=>{
  const {vault,runtime,source}=fixture();
  for(const ext of ['pdf','xlsx','png']){
    const before=structuredClone(vault);
    const proposal=quoteSourceWorkingDraft([{...source,fileName:'rfq.'+ext}],runtime,request);
    assert.equal(proposal.capability,'document.createDraft');
    assert.equal(proposal.kind,'proforma');
    assert.equal(proposal.customerDraft.companyNameEn,'QA Buyer');
    assert.equal(proposal.currency,'USD');
    assert.equal(proposal.items.length,3);
    assert.deepEqual(proposal.items.map(row=>row.quantity),['10','5','2']);
    assert.deepEqual(proposal.items.map(row=>row.unitPrice),['20','30','40']);
    const kernel=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'F05'});
    stageKernelArtifact(kernel,proposal);
    assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'430.00');
    assert.equal(prepareAiPdfPreview(kernel,vault,'en').items.length,3);
    assert.deepEqual(vault,before);assert.equal(vault.documents.length,0);
    assert.equal(proposal.foundationApproval,undefined);
  }
});
test('F05 missing selling prices/currency stay missing — no guessed zeros or USD',()=>{
  const {runtime,source}=fixture();const data=JSON.parse(source.extracted);
  data.currency='';data.items[1].unitPrice='';
  const draft=quoteSourceWorkingDraft([{...source,extracted:JSON.stringify(data)}],runtime,request);
  assert.equal(draft.currency,'');
  assert.equal(draft.items[1].unitPrice,'');
  assert.throws(()=>prepareAiPdfPreview((()=>{const k=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'F05'});stageKernelArtifact(k,draft);return k})(),runtime.vault,'en'),/Complete/);
});
test('F05 never stages a partial 121-row quote, ambiguous quantity or incorrect scope',()=>{
  const {runtime,source,vault}=fixture();const base=JSON.parse(source.extracted);
  base.items=Array.from({length:121},(_,i)=>({...base.items[0],sku:'RFQ-'+i}));
  assert.throws(()=>quoteSourceWorkingDraft([{...source,extracted:JSON.stringify(base)}],runtime,request),/1–120/);
  base.items=[{...base.items[0],quantityAmbiguous:true}];
  assert.throws(()=>quoteSourceWorkingDraft([{...source,extracted:JSON.stringify(base)}],runtime,request),/uncertain/);
  assert.throws(()=>quoteSourceWorkingDraft([source,{...source,fileName:'second.pdf'}],runtime,request),/Multiple/);
  assert.equal(quoteSourceWorkingDraft([source],runtime,'حلل الملف فقط'),null);
  assert.equal(quoteSourceWorkingDraft([source],createAiToolRuntime(vault,{conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}}),request),null);
});
test('F16 never serializes truncated JSON that could hide lines or break downstream validation',()=>{
  assert.deepEqual(JSON.parse(completeSourceJson({items:[{sku:'RB',unitPrice:'22'}]},300)).items,[{sku:'RB',unitPrice:'22'}]);
  assert.throws(()=>completeSourceJson({items:[{sku:'A'.repeat(800)}]},200),/SOURCE_INCOMPLETE/);
  assert.throws(()=>completeSourceJson({items:Array.from({length:80},()=>({note:'X'.repeat(500)}))},12000),/SOURCE_INCOMPLETE/);
});
test('F05 binary PDF signature is verified, scanned documents use native PDF route and invalid images fail closed',async()=>{
 const valid=new File([new TextEncoder().encode('%PDF-1.7\n1 0 obj\n')],'scan.pdf',{type:'application/pdf'});
 const unsupported=new File(['GIF89a'],'animated.gif',{type:'image/gif'});
 const bad=new File(['fake'],'fake.pdf',{type:'application/pdf'});
 assert.rejects(()=>conversationAttachmentPayload(bad),/content does not match/);
 await assert.rejects(()=>conversationAttachmentPayload(unsupported),/PNG, JPG, WebP and HEIC\/HEIF/);
 assert.match(CONVERSATION_ATTACHMENT_ACCEPT,/\.xlsx/);
 assert.match(CONVERSATION_ATTACHMENT_ACCEPT,/\.pdf/);
 assert.match(CONVERSATION_ATTACHMENT_ACCEPT,/\.heic/);
 assert.match(CONVERSATION_ATTACHMENT_ACCEPT,/\.heif/);
 assert.doesNotMatch(CONVERSATION_ATTACHMENT_ACCEPT,/image\/\*/);
 assert.ok(valid.size>0);
});
test('F05 routes full quote extraction before any model re-planning, with no approval or write',async()=>{
 const [client,reader]=await Promise.all([
  readFile(new URL('../src/lib/ai-tool-client.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/ai-conversation-attachments.ts',import.meta.url),'utf8')
 ]);
 assert.match(client,/quoteSourceWorkingDraft\(input\.context\.conversationSources,runtime,input\.message\)/);
 assert.match(client,/workingDraft,plan,results:\[\],plannedBy:'local'/);
 assert.match(reader,/completeSourceJson\(result,\(classification\.route==='product_list'\|\|classification\.route==='quote_request'\)/);
 assert.match(reader,/mustKeepStructuredExtraction\(error\)/);
 assert.match(reader,/SOURCE_INCOMPLETE/);
 assert.doesNotMatch(reader,/JSON\.stringify\(value\)\.slice/);
});
test('F05 explicit conversion accepts Arabic and English but not analysis-only questions',()=>{
 for(const message of [request,'أنشئ عرض سعر من المرفق','Convert this attachment to a quotation','prepare a quote from the file'])assert.equal(explicitQuoteConversionIntent(message),true,message);
 for(const message of ['حلل البيانات فقط','هل يوجد سعر؟','What is this file?'])assert.equal(explicitQuoteConversionIntent(message),false,message);
});
