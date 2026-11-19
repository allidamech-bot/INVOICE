import test from 'node:test';
import assert from 'node:assert/strict';
import {createFiscalCommandService} from '../api/_fiscal/command-service.js';
import {createFiscalCommandHandler} from '../api/_fiscal/command-handler.js';
import {fiscalCommandConfig} from '../api/_fiscal/command-runtime.js';
const scope={accountUid:'owner',workspaceId:'qa',egsId:'egs',environment:'simulation'},owner={uid:'owner',role:'owner'},base='fiscalPrivateV1/owner/workspaces/qa',doc={documentId:'doc',documentRevision:1};
const cmd=(operation,extra={})=>({operation,workspaceId:'qa',...extra});
function fixture(patch={}){
 const rows=new Map([[base,{...scope,syntheticOnly:true,commandsEnabled:true,selectedEgsId:'egs'}],[base+'/egs/egs',{...scope,active:true}],[base+'/issueReviews/doc',{...scope,...doc,state:'approved',sourceRevision:'revision-one',sourceSha256:'a'.repeat(64)}],['users/owner/workspace/meta',{chunkStorage:'period-generations-v1',revision:'revision-one',sha256:'a'.repeat(64)}]]);
 const db={doc:path=>({path}),runTransaction:fn=>fn({get:async r=>({exists:rows.has(r.path),data:()=>structuredClone(rows.get(r.path))})})};
 const calls=[];const approve=async(i,c,options)=>{calls.push([i,c,options]);return {...doc,status:'approved'};};
 return {rows,calls,execute:createFiscalCommandService({db,approve,...patch})};
}
test('status exposes no private artifacts and missing SDK blocks preparation before approval',async()=>{
 const f=fixture();assert.deepEqual(await f.execute(owner,cmd('inspect')),{environment:'simulation',workspaceId:'qa',unitActive:true,onboarding:null,enrollmentHeld:false,capabilities:{enrollment:false,approval:true,preparation:false,submission:false}});
 await assert.rejects(f.execute(owner,cmd('prepare',doc)),/VERIFICATION_UNAVAILABLE/);assert.equal(f.calls.length,0);
 assert.deepEqual(await f.execute(owner,cmd('approve',doc)),{environment:'simulation',...doc,status:'approved'});
 assert.equal(f.calls[0][1].egsId,'egs');assert.deepEqual(f.calls[0][2],{expectedDocumentRevision:1,requireCommandEnabled:true});
});
test('wrong account, revision, injected EGS/amount and disabled commands fail closed',async()=>{
 const f=fixture();for(const [i,c] of [[{...owner,uid:'other'},cmd('inspect')],[{...owner,role:'viewer'},cmd('inspect')],[owner,cmd('approve',{...doc,documentRevision:2})],[owner,cmd('approve',{...doc,egsId:'foreign'})],[owner,cmd('approve',{...doc,total:1})]])await assert.rejects(f.execute(i,c));
 f.rows.set(base,{...f.rows.get(base),commandsEnabled:false});await assert.rejects(f.execute(owner,cmd('inspect')));assert.equal(f.calls.length,0);
});
test('trusted preparation and exact queue version are composed without client totals',async()=>{
 const calls=[];const f=fixture({prepare:async(s,id)=>{calls.push(['prepare',s,id]);return {documentId:id,status:'queued',version:1};},submit:async(s,id,v)=>{calls.push(['submit',s,id,v]);return {documentId:id,status:'reported',version:3};}});
 assert.equal((await f.execute(owner,cmd('prepare',doc))).status,'queued');
 f.rows.set(base+'/issues/doc',{...scope,...doc,status:'queued',version:1});await assert.rejects(f.execute(owner,cmd('submit',{...doc,expectedVersion:2})),/STALE_ISSUE/);
 assert.equal((await f.execute(owner,cmd('submit',{...doc,expectedVersion:1}))).status,'reported');assert.equal(calls.length,2);
});
async function http(handler,patch={}){const out={};await handler({method:'POST',headers:{host:'qa.test',origin:'https://qa.test','x-requested-with':'LOUREX-Invoice','content-type':'application/json',authorization:'Bearer '+'a'.repeat(128)},body:cmd('inspect'),...patch},{set statusCode(v){out.status=v;},setHeader(){},end(v){out.body=JSON.parse(v);}});return out;}
test('HTTP verifies origin and identity and returns only bounded public errors',async()=>{
 const f=fixture();const h=createFiscalCommandHandler({getRuntime:async()=>({verifyIdentity:async()=>owner,execute:f.execute})});
 assert.equal((await http(h)).status,200);assert.equal((await http(h,{body:{...cmd('inspect'),secret:'x'}})).status,400);assert.equal((await http(h,{method:'GET'})).status,405);assert.equal((await http(h,{body:cmd('prepare',doc)})).status,503);
 const revoked=createFiscalCommandHandler({getRuntime:async()=>({verifyIdentity:async()=>{throw Error('private');},execute:f.execute})});assert.deepEqual(await http(revoked),{status:401,body:{code:'FISCAL_AUTH_INVALID'}});
});
test('QA writer key cannot use production or reader identity',()=>{
 const project='lourex-fiscal-qa',reader={project_id:project,client_email:'reader@'+project+'.iam.gserviceaccount.com',private_key:'test'},writer={...reader,client_email:'writer@'+project+'.iam.gserviceaccount.com'},env={VERCEL_ENV:'preview',LOUREX_FISCAL_STATUS_ENABLED:'true',LOUREX_FISCAL_COMMANDS_ENABLED:'true',LOUREX_FISCAL_QA_PROJECT_ID:project,LOUREX_FISCAL_QA_SERVICE_ACCOUNT_JSON:JSON.stringify(reader),LOUREX_FISCAL_COMMAND_SERVICE_ACCOUNT_JSON:JSON.stringify(writer)};
 assert.deepEqual(fiscalCommandConfig(env),{project,account:writer});for(const p of [{VERCEL_ENV:'production'},{LOUREX_FISCAL_COMMANDS_ENABLED:'false'},{LOUREX_FISCAL_COMMAND_SERVICE_ACCOUNT_JSON:JSON.stringify(reader)}])assert.throws(()=>fiscalCommandConfig({...env,...p}));
});

