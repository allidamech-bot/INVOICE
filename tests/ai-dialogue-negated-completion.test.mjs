import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueClaimsDocumentCreation,naturalLourexDialogue} from '../api/_ai/lourex-dialogue.js';
const denials=[
 'لم يتم إنشاء مسودة عرض سعر.','لم يتم حفظ أي فاتورة.','لن يتم إعداد مسودة قبل موافقتك.',
 'لا يتم إنشاء فاتورة هنا.','ما تم إنشاء عرض سعر.','ما حفظت أي فاتورة.',
 'أحتاج تفاصيل التسليم لإتمام عرض سعر.','راجع البيانات لتتمكن من إعداد فاتورة.','ناقش تمويل الفاتورة أولًا.',
 'I have not created a quotation.','I have never saved an invoice.','The draft has not been prepared.',
 "I haven't created an invoice.","I haven't yet saved a quotation.",'I have not yet generated a draft.'
];
for(const text of denials)test('truthful non-execution is allowed: '+text,()=>assert.equal(dialogueClaimsDocumentCreation(text),false));
const claims=[
 'تم إنشاء مسودة عرض سعر.','وتم إنشاء فاتورة.','فحفظت مسودة عرض سعر.', 'يتم حفظ الفاتورة الآن.','تم حفظ فاتورة.','أنشأت فاتورة جديدة.','كما تم إعداد مسودة عرض سعر.',
 'I created a quotation.','Prepared the quotation draft.',
 'لم يتم حفظ عرض السعر، لكن تم إنشاء فاتورة.',
 'ما حفظت مسودة، لكن جهزت عرض سعر.',
 'I have not saved a quotation, but I created an invoice.',
 'I not only created a quotation, I also saved an invoice.',
 'لم يتم إلا إنشاء مسودة عرض سعر.','لم يتم إنشاء إلا فاتورة واحدة.'
];
for(const text of claims)test('unsupported completion stays rejected: '+text,()=>assert.equal(dialogueClaimsDocumentCreation(text),true));

test('truthful denial passes the real dialogue validator on its first provider attempt',async()=>{
 const oldFetch=globalThis.fetch,keys=['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','GEMINI_API_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));let calls=0;
 try{
  process.env.GROQ_API_KEY='synthetic-only';delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.GEMINI_API_KEY;
  globalThis.fetch=async()=>{calls++;return{ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({answer:'لم يتم إنشاء مسودة عرض سعر.'})},finish_reason:'stop'}]})};};
  const result=await naturalLourexDialogue({message:'Synthetic text-only check',context:{language:'ar'}},{mode:'advisor'});
  assert.equal(result.success,true);assert.equal(result.answer,'لم يتم إنشاء مسودة عرض سعر.');assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
