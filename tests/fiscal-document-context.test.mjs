import test from 'node:test';
import assert from 'node:assert/strict';
import {fiscalDocumentContext as context} from '../api/_fiscal/fiscal-document-context.js';
const invoice={uuid:'test-invoice',issueDate:'2026-11-18',currency:'USD',kind:'invoice',mode:'standard',buyer:{country:'TR'}};
const rate={uuid:invoice.uuid,currency:'USD',sarPerUnit:'3.75',taxDueDate:'2026-11-17',rateDate:'2026-11-17',source:'SAMA',evidenceDigest:'a'.repeat(64)};
test('exact SAR tax conversion with one final cent rounding',()=>{
  const c=context(invoice,{rate});assert.equal(c.vatSar('15.00'),'56.25');assert.equal(c.vatSar('0.02'),'0.08');assert.equal(c.vatSar('0.00'),'0.00');
  assert.equal(context({...invoice,currency:'SAR'}).vatSar('15.00'),'15.00');
});
test('foreign currency evidence is bound to due date, currency and document',()=>{
  assert.throws(()=>context(invoice));
  for(const patch of [{rateDate:'2026-11-16'},{taxDueDate:'2026-11-31'},{currency:'EUR'},{uuid:'other'},{sarPerUnit:'0'},{sarPerUnit:3.75},{source:'user'},{evidenceDigest:'bad'},{extra:true}])assert.throws(()=>context(invoice,{rate:{...rate,...patch}}));
  assert.throws(()=>context({...invoice,kind:'credit-note'},{rate}));
  assert.throws(()=>context({...invoice,currency:'KWD'},{rate:{...rate,currency:'KWD'}}));
  assert.throws(()=>context({...invoice,currency:'SAR'},{rate}));
  assert.throws(()=>context(invoice,{rate}).vatSar('1.005'));
});
test('export classification is explicit and not inferred from foreign customer or currency',()=>{
  assert.equal(context(invoice,{rate}).exportCode,null);
  const exportClassification={uuid:invoice.uuid,buyerCountry:'TR',kind:'goods',evidenceDigest:'b'.repeat(64)};
  assert.equal(context(invoice,{rate,exportClassification}).exportCode,'VATEX-SA-32');
  assert.equal(context(invoice,{rate,exportClassification:{...exportClassification,kind:'services'}}).exportCode,'VATEX-SA-33');
  for(const patch of [{uuid:'other'},{buyerCountry:'US'},{kind:'unknown'},{evidenceDigest:''}])assert.throws(()=>context(invoice,{rate,exportClassification:{...exportClassification,...patch}}));
  assert.throws(()=>context({...invoice,mode:'simplified'},{rate,exportClassification}));
});