test('held enrollment attempt is visible even before onboarding exists and prevents new remote commands',async()=>{const f=fixture({enrollment:{begin:async()=>{throw Error('must not call');}}});f.rows.set(base+'/egs/egs',{...scope,active:false});f.rows.set(base+'/egs/egs/enrollmentAttempts/compliance-csid',{...scope,state:'held'});const s=await f.execute(owner,cmd('inspect'));assert.equal(s.enrollmentHeld,true);assert.equal(s.onboarding,null);await assert.rejects(f.execute(owner,cmd('enroll',{otp:'123456'})),/ATTEMPT_HELD/);});

test('document commands return the reviewed source status and never infer approval from a changed workspace',async()=>{
 const f=fixture({reviewDocument:async(i,c)=>{assert.deepEqual(i,owner);assert.equal(c.egsId,'egs');assert.equal(c.invoiceType,'standard');return {...doc,status:'reviewed'};}});
 const view=await f.execute(owner,cmd('document-status',doc));assert.equal(view.status,'reviewed');assert.equal(view.capabilities.preparation,false);
 f.rows.set('users/owner/workspace/meta',{chunkStorage:'period-generations-v1',revision:'newer',sha256:'b'.repeat(64)});
 assert.equal((await f.execute(owner,cmd('document-status',doc))).status,'not-reviewed');await assert.rejects(f.execute(owner,cmd('approve',doc)),/REVIEW_REQUIRED/);
 assert.equal((await f.execute(owner,cmd('review',{...doc,invoiceType:'standard',supplyDate:'2026-11-18',paymentMeans:'30'}))).status,'reviewed');
 await assert.rejects(f.execute(owner,cmd('review',{...doc,invoiceType:'standard',supplyDate:'2026-11-18',paymentMeans:'30',seller:{}})));
});

