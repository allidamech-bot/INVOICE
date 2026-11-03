import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {emptyVault} from '../../dist/src/lib/defaults.js';
import {buildAiFinanceContext} from '../../dist/src/lib/ai-finance.js';
import {buildAiBusinessContext} from '../../dist/src/lib/ai-business.js';
import {buildProductPricingContext} from '../../dist/src/lib/product-pricing-intelligence.js';
import {explicitNoWriteRequested} from '../../api/_ai/no-write-guard.js';

test('no-write override recognizes only explicit latest Arabic/English prohibitions',()=>{
  for(const message of [
    'لا تنشئ أي شيء، فقط أكد أنك فهمت',
    'لا تحفظ ولا تعدل أي مستند',
    'بدون حفظ، فقط اشرح',
    'لن تنفذ أي عملية الآن',
    'لا تصدر فاتورة ولا تغيّر السعر',
    'أريد معاينة فقط',
    'do not create or save a quote',
    "don't modify any records; confirm understanding",
    'without saving just show a preview',
    'never delete any document',
  ])assert.equal(explicitNoWriteRequested(message),true,message);
  for(const message of [
    'لا، خلي الكمية 12 بدل 10',
    'لا، بدي عرض سعر جديد',
    'Create a draft quote for 12 units',
    'أنشئ عرض سعر للعميل',
    'What does "modify" mean?',
    'الكمية خمسة عشر والسعر 20',
    'تمام',
  ])assert.equal(explicitNoWriteRequested(message),false,message);
});

async function isolatedApi(mocks){
  const key='__noWrite'+crypto.randomUUID().replaceAll('-','');
  globalThis[key]=mocks;
  const path='api/ai-core.js',url=pathToFileURL(process.cwd()+'/'+path);
  const source=readFileSync(path,'utf8')
    .replace(/import \{([^}]+)\} from '([^']+)';/g,(_all,names,spec)=>
      spec in mocks?'const {'+names+'}=globalThis.'+key+'['+JSON.stringify(spec)+'];':
      'import {'+names+'} from '+JSON.stringify(new URL(spec,url).href)+';');
  return{module:await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),clear:()=>delete globalThis[key]};
}
function makeRequest(message,documentConversation=null){
  const vault=emptyVault(),business=buildAiBusinessContext(vault,'2026-11-03');
  const context={version:5,screen:'home',language:'ar',conversationMode:'controller',
    business,finance:buildAiFinanceContext({documents:[],payments:[],customers:[]},message,business.asOf),
    pricing:buildProductPricingContext(vault,message,business.asOf),
    drafting:{defaults:{currency:'USD',language:'en'},items:[],customers:[]},
    ...(documentConversation?{documentConversation}:{})};
  const body={message,context};
  return{method:'POST',headers:{
    origin:'https://invoice-three-puce.vercel.app',
    host:'invoice-three-puce.vercel.app','x-requested-with':'LOUREX-Invoice',
  },async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};
}
function response(){return{statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},
  end(raw){this.body=JSON.parse(raw);}};}
test('real Controller endpoint does NOT ask an action-planning model after a no-write follow-up, even with unfinished quote',async()=>{
  let plannerCalls=0,dialogueCalls=0;
  const a=await isolatedApi({
    './_ai/firebase-auth.js':{requireAiFirebaseAuth:async req=>{
      req.aiVerifiedUid='qa-signed-owner';req.aiVerifiedRole='owner';return true;
    }},
    './_ai/router.js':{
      routeAiStructured:async()=>{plannerCalls++;throw Error('ACTION_ROUTE_MUST_NOT_RUN');},
      aiRouterPublicError:()=>({status:503,code:'NO_PROVIDER'})
    },
    './_ai/lourex-dialogue.js':{
      naturalLourexDialogue:async()=>{dialogueCalls++;return{
        success:true,answer:'فهمت تعليماتك. لم يتم إنشاء أو حفظ أي شيء.',proposal:null};
      },
      sanitizeReadEvidence:()=>[],sanitizeDialogueCatalog:()=>null,
      sanitizeDocumentConversation:value=>value,
      dialogueRepeatsLastAnswer:()=>false,
    }
  });
  try{
    const pending={kind:'proforma',userFacts:['أنشئ عرض سعر لمنتج 12 قطعة بسعر 20 دولار'],lastQuestion:'هل تريد إضافات؟'};
    const req=makeRequest('لا تنشئ ولا تحفظ أي شيء، فقط أكد فهمك',pending),res=response();
    await a.module.default(req,res);
    assert.equal(res.statusCode,200,JSON.stringify(res.body));
    assert.equal(res.body.proposal,null);
    assert.equal(plannerCalls,0);
    assert.equal(dialogueCalls,1);
  }finally{a.clear();}
});
test('ordinary explicitly affirmative quotation remains eligible for approved existing Controller planner',async()=>{
  let plannerCalls=0,dialogueCalls=0;
  const a=await isolatedApi({
    './_ai/firebase-auth.js':{requireAiFirebaseAuth:async()=>true},
    './_ai/router.js':{
      routeAiStructured:async()=>{plannerCalls++;return{
        success:true,data:{answer:'Need unit and currency.',proposal:null}
      };},
      aiRouterPublicError:()=>({status:503,code:'NO_PROVIDER'})
    },
    './_ai/lourex-dialogue.js':{
      naturalLourexDialogue:async()=>{dialogueCalls++;return{
        success:true,answer:'Please clarify.',proposal:null};},
      sanitizeReadEvidence:()=>[],sanitizeDialogueCatalog:()=>null,
      sanitizeDocumentConversation:value=>value,
      dialogueRepeatsLastAnswer:()=>false,
    }
  });
  try{
    const req=makeRequest('أنشئ عرض سعر جديد من قطعتين بسعر 25 دولار'),res=response();
    await a.module.default(req,res);
    assert.equal(res.statusCode,200,JSON.stringify(res.body));
    assert.equal(plannerCalls,1,'affirmative request should not be swallowed');
    assert.equal(dialogueCalls,0);
  }finally{a.clear();}
});
test('one approved LOUREX UI and no financial/extra endpoint edits',()=>{
  const ui=readFileSync('src/components/AiCopilot.tsx','utf8');
  const source=readFileSync('api/ai-core.js','utf8');
  assert.match(ui,/id="lourex-ai-panel"/);
  assert.doesNotMatch(ui,/AiNextLiveReadOnlyLauncher|AI Next · Live/);
  assert.match(source,/explicitNoWriteRequested\(message\)/);
  assert.match(source,/explicitNoWriteRequested\(cleaned\.message\)/);
});
