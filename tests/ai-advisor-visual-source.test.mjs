import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('source-summary handler uses private visual task and a deadline inside the browser timeout',async()=>{
 const key='__sourceQa'+crypto.randomUUID().replaceAll('-','');let captured;
 const facts={summary:'Synthetic correction',facts:['QA-A quantity 10'],missing:['QA-B price'],warnings:[]};
 globalThis[key]={requireAiFirebaseAuth:async()=>true,routeAiStructured:async options=>{captured=options;return{success:true,data:facts};},aiRouterPublicError:()=>({status:503}),cleanVisionPageAttachments:()=>null,planWorkingDraft:()=>null};
 const source=(await readFile('api/ai-inbox.js','utf8')).replace(/import \{([^}]+)\} from '[^']+';/g,(_all,names)=>`const {${names}}=globalThis.${key};`);
 const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 try{
  const response={statusCode:0,setHeader(){},end(raw){this.body=JSON.parse(raw);}};
  const body={mode:'source-summary',kind:'file',mimeType:'image/png',data:'YWJj',fileName:'synthetic.png'};
  await handler({method:'POST',headers:{host:'qa.example',origin:'https://qa.example','x-requested-with':'LOUREX-Invoice'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}},response);
  assert.equal(response.statusCode,200);assert.deepEqual(response.body.source,facts);
  assert.equal(captured.taskType,'business_source_summary');assert.equal(captured.attachments[0].kind,'image');
  assert.ok(captured.totalBudgetMs<=26_000);assert.ok(captured.timeoutMs<=11_000);
 }finally{delete globalThis[key];}
});