test('recovery uses exact immutable issue version even after cloud source changes, not a second submit',async()=>{
 let called=0;const f=fixture({recover:async(s,id,v)=>{called++;assert.deepEqual(s,scope);assert.equal(id,'doc');assert.equal(v,2);return {status:'uncertain',version:3};},responseStatus:async()=>({recoveryAvailable:true,hasReceipt:false})});
 f.rows.set(base+'/issueIntents/doc',{...scope,...doc,state:'approved',sha256:'a'.repeat(64)});
 f.rows.set(base+'/issues/doc',{...scope,...doc,status:'submitting',version:2,snapshotDigest:'a'.repeat(64)});
 f.rows.set('users/owner/workspace/meta',{chunkStorage:'period-generations-v1',revision:'newer',sha256:'b'.repeat(64)});
 assert.equal((await f.execute(owner,cmd('document-status',doc))).capabilities.recovery,true);
 await assert.rejects(f.execute(owner,cmd('recover',{...doc,expectedVersion:1})),/STALE_ISSUE/);
 await assert.rejects(f.execute(owner,cmd('recover',{...doc,expectedVersion:2,attemptId:'injected'})));
 assert.deepEqual(await f.execute(owner,cmd('recover',{...doc,expectedVersion:2})),{environment:'simulation',documentId:'doc',status:'uncertain',version:3});
 assert.equal(called,1);
});
test('accounting routes allow only owner scoped identifiers and accepted immutable sales',async()=>{
 const calls=[];const accounting={report:async(s,from,to)=>{calls.push(['report',s,from,to]);return {environment:'simulation',readyForFiling:false};},postPurchase:async(s,id)=>{calls.push(['purchase',s,id]);return {status:'posted',key:'purchase-'+id};},postSale:async(s,id,revision)=>{calls.push(['sale',s,id,revision]);return {status:'posted',key:'sale-'+id};}};
 const f=fixture({accounting});await assert.rejects(f.execute(owner,cmd('post-sale',doc)));
 await assert.rejects(f.execute(owner,cmd('post-purchase',{purchaseId:'p',vat:'15.00'})));
 await f.execute(owner,cmd('post-purchase',{purchaseId:'p'}));await f.execute(owner,cmd('vat-report',{from:'2026-01-01',to:'2026-11-18'}));
 f.rows.set(base+'/issueIntents/doc',{...scope,...doc,state:'approved',sha256:'a'.repeat(64)});
 f.rows.set(base+'/issues/doc',{...scope,...doc,status:'cleared',version:3,snapshotDigest:'a'.repeat(64)});
 await f.execute(owner,cmd('post-sale',doc));
 assert.deepEqual(calls.map(x=>x[0]),['purchase','report','sale']);
});

test('approved cost correction command takes only a purchase ID from the owner',async()=>{
 const calls=[];const f=fixture({accounting:{postPurchaseCost:async(s,id)=>{calls.push([s,id]);return {status:'posted',key:'purchase-cost-'+id};}}});
 assert.deepEqual(await f.execute(owner,cmd('post-purchase-cost',{purchaseId:'p'})),{environment:'simulation',status:'posted',key:'purchase-cost-p'});
 assert.deepEqual(calls,[[scope,'p']]);
 for(const extra of [{purchaseId:'p',allocations:[]},{purchaseId:'p',deductibleVat:'15.00'},{purchaseId:'bad/path'}])await assert.rejects(f.execute(owner,cmd('post-purchase-cost',extra)));
 await assert.rejects(f.execute({...owner,role:'viewer'},cmd('post-purchase-cost',{purchaseId:'p'})));assert.equal(calls.length,1);
});


test('supplier dispatch command accepts only approved adjustment identity from the owner',async()=>{
 const calls=[];const f=fixture({accounting:{postPurchaseReturn:async(s,id)=>{calls.push([s,id]);return {status:'posted',key:'purchase-return-'+id};}}});
 assert.deepEqual(await f.execute(owner,cmd('post-purchase-return',{adjustmentId:'a'})),{environment:'simulation',status:'posted',key:'purchase-return-a'});
 for(const extra of [{adjustmentId:'a',quantity:'1'},{adjustmentId:'a',warehouseId:'injected'},{adjustmentId:'bad/path'}])await assert.rejects(f.execute(owner,cmd('post-purchase-return',extra)));
 await assert.rejects(f.execute({...owner,role:'viewer'},cmd('post-purchase-return',{adjustmentId:'a'})));assert.deepEqual(calls,[[scope,'a']]);
});

test('supplier settlement command only accepts owner and approved settlement identity',async()=>{
 const calls=[];const f=fixture({accounting:{postSupplierSettlement:async(s,id)=>{calls.push([s,id]);return {status:'posted',key:'supplier-settlement-'+id};}}});
 assert.deepEqual(await f.execute(owner,cmd('post-supplier-settlement',{settlementId:'s1'})),{environment:'simulation',status:'posted',key:'supplier-settlement-s1'});
 for(const extra of [{settlementId:'s1',amount:'1.00'},{settlementId:'bad/path'},{settlementId:'s1',egsId:'other'}])await assert.rejects(f.execute(owner,cmd('post-supplier-settlement',extra)));
 await assert.rejects(f.execute({...owner,role:'viewer'},cmd('post-supplier-settlement',{settlementId:'s1'})));assert.deepEqual(calls,[[scope,'s1']]);
});
