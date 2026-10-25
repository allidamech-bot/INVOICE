import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('working draft planning leaves time for failover and settles before its browser deadline',async()=>{
 const key='__draftDeadlineQa';let captured;
 globalThis[key]={routeAiStructured:async options=>{captured=options;return{success:true,data:{action:'unrelated',question:'',operations:[]}};},aiRouterPublicError:()=>({status:503})};
 const source=(await readFile('api/_ai/draft-plan.js','utf8')).replace(/import \{([^}]+)\} from '[^']+';/g,(_all,names)=>`const {${names}}=globalThis.${key};`);
 try{
  const {planWorkingDraft}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const result=await planWorkingDraft({conversationMode:'controller',scope:'business',message:'Prepare a different quotation',draft:{id:'qa',revision:1,rows:[{id:'a',descriptionEn:'QA',quantity:'10',unit:'PCS',unitPrice:'1.25'}]}});
  assert.equal(result.status,200);assert.equal(result.body.plan.action,'unrelated');
  assert.ok(Number.isFinite(captured.totalBudgetMs)&&captured.totalBudgetMs<=26000,'Full draft planner chain must have a finite 26s cap');
  assert.ok(captured.timeoutMs<=12000,'Keep a second provider window');
  assert.equal(captured.strictOutput,true,'Cell patch planner must request constrained JSON decoding');
  const checkClosed=node=>{if(node.type==='OBJECT'){assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());Object.values(node.properties).forEach(checkClosed);}if(node.items)checkClosed(node.items);};
  checkClosed(captured.schema);
  const runtime=await readFile('src/lib/ai-intelligence-runtime.ts','utf8');
  assert.match(runtime,/customers:drafting\.customers\.map\(row=>\(\{id:row\.id,name:row\.name\}\)\)\},controller\.signal,30000\)/,'Browser must allow the bounded fallback chain plus transport overhead');
 }finally{delete globalThis[key];}
});

async function invoke(path,fixture){
 const key='__deadlineQa'+crypto.randomUUID().replaceAll('-','');let captured;
 globalThis[key]={requireAiFirebaseAuth:async()=>true,routeAiStructured:async options=>{captured=options;return{success:true,data:fixture};},aiRouterPublicError:()=>({status:503}),cleanVisionPageAttachments:()=>null,planWorkingDraft:()=>null,includesExplicitSourceCodes:()=>true,explicitQuoteSource:()=>null,normalizeSourceNumber:v=>v,explicitSourceDecimal:v=>v};
 const source=(await readFile(path,'utf8')).replace(/import \{([^}]+)\} from '[^']+';/g,(_all,names)=>`const {${names}}=globalThis.${key};`);
 try{
  const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const response={statusCode:0,setHeader(){},end(raw){this.body=JSON.parse(raw);}};
  const body={kind:'file',mimeType:'image/png',data:'YWJj',fileName:'synthetic.png'};
  await handler({method:'POST',headers:{host:'qa.example',origin:'https://qa.example','x-requested-with':'LOUREX-Invoice'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}},response);
  assert.equal(response.statusCode,200,JSON.stringify(response.body));return captured;
 }finally{delete globalThis[key];}
}
test('actual classification handler bounds its full fallback chain below the 30s browser request',async()=>{
 const options=await invoke('api/ai-inbox.js',{route:'quote_request',documentType:'rfq',confidence:.95,reason:'Synthetic QA'});
 assert.equal(options.taskType,'ai_inbox_classification');assert.equal(options.attachments[0].kind,'image');
 assert.ok(Number.isFinite(options.totalBudgetMs)&&options.totalBudgetMs<=26_000,'Classification must finish before its caller gives up');
 assert.ok(options.timeoutMs<=12_000,'Leave a useful window for an alternate provider');
});
test('actual structured quote extraction handler bounds its full chain below the 45s browser request',async()=>{
 const options=await invoke('api/quote-source-ai.js',{currency:'USD',items:[{sku:'QA-A',quantity:'10',unit:'PCS',unitPrice:'1.25'}]});
 assert.equal(options.taskType,'quote_extract');assert.equal(options.attachments[0].kind,'image');
 assert.ok(Number.isFinite(options.totalBudgetMs)&&options.totalBudgetMs<=40_000,'Quote extraction must finish before its caller gives up');
 assert.equal(options.qualityFallback,true,'Keep low-confidence evidence review/fallback behavior');
 assert.equal(typeof options.validate,'function','Keep structured row validation');
});
