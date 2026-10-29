import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {exactStructuredCartonQuote} from '../dist/src/lib/ai-text-quote-preview.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';

const fixture=`أنشئ لي **مسودة عرض سعر تجاري احترافية ومتكاملة** باسم LOUREX Trading.
- العميل: شركة الندى للتجارة والتوزيع — عميل تجريبي.
- العملة: USD.
**الصنف الأول: شوكولاتة بالحليب 100 غرام**
- الكمية: 30 كرتونًا.
- التعبئة: 24 قطعة في الكرتون.
- إجمالي القطع: 720 قطعة.
- سعر القطعة: 1.40 USD.
- سعر الكرتون: 33.60 USD.
- إجمالي الصنف: 1,008.00 USD.
**الصنف الثاني: شوكولاتة بيضاء 100 غرام**
- الكمية: 20 كرتونًا.
- التعبئة: 24 قطعة في الكرتون.
- إجمالي القطع: 480 قطعة.
- سعر القطعة: 1.55 USD.
- سعر الكرتون: 37.20 USD.
- إجمالي الصنف: 744.00 USD.
**الصنف الثالث: شوكولاتة داكنة 100 غرام**
- الكمية: 15 كرتونًا.
- التعبئة: 24 قطعة في الكرتون.
- إجمالي القطع: 360 قطعة.
- سعر القطعة: 1.65 USD.
- سعر الكرتون: 39.60 USD.
- إجمالي الصنف: 594.00 USD.
**الصنف الرابع: بسكويت مغطى بالشوكولاتة 40 غرام**
- الكمية: 25 كرتونًا.
- التعبئة: 48 قطعة في الكرتون.
- إجمالي القطع: 1,200 قطعة.
- سعر القطعة: 0.75 USD.
- سعر الكرتون: 36.00 USD.
- إجمالي الصنف: 900.00 USD.
**الصنف الخامس: كريمة البندق بالشوكولاتة 350 غرام**
- الكمية: 10 كراتين.
- التعبئة: 12 عبوة في الكرتون.
- إجمالي العبوات: 120 عبوة.
- سعر العبوة: 3.10 USD.
- سعر الكرتون: 37.20 USD.
- إجمالي الصنف: 372.00 USD.
**الصنف السادس: شوكولاتة حبيبات بالحليب 1 كغ**
- الكمية: 12 كرتونًا.
- التعبئة: 8 أكياس في الكرتون.
- إجمالي الأكياس: 96 كيسًا.
- سعر الكيس: 7.80 USD.
- سعر الكرتون: 62.40 USD.
- إجمالي الصنف: 748.80 USD.
## الحسابات
- إجمالي عدد الكراتين: 112 كرتونًا.
- إجمالي عدد الوحدات الداخلية: 2,976 وحدة.
- إجمالي قيمة البضائع: 4,366.80 USD.
- الخصم التجاري: 5% على قيمة البضائع فقط.
- قيمة الخصم: 218.34 USD.
- المجموع بعد الخصم: 4,148.46 USD.
- تكاليف النقل والشحن: 180.00 USD.
- **الإجمالي النهائي قبل أي ضرائب: 4,328.46 USD.**
## الشروط
- طريقة الدفع: 30% دفعة مقدمة و70% قبل الشحن.
- مدة تجهيز الطلب: 7 إلى 10 أيام عمل.
- مدة الصلاحية: 14 يومًا.
- مكان التسليم: مستودع العميل في حمص، سوريا.
لا تنشئ عميلًا دائمًا ولا تحفظ المستند أو تصدر فاتورة.`;
test('structured six-carton quotation stages all facts locally without provider, save or stock mutation',async()=>{
 const vault=emptyVault();
 const before=JSON.stringify(vault);
 const draft=exactStructuredCartonQuote(fixture);
 assert.ok(draft);
 assert.equal(draft.items.length,6);
 assert.deepEqual(draft.items.map(row=>[row.quantity,row.unit,row.unitPrice,row.packing]),[
  ['30','CTN','33.60','24 قطعة في الكرتون'],
  ['20','CTN','37.20','24 قطعة في الكرتون'],
  ['15','CTN','39.60','24 قطعة في الكرتون'],
  ['25','CTN','36.00','48 قطعة في الكرتون'],
  ['10','CTN','37.20','12 عبوة في الكرتون'],
  ['12','CTN','62.40','8 كيس في الكرتون']
 ]);
 assert.match(draft.notes,/4,?328.46 USD/);
 const previousFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('Local structured quote must never request AI');};
 try{
   const result=await orchestrateAiToolRequest({message:fixture,vault,language:'ar',
     context:{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}}});
   assert.equal(result.plannedBy,'local');
   assert.equal(result.proposal,null);
   assert.equal(result.results.length,0);
   assert.equal(result.workingDraft.items.length,6);
   assert.match(result.answer,/لم يُنشئ|لم أُنشئ/);
   const k=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'carton-test'});
   stageKernelArtifact(k,result.workingDraft);
   const card=workspaceDocument(k,vault,'ar');
   assert.equal(card.subtotal,'4366.80');
   assert.deepEqual(card.blockers,[]);
   assert.equal(JSON.stringify(vault),before);
 }finally{globalThis.fetch=previousFetch;}
});
test('structured carton quote fails closed on arithmetic, missing lines, conflicting totals or customer',()=>{
 const bad=[
  fixture.replace('112 كرتونًا','111 كرتونًا'),
  fixture.replace('2,976 وحدة','2,975 وحدة'),
  fixture.replace('4,328.46 USD','4,328.47 USD'),
  fixture.replace('720 قطعة','719 قطعة'),
  fixture.replace('33.60 USD','30.00 USD'),
  fixture.replace('- العميل: شركة الندى للتجارة والتوزيع — عميل تجريبي.',''),
  fixture.replace('- سعر الكرتون: 62.40 USD.',''),
  fixture.replace('**الصنف السادس:','**سطر غير معروف:'),
  fixture.replace('- سعر الكيس: 7.80 USD.','- سعر الكيس: 7.80 EUR.')
 ];
 for(const message of bad)assert.equal(exactStructuredCartonQuote(message),null,'Unverified structured draft must not be staged');
});
