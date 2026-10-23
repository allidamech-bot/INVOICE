import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {exactTextQuotePreview} from '../dist/src/lib/ai-text-quote-preview.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';

const question='أنشئ مسودة عرض سعر تجريبية لعميل QA Preview Only Buyer بصنفين: QA Apple عدد 2 PCS بسعر وحدة 10 USD وQA Orange عدد 3 PCS بسعر وحدة 20 USD. الإجمالي 80 USD. اعرض المسودة للمراجعة فقط.';
test('AI-01 production reply fallback becomes an editable unsaved exact document card',async()=>{
 const vault=emptyVault();
 vault.company.defaultCurrency='SAR';
 const before=JSON.stringify(vault);
 const draft=exactTextQuotePreview(question);
 assert.ok(draft);
 assert.equal(draft.kind,'proforma');
 assert.equal(draft.customerDraft.companyNameEn,'QA Preview Only Buyer');
 assert.equal(draft.currency,'USD','explicit currency not changed to company default');
 assert.deepEqual(draft.items.map(row=>[row.descriptionEn,row.quantity,row.unit,row.unitPrice]),
   [['QA Apple','2','PCS','10'],['QA Orange','3','PCS','20']]);
 const result=await orchestrateAiToolRequest({message:question,context:{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}},vault,language:'ar'});
 assert.equal(result.plannedBy,'local');
 assert.equal(result.proposal,null);
 assert.equal(result.results.length,0,'zero AI provider executions');
 assert.equal(result.workingDraft.items.length,2);
 const k=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'qa-preview'});
 stageKernelArtifact(k,result.workingDraft);
 const card=workspaceDocument(k,vault,'ar');
 assert.ok(card);
 assert.equal(card.subtotal,'80.00');
 assert.equal(card.status,'draft');
 assert.deepEqual(card.blockers,[]);
 assert.equal(JSON.stringify(vault),before,'preview cannot persist document or customer');
});
test('AI-01 fail-closed text parsing never guesses missing or conflicting line data',()=>{
 const invalid=[
  question.replace('بسعر وحدة 20 USD','بسعر وحدة 20 EUR'),
  question.replace('الإجمالي 80 USD','الإجمالي 90 USD'),
  question.replace('2 PCS','2'),
  question.replace('بسعر وحدة 20 USD',''),
  question.replace('QA Orange عدد','QA Orange تقريبًا عدد'),
  question.replace('QA Preview Only Buyer',''),
  question.replace('3 PCS بسعر وحدة 20 USD','0 PCS بسعر وحدة 20 USD'),
  question.replace('للمراجعة فقط','واحفظه'),
  question+' والصنف QA Banana عدد 1 PCS بسعر وحدة 10 USD'
 ];
 for(const message of invalid)assert.equal(exactTextQuotePreview(message),null,message);
});
test('AI-01 exact Controller preview requires an explicit buyer and rejects all trailing priced rows',()=>{
 assert.equal(exactTextQuotePreview(question.replace('QA Preview Only Buyer','')),null);
 assert.equal(exactTextQuotePreview(question+' وQA Banana عدد 1 PCS بسعر وحدة 30 USD'),null);
});
