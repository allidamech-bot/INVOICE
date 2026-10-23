import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {explicitlyNamedQuotationCustomer} from '../dist/src/lib/ai-explicit-quote-customer.js';

test('AI-01 live regression: explicit buyer survives bilingual two-line quotation',()=>{
 const prompt='أنشئ مسودة عرض سعر تجريبية لعميل QA Demo Customer بصنفين: QA Apple عدد 2 PCS بسعر وحدة 10 USD وQA Orange عدد 3 PCS بسعر وحدة 20 USD. الإجمالي 80 USD. اعرض المسودة للمراجعة فقط.';
 assert.equal(explicitlyNamedQuotationCustomer(prompt),'QA Demo Customer');
 assert.equal(explicitlyNamedQuotationCustomer('أنشئ عرض سعر لعميل باسم QA Demo Customer بصنفين: Apple unit price 10 USD'),'QA Demo Customer');
 assert.equal(explicitlyNamedQuotationCustomer('أنشئ عرض سعر للعميل شركة الأفق للتجارة؛ الصنف الأول مكسرات'),'شركة الأفق للتجارة');
 assert.equal(explicitlyNamedQuotationCustomer('Create a quotation for customer QA Demo Customer with 2 items and 80 USD total.'),'QA Demo Customer');
 assert.equal(explicitlyNamedQuotationCustomer('Create a quote for Customer: QA Demo Customer, unit price 10 USD'),'QA Demo Customer');
});
test('AI-01: no customer is invented from missing or negated references',()=>{
 for(const message of [
  'Create a quotation with two items and no customer.',
  'أنشئ عرض سعر بصنفين بدون اسم عميل',
  'أريد عرض سعر بلا عميل 100 USD',
  'أنشئ عرض سعر من صنفين QA Apple وQA Orange',
  'لعميل 100 USD',
  '', '   '
 ])assert.equal(explicitlyNamedQuotationCustomer(message),'',message);
});
test('AI-01: fallback is preview-only and keeps ambiguity and save approval gates',async()=>{
 const copilot=await readFile(new URL('../src/components/AiCopilot.tsx',import.meta.url),'utf8');
 const segment=copilot.slice(copilot.indexOf("if(value.capability==='document.createDraft')"),copilot.indexOf("if(value.capability==='document.updateDraft')"));
 assert.match(segment,/explicitlyNamedQuotationCustomer\(message\)/);
 assert.match(segment,/if\(!customerId&&!customerDraft\)/);
 assert.match(segment,/if\(exact\.length===1\)customerId=exact\[0\]!\.id/);
 assert.match(segment,/else if\(exact\.length===0\)/);
 assert.match(segment,/Multiple exact matches remain blocked/);
 assert.doesNotMatch(segment,/mutateVaultSafely|saveVault|createCustomer|approveProposal/);
});
