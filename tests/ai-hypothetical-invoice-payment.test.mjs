import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hypotheticalInvoicePaymentAnswer as calc} from '../api/_ai/hypothetical-invoice-payment.js';

test('Arabic hypothetical 1500 minus two payments is USD-independent and read-only',()=>{
  const result=calc('إذا عندي فاتورة افتراضية قيمتها 1500 دولار، دفعت منها 400 و350، كم المتبقي؟','ar');
  assert.equal(result?.remaining,'750.00');
  assert.equal(result?.paid,'750.00');
  assert.equal(result?.currency,'دولار');
  assert.match(result.answer,/لم أستخدم سجلات الشركة/);
});
test('English explicit hypothetical does not use company balances',()=>{
  const result=calc('Suppose I have a hypothetical invoice of 1500 USD, paid 400 and 350. What is remaining?','en');
  assert.equal(result?.remaining,'750.00');assert.equal(result?.currency,'USD');
  assert.match(result?.answer,/no company records/i);
});
test('Arabic-Indic digits, separators and Saudi riyal are exact',()=>{
  const result=calc('فاتورة افتراضية بمبلغ ١٬٥٠٠٫٧٥ ريال سعودي، دفعت ٤٠٠٫٢٥ ثم ٣٥٠٫١٠، كم الباقي؟');
  assert.equal(result?.remaining,'750.40');assert.equal(result?.currency,'SAR');
});
test('Persian digit normalization and decimal addition avoid binary floating point',()=>{
  const result=calc('Hypothetical invoice ۰٫۳۰ EUR, payments ۰٫۱ and ۰٫۲, remaining?', 'en');
  assert.equal(result?.remaining,'0.00');assert.equal(result?.paid,'0.30');
});
test('Overpayments do not become negative open balances',()=>{
  const result=calc('فاتورة افتراضية قيمتها 300 USD دفعت 200 و200، كم المتبقي');
  assert.equal(result?.remaining,'0.00');assert.equal(result?.overpayment,'100.00');
  assert.match(result?.answer,/تتجاوز/);
});
test('Mixing currencies is rejected rather than using fabricated FX',()=>{
  const result=calc('فاتورة افتراضية قيمتها 1500 USD دفعت 400 EUR و350 USD كم المتبقي؟');
  assert.equal(result?.remaining,'');assert.match(result?.answer,/أكثر من عملة/);
});
test('No currency cannot silently become USD',()=>{
  const result=calc('فاتورة افتراضية قيمتها 1000، دفعت 100 و200 كم المتبقي؟');
  assert.equal(result?.remaining,'700.00');assert.equal(result?.currency,'');
  assert.match(result?.answer,/العملة غير محددة/);
});
test('Grouped thousands, four-digit precision and payment order work',()=>{
  const result=calc('Assume a hypothetical invoice 1,500.5050 USD, paid 1,000.25 then 200.20, what remains?','en');
  assert.equal(result?.remaining,'300.055');assert.equal(result?.paid,'1200.45');
});
test('Reject real saved invoice lookup and unsupported financial assumptions',()=>{
  assert.equal(calc('كم المتبقي في فاتورتي المحفوظة 1500 بعد دفع 400'),null);
  assert.equal(calc('فاتورة افتراضية قيمتها 1500 USD بعد خصم 10% دفعت 400 كم المتبقي'),null);
  assert.equal(calc('فاتورة افتراضية قيمتها 1500 USD دفعت 400 كم المتبقي احفظها'),null);
  assert.equal(calc('فاتورة افتراضية قيمتها 1.500,00 USD دفعت 400 كم المتبقي'),null);
});
test('Reject date, second invoice, additional claim, or negative payment',()=>{
  assert.equal(calc('فاتورة افتراضية 1500 USD دفعت 400 بتاريخ 2026-10-22 و350 كم المتبقي'),null);
  assert.equal(calc('فاتورة افتراضية 1500 USD دفعت 400 و350 كم المتبقي هل هو 750؟'),null);
  assert.equal(calc('فاتورة افتراضية 1500 USD دفعت 400 لفاتورة ثانية 500 كم المتبقي'),null);
  assert.equal(calc('فاتورة افتراضية 1500 USD دفعت -400 كم المتبقي'),null);
});
test('No fabricated automatic rates, saved invoice lookup or mutation path in module',async()=>{
  const module=await readFile(new URL('../api/_ai/hypothetical-invoice-payment.js',import.meta.url),'utf8');
  assert.doesNotMatch(module,/import |fetch\(|firebase|mutateVault|routeAiStructured|exchangeRate|rateFrom|writeFile/i);
});
test('Both server routes calculate after auth and context validation but before documents or AI providers',async()=>{
  const [advisor,core]=await Promise.all([
    readFile(new URL('../api/ai-advisor-v2.js',import.meta.url),'utf8'),
    readFile(new URL('../api/ai-core.js',import.meta.url),'utf8')
  ]);
  for(const source of [advisor,core]){
    const auth=source.indexOf('requireAiFirebaseAuth(request,response)');
    const clean=source.indexOf('const cleaned=cleanRequest(body)');
    const calcAt=source.indexOf('hypotheticalInvoicePaymentAnswer(cleaned.message,cleaned.context.language)');
    const dialogue=source.indexOf('await naturalLourexDialogue(cleaned,');
    assert.ok(auth>=0&&auth<clean&&clean<calcAt&&calcAt<dialogue);
    assert.match(source,/model:'deterministic-hypothetical-money',answer:hypothetical\.answer,proposal:null/);
  }
  assert.ok(advisor.indexOf('const hypothetical=hypotheticalInvoicePaymentAnswer')<advisor.indexOf('const exactDocumentAnswer=deterministicDocumentAnswer'));
  assert.match(core,/!cleaned\.context\.conversationSources\?\.length/,'attachments keep their own analysis route');
});
