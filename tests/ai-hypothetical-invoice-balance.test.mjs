import test from 'node:test';
import assert from 'node:assert/strict';
import {hypotheticalInvoiceBalance as calculate} from '../api/_ai/hypothetical-finance.js';

test('Arabic synthetic invoice subtracts two payments without ledger or AI',()=>{
 const result=calculate('إذا عندي فاتورة افتراضية قيمتها 1500 دولار، دفعت 400 ثم 350، كم المتبقي؟','ar');
 assert.equal(result?.kind,'invoice-balance-exact');
 assert.equal(result?.invoiceTotal,'1500.00');
 assert.deepEqual(result?.payments,['400.00','350.00']);
 assert.equal(result?.paid,'750.00');
 assert.equal(result?.remaining,'750.00');
 assert.equal(result?.currency,'دولار');
 assert.match(result.answer,/المتبقي: 1500\.00 − 750\.00 = 750\.00/);
 assert.doesNotMatch(result.answer,/سجل المستندات المحفوظة|عدد الفواتير/);
});

test('English and bilingual standalone arithmetic preserves explicit currency',()=>{
 const cases=[
  ['Suppose I have an invoice of 1500 USD, paid 400 and 350; what is remaining?','USD','750.00'],
  ['An example invoice for 1,250.00 USD: paid 325.75 USD and 199.25 USD. Remaining balance?','USD','725.00'],
  ['فاتورة افتراضية قيمتها ١٬٥٠٠٫٧٥ USD دفعت ٤٠٠٫١٥ و٣٥٠٫٦٠ كم المتبقي؟','USD','750.00'],
  ['Hypothetical invoice 1500.125 KWD with payments 400.050 and 350.025 KWD. Remaining?','KWD','750.050']
 ];
 for(const [question,currency,remaining] of cases){
   const got=calculate(question,'en');
   assert.equal(got?.kind,'invoice-balance-exact',question);
   assert.equal(got.currency,currency,question);
   assert.equal(got.remaining,remaining,question);
 }
});

test('Overpayment is not a negative receivable or a posted customer credit',()=>{
 const result=calculate('Hypothetical invoice 100 USD, paid 80 USD and 30 USD. How much remaining?','en');
 assert.equal(result?.remaining,'0.00');
 assert.match(result.answer,/overpayment: 10\.00 USD/);
 assert.doesNotMatch(result.answer,/credit note created|posted/i);
});

test('Conflicting currencies, unverified arithmetic and ambiguous punctuation fail closed',()=>{
 const cases=[
  'Hypothetical invoice 100 USD paid 30 EUR and 20 EUR; remaining?',
  'فرضًا فاتورة قيمتها 1500 دولار دفعت 400 يورو كم المتبقي؟',
  'Hypothetical invoice 1,50 USD paid 1 USD. Remaining?',
  'Hypothetical invoice 1500 USD paid 400 and 350 with 15% tax. Remaining?',
  'Hypothetical invoice 1500 USD paid 400.123 USD. Remaining?'
 ];
 for(const q of cases){
  const got=calculate(q,'en');
  assert.equal(got?.kind,'invoice-balance-needs-review',q);
  assert.equal('remaining' in got,false);
 }
});

test('Actual document number and saved invoice status must remain on real scoped record route',()=>{
 const queries=[
  'هل فاتورة INV-2026-0001 محفوظة في حسابي؟',
  'كم فاتورة محفوظة في LOUREX؟',
  'For invoice number INV-2000 saved in LOUREX I paid 400 USD, what is remaining?',
  'Please pay invoice INV-2026-1000 USD 400'
 ];
 for(const q of queries)assert.equal(calculate(q,'ar'),null,q);
});

test('No currency is invented when standalone amounts are unlabeled',()=>{
 const got=calculate('Hypothetical invoice 1500 paid 400 and 350, remaining?','en');
 assert.equal(got?.remaining,'750.00');
 assert.equal(got.currency,'');
 assert.match(got.answer,/No currency was specified/);
 assert.doesNotMatch(got.answer,/USD|EUR|SAR/);
});
