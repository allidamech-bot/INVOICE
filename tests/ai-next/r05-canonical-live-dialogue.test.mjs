import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {selectCanonicalDialogueRoute} from '../../api/_ai/lourex-dialogue.js';

const standard={taskType:'business_copilot',reasoningLevel:'standard'};
const complex={taskType:'cfo_report',reasoningLevel:'deep'};

test('original LOUREX dialogue uses fast route for everyday Arabic, English, mixed chat and draft requests',()=>{
  for(const message of [
    'السلام عليكم','مرحبا شو الأخبار','لا تحفظ ولا تنشئ أي شيء',
    'كم سعر هذا المنتج؟','افتح المسودة الحالية',
    'What is the price for SKU-17?','I need a quotation draft',
    'صحح الكمية ١٢ بدل ١٠','What does risk mean in English?',
    'قارن بين الكلمات بفقرتين',''
  ])assert.deepEqual(selectCanonicalDialogueRoute(message),standard,message);
});
test('explicit multi-factor financial analysis selects existing deep-capability FREE model bucket',()=>{
  for(const message of [
    'قارن صافي المبيعات وهوامش الربح بين الشهرين',
    'حلل الذمم ومخاطر التحصيل وأعطني توصية',
    'ليش انخفض هامش الربح هذا الشهر؟',
    'قيّم السيولة والتدفقات النقدية والمصاريف',
    'Compare receivables and cash flow and recommend a strategy',
    'Analyze inventory costs and supplier pricing trends',
  ])assert.deepEqual(selectCanonicalDialogueRoute(message),complex,message);
});
test('historical/source content cannot silently elevate the current simple request',()=>{
  assert.deepEqual(selectCanonicalDialogueRoute('تمام'),standard);
  assert.deepEqual(selectCanonicalDialogueRoute('No, leave the quote unchanged.'),standard);
  assert.deepEqual(selectCanonicalDialogueRoute('لا تعدل السجلات، فقط أكد أنك فهمت'),standard);
});
async function isolated(mocks){
  const spec='./router.js';
  const key='__canonical'+crypto.randomUUID().replaceAll('-','');
  globalThis[key]=mocks;
  const path='api/_ai/lourex-dialogue.js';
  const url=pathToFileURL(process.cwd()+'/'+path);
  const source=readFileSync(path,'utf8').replace(
    /import \{routeAiStructured\} from '\.\/router\.js';/,
    'const {routeAiStructured}=globalThis.'+key+'['+JSON.stringify(spec)+'];'
  );
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  return {module,clear:()=>delete globalThis[key]};
}
test('live single-dialogue backend routes actual existing API call without new UI or financial execution',async()=>{
  const calls=[],d=await isolated({'./router.js':{
    routeAiStructured:async options=>{
      calls.push(options);
      return{success:true,data:{answer:'فهمت السؤال ولم أغيّر أي بيانات.'}};
    }
  }});
  try{
    const base={language:'ar',context:{language:'ar',
      workingMemory:'آخر رسالة: صححت السعر من 10 إلى 12؛ لا تحفظ دون تأكيد.',
      conversationSources:[],screen:'reports'}};
    const a=await d.module.naturalLourexDialogue({...base,message:'قارن صافي المبيعات وهامش الربح'},{mode:'controller'});
    const b=await d.module.naturalLourexDialogue({...base,message:'تمام، فقط فهمت علي؟'},{mode:'advisor'});
    assert.equal(a.success,true);
    assert.equal(b.success,true);
    assert.equal(calls.length,2);
    assert.deepEqual(calls.map(c=>[c.taskType,c.reasoningLevel]),
      [['cfo_report','deep'],['business_copilot','standard']]);
    for(const call of calls){
      assert.equal(call.fairBudget,true);
      assert.ok(call.totalBudgetMs<=26000);
      assert.equal(call.externalDataClass,undefined,'private chat must not masquerade as synthetic');
      assert.match(call.prompt,/لا تحفظ دون تأكيد/);
      assert.match(call.prompt,/Only a separate, explicitly approved application tool|you do not execute/);
      assert.equal(call.validate({answer:'أنشأت عرض سعر الآن.'}),false,
        'read-only dialogue cannot claim a document mutation');
    }
    assert.equal(a.proposal,null);
    assert.equal(b.proposal,null);
  }finally{d.clear();}
});
test('approved original UI has one AI chat and one authenticated shared conversation gateway',()=>{
  const ui=readFileSync('src/components/AiCopilot.tsx','utf8');
  const server=readFileSync('api/ai-conversation-v3.js','utf8');
  assert.match(ui,/id="lourex-ai-panel"/);
  assert.doesNotMatch(ui,/AiNextLiveReadOnlyLauncher|AI Next · Live/);
  assert.doesNotMatch(server,/nextLiveReadOnlyHandler|nextLive=1/);
  assert.match(server,/naturalLourexDialogue/);
});
