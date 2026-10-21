import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createPeriodService} from '../api/_accounting/period-store.js';
import {encodeWorkspace} from '../api/_accounting/period-format.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {randomBytes,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {readPlainBackup} from '../dist/src/lib/backup.js';
import {validatePeriodArchive} from '../dist/src/lib/period-archive.js';
import {isIsoDate} from '../dist/src/lib/id.js';

const project='demo-lourex-period';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Local Firestore emulator is required; live projects are forbidden.');
const app=initializeApp({projectId:project},'period-emulator-'+Date.now()),db=getFirestore(app);
const id=()=>randomBytes(16).toString('hex');
const actor={uid:'qa-period-'+id(),role:'owner'};
const root=db.collection('users').doc(actor.uid),service=createPeriodService(db);
let revision=id(),generation=0;
const base=emptyVault(),doc=createBlankDocument('invoice','QA-PERIOD',base.company);
Object.assign(doc,{id:'invoice',status:'final',workspaceId:'default',branchId:'main',issueDate:'2026-10-01',currency:'USD'});
doc.items[0].quantity='1';doc.items[0].unitPrice='100';base.documents=[doc];
async function seed(){const encoded=encodeWorkspace(base,revision);for(const c of encoded.chunks)await root.collection('workspace').doc('chunk-'+revision+'-'+String(c.index).padStart(5,'0')).create(c);await root.collection('workspace').doc('meta').create(encoded.meta);}
async function command(operation,extra={}){const input={operation,opId:id(),expectedRevision:revision,expectedGeneration:generation,...extra};const result=await service.execute(actor,input);generation=result.generation;revision=result.revision;return{input,result};}
async function stage(opId,payload){const encoded=encodeWorkspace(payload,opId),stage=root.collection('periodStaging').doc(opId);await stage.create(encoded.meta);for(const c of encoded.chunks)await stage.collection('chunks').doc(String(c.index).padStart(5,'0')).create(c);}
async function isolated(){
  const identity={uid:'qa-independent-'+id(),role:'owner'},root=db.collection('users').doc(identity.uid),revision=id(),encoded=encodeWorkspace(base,revision);
  await root.collection('workspace').doc('meta').create(encoded.meta);
  for(const c of encoded.chunks)await root.collection('workspace').doc('chunk-'+revision+'-'+String(c.index).padStart(5,'0')).create(c);
  const enrolled=await service.execute(identity,{operation:'enroll',opId:id(),expectedRevision:revision,expectedGeneration:0});
  return{identity,root,revision:enrolled.revision};
}
async function independentStage(root,opId,payload){const encoded=encodeWorkspace(payload,opId),ref=root.collection('periodStaging').doc(opId);await ref.create(encoded.meta);for(const c of encoded.chunks)await ref.collection('chunks').doc(String(c.index).padStart(5,'0')).create(c);}
function clientToken(uid){return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,user_id:uid,aud:project,iss:'https://securetoken.google.com/'+project,iat:1,exp:4102444800,firebase:{identities:{},sign_in_provider:'password'}})).toString('base64url')+'.';}
async function clientWrite(path,method='PATCH',fields={}){return fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/'+project+'/databases/(default)/documents/users/'+actor.uid+'/'+path,{method,headers:{authorization:'Bearer '+clientToken(actor.uid),'content-type':'application/json'},...(method==='DELETE'?{}:{body:JSON.stringify({fields})})});}

test('trusted enrollment, close, stale rejection, reopen and retained publication use real Firestore transactions',async()=>{
  await seed();
  const inspectionId=id(),before=await service.execute(actor,{operation:'inspect',opId:inspectionId,expectedRevision:revision,expectedGeneration:0});
  assert.equal(before.enrolled,false);assert.equal(before.generation,0);assert.equal((await root.collection('periodOperations').get()).size,0);assert.equal((await root.collection('accounting').doc('control').get()).exists,false);
  await command('enroll');
  const after=await service.execute(actor,{operation:'inspect',opId:inspectionId,expectedRevision:revision,expectedGeneration:0});assert.equal(after.enrolled,true);assert.equal(after.generation,1);assert.equal((await root.collection('periodOperations').get()).size,1);assert.equal((await root.collection('periodOperations').doc(inspectionId).get()).exists,false);
  const closed=await command('close',{workspaceId:'default',through:'2026-10-31',reason:'QA October close'});
  const report=await root.collection('periodReports').doc(closed.result.reportId).get();assert.equal(report.exists,true);
  const bad=structuredClone(base);bad.documents[0].items[0].unitPrice='200';
  const badId=id();await stage(badId,bad);
  await assert.rejects(service.execute(actor,{operation:'commit',opId:badId,expectedRevision:revision,expectedGeneration:generation}),/PERIOD_CHANGED/);
  const stateBefore=(await root.collection('accounting').doc('control').get()).data();assert.equal(stateBefore.generation,generation);
  await assert.rejects(service.execute(actor,{operation:'reopen',opId:id(),expectedRevision:revision,expectedGeneration:generation-1,workspaceId:'default',reason:'stale'}),/REVISION_CONFLICT/);
  const reopened=await command('reopen',{workspaceId:'default',reason:'QA approved correction'});
  assert.equal((await root.collection('periodReports').doc(closed.result.reportId).get()).exists,true);
  const again=await service.execute(actor,reopened.input);assert.deepEqual(again,reopened.result);
  await assert.rejects(service.execute(actor,{...reopened.input,reason:'different replay'}),/OPERATION_REUSED/);
  const corrected=id();await stage(corrected,bad);
  const result=await service.execute(actor,{operation:'commit',opId:corrected,expectedRevision:revision,expectedGeneration:generation});
  generation=result.generation;revision=result.revision;assert.notEqual(revision,closed.result.revision);
  const reclosed=await command('close',{workspaceId:'default',through:'2026-10-31',reason:'QA replacement report'});
  assert.notEqual(reclosed.result.reportId,closed.result.reportId);
  assert.equal((await root.collection('periodReports').doc(closed.result.reportId).get()).exists,true);
});
test('rules block stale owner clients, forged controls, history deletion and mutable staged data',async()=>{
  for(const path of ['workspace/meta','workspace/chunk-'+revision+'-00000','periodGenerations/'+revision+'/chunks/chunk-'+revision+'-00000','accounting/control','periodOperations/forged','workspaceHistory/forged','vault/meta','vaultHistory/forged']){
    const result=await clientWrite(path);assert.equal(result.status,403,path+': '+await result.text());
  }
  assert.equal((await clientWrite('accounting/control','DELETE')).status,403);
  const reportId=(await root.collection('accounting').doc('control').get()).data().boundaries[0].reportId;
  assert.equal((await clientWrite('periodReports/'+reportId,'DELETE')).status,403);
  assert.equal((await clientWrite('periodReports/'+reportId+'/chunks/chunk-'+reportId+'-00000')).status,403);
  const stagedId=id(),stagedMeta=encodeWorkspace(base,stagedId).meta;
  const fieldsOf=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,
    value===null?{nullValue:null}:typeof value==='number'?{integerValue:String(value)}:{stringValue:value}]));
  assert.equal((await clientWrite('periodStaging/'+stagedId,'PATCH',fieldsOf(stagedMeta))).status,200,'valid current-schema staged metadata');
  assert.equal((await clientWrite('periodStaging/'+stagedId,'PATCH',fieldsOf({...stagedMeta,sha256:'0'.repeat(64)}))).status,403);
  assert.equal((await clientWrite('periodStaging/'+stagedId,'DELETE')).status,403);
  const opId=id(),path='periodStaging/'+opId+'/chunks/00000';
  const fields={index:{integerValue:'0'},revision:{stringValue:opId},data:{stringValue:'e30='}};
  assert.equal((await clientWrite(path,'PATCH',fields)).status,200);
  assert.equal((await clientWrite(path,'PATCH',{...fields,data:{stringValue:'e10='}})).status,403);
  assert.equal((await clientWrite(path,'DELETE')).status,403);
});
test('competing device commits cannot both replace a single authoritative revision',async()=>{
  await command('reopen',{workspaceId:'default',reason:'QA race'});
  const a=id(),b=id(),next=structuredClone(base);next.documents[0].notes='QA';await stage(a,next);await stage(b,next);
  const results=await Promise.allSettled([a,b].map(opId=>service.execute(actor,{operation:'commit',opId,expectedRevision:revision,expectedGeneration:generation})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION_CONFLICT/);
});
test('retained published snapshot rejects preexisting source drift rather than blessing it as a new baseline',async()=>{
  const identity={uid:'qa-drift-'+id(),role:'owner'},other=db.collection('users').doc(identity.uid);let sourceRevision=id();
  const original=encodeWorkspace(base,sourceRevision);
  for(const c of original.chunks)await other.collection('workspace').doc('chunk-'+sourceRevision+'-'+String(c.index).padStart(5,'0')).create(c);
  await other.collection('workspace').doc('meta').create(original.meta);
  const enrolled=await service.execute(identity,{operation:'enroll',opId:id(),expectedRevision:sourceRevision,expectedGeneration:0});sourceRevision=enrolled.revision;
  await service.execute(identity,{operation:'close',opId:id(),expectedRevision:sourceRevision,expectedGeneration:1,workspaceId:'default',through:'2026-10-31',reason:'QA'});
  // Simulate a future faulty admin restore bypassing the normal write gate.
  const changed=structuredClone(base);changed.documents[0].items[0].unitPrice='300';const altered=encodeWorkspace(changed,sourceRevision);
  for(const c of altered.chunks)await other.collection('periodGenerations').doc(sourceRevision).collection('chunks').doc('chunk-'+sourceRevision+'-'+String(c.index).padStart(5,'0')).set(c);
  await other.collection('workspace').doc('meta').set({...altered.meta,chunkStorage:'period-generations-v1'});
  const opId=id(),candidate=encodeWorkspace(changed,opId),stageRef=other.collection('periodStaging').doc(opId);
  await stageRef.create(candidate.meta);for(const c of candidate.chunks)await stageRef.collection('chunks').doc(String(c.index).padStart(5,'0')).create(c);
  await assert.rejects(service.execute(identity,{operation:'commit',opId,expectedRevision:sourceRevision,expectedGeneration:2}),/PERIOD_CHANGED/);
});
test('close versus backdated commit has one winner and never accepts the stale device after close',async()=>{
  const f=await isolated(),opId=id(),changed=structuredClone(base);changed.documents[0].items[0].unitPrice='200';await independentStage(f.root,opId,changed);
  const common={expectedRevision:f.revision,expectedGeneration:1};
  const results=await Promise.allSettled([
    service.execute(f.identity,{...common,operation:'close',opId:id(),workspaceId:'default',through:'2026-10-31',reason:'QA race close'}),
    service.execute(f.identity,{...common,operation:'commit',opId})
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION_CONFLICT/);
});
test('reopen versus extended close serializes against the same control generation',async()=>{
  const f=await isolated();await service.execute(f.identity,{operation:'close',opId:id(),expectedRevision:f.revision,expectedGeneration:1,workspaceId:'default',through:'2026-10-31',reason:'QA'});
  const common={expectedRevision:f.revision,expectedGeneration:2,workspaceId:'default',reason:'QA race'};
  const results=await Promise.allSettled([
    service.execute(f.identity,{...common,operation:'reopen',opId:id()}),
    service.execute(f.identity,{...common,operation:'close',opId:id(),through:'2026-11-30'})
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION_CONFLICT/);
});
test('concurrent retries return one close receipt and one published version',async()=>{
  const f=await isolated(),input={operation:'close',opId:id(),expectedRevision:f.revision,expectedGeneration:1,workspaceId:'default',through:'2026-10-31',reason:'QA retry'};
  const [a,b]=await Promise.all([service.execute(f.identity,input),service.execute(f.identity,input)]);assert.deepEqual(a,b);
  assert.equal((await f.root.collection('periodReports').get()).size,1);
  assert.equal((await f.root.collection('accounting').doc('control').get()).data().generation,2);
});
test('incomplete staged payload cannot advance the control or authoritative revision',async()=>{
  const f=await isolated(),opId=id(),encoded=encodeWorkspace(base,opId);await f.root.collection('periodStaging').doc(opId).create(encoded.meta);
  await assert.rejects(service.execute(f.identity,{operation:'commit',opId,expectedRevision:f.revision,expectedGeneration:1}),/INVALID_WORKSPACE_CHUNKS/);
  assert.equal((await f.root.collection('accounting').doc('control').get()).data().generation,1);
  assert.equal((await f.root.collection('workspace').doc('meta').get()).data().revision,f.revision);
});
test('a delayed receipt read still recovers the successful identical operation after the control advances',async()=>{
  const f=await isolated(),input={operation:'close',opId:id(),expectedRevision:f.revision,expectedGeneration:1,workspaceId:'default',through:'2026-10-31',reason:'QA lost response'};
  let observed,release;const readObserved=new Promise(resolve=>{observed=resolve;}),resume=new Promise(resolve=>{release=resolve;});
  let delayed=false;
  function wrap(target){return new Proxy(target,{get(object,key){
    if(key==='collection'||key==='doc')return(...args)=>wrap(object[key](...args));
    if(key==='get'&&object.path===f.root.path+'/periodOperations/'+input.opId)return async()=>{
      const snapshot=await object.get();if(!delayed){delayed=true;observed();await resume;}return snapshot;
    };
    const value=Reflect.get(object,key,object);return typeof value==='function'?value.bind(object):value;
  }});}
  const slow=createPeriodService(wrap(db)).execute(f.identity,input);
  await readObserved;let completed;
  try{completed=await service.execute(f.identity,input);}finally{release();}
  assert.deepEqual(await slow,completed);
});
test('missing or corrupt legacy chunks cannot enroll or freeze a repairable legacy account',async()=>{
  for(const corrupt of [false,true]){
    const identity={uid:'qa-bad-enroll-'+id(),role:'owner'},root=db.collection('users').doc(identity.uid),revision=id(),encoded=encodeWorkspace(base,revision);
    await root.collection('workspace').doc('meta').create(encoded.meta);
    if(corrupt)for(const c of encoded.chunks)await root.collection('workspace').doc('chunk-'+revision+'-'+String(c.index).padStart(5,'0')).create({...c,data:'e30='});
    await assert.rejects(service.execute(identity,{operation:'enroll',opId:id(),expectedRevision:revision,expectedGeneration:0}),/INVALID_WORKSPACE_CHUNKS|WORKSPACE_HASH_MISMATCH/);
    assert.equal((await root.collection('accounting').doc('control').get()).exists,false);
  }
});
test('enrollment adopts a verified immutable copy even if a legacy chunk is changed just before adoption',async()=>{
  const identity={uid:'qa-adoption-'+id(),role:'owner'},root=db.collection('users').doc(identity.uid),revision=id(),encoded=encodeWorkspace(base,revision);
  await root.collection('workspace').doc('meta').create(encoded.meta);
  for(const c of encoded.chunks)await root.collection('workspace').doc('chunk-'+revision+'-'+String(c.index).padStart(5,'0')).create(c);
  let injected=false;
  const delayedDb=new Proxy(db,{get(object,key){
    if(key==='runTransaction')return async callback=>{
      if(!injected){injected=true;
        const path='/v1/projects/'+project+'/databases/(default)/documents/users/'+identity.uid+'/workspace/chunk-'+revision+'-00000';
        const response=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+path,{method:'PATCH',headers:{authorization:'Bearer '+clientToken(identity.uid),'content-type':'application/json'},body:JSON.stringify({fields:{revision:{stringValue:revision},index:{integerValue:'0'},data:{stringValue:'e30='}}})});
        assert.equal(response.status,200,'legacy write occurs before the barrier');
      }
      return object.runTransaction(callback);
    };
    const value=Reflect.get(object,key,object);return typeof value==='function'?value.bind(object):value;
  }});
  const result=await createPeriodService(delayedDb).execute(identity,{operation:'enroll',opId:id(),expectedRevision:revision,expectedGeneration:0});
  assert.notEqual(result.revision,revision);
  assert.equal((await root.collection('workspace').doc('meta').get()).data().chunkStorage,'period-generations-v1');
  const closed=await service.execute(identity,{operation:'close',opId:id(),expectedRevision:result.revision,expectedGeneration:1,workspaceId:'default',through:'2026-10-31',reason:'QA adopt'});
  assert.equal(closed.generation,2);
});
test('actual browser transport stages through owner rules, honors closed history, and recovers after reopen',async()=>{
  const isolatedAccount=await isolated(),identity=isolatedAccount.identity,uid=identity.uid,root=isolatedAccount.root;
  const closed=await service.execute(identity,{operation:'close',opId:id(),expectedRevision:isolatedAccount.revision,expectedGeneration:1,workspaceId:'default',through:'2026-10-31',reason:'QA browser close'});
  const host='http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/'+project+'/databases/(default)/documents';
  const encode=v=>v===null?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,value])=>[k,encode(value)]))}};
  const decode=v=>'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'nullValue'in v?null:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'timestampValue'in v?v.timestampValue:Object.fromEntries(Object.entries(v.mapValue?.fields||{}).map(([k,value])=>[k,decode(value)]));
  const headers={authorization:'Bearer '+clientToken(uid),'content-type':'application/json'};
  const ref=path=>({path,collection:name=>collection(path+'/'+name),get:async()=>{const res=await fetch(host+'/'+path,{headers});if(res.status===404)return{exists:false,data:()=>undefined};assert.equal(res.status,200,await res.clone().text());const value=await res.json();return{exists:true,data:()=>Object.fromEntries(Object.entries(value.fields).map(([k,v])=>[k,decode(v)]))};}});
  const collection=path=>({doc:name=>ref(path+'/'+name),orderBy:()=>query(path)});
  const query=(path,after='',limit=100)=>({startAfter:value=>query(path,value,limit),limit:value=>query(path,after,value),get:async()=>{
    const split=path.lastIndexOf('/'),parent=path.slice(0,split),name=path.slice(split+1);
    const structuredQuery={from:[{collectionId:name}],orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit,...(after?{startAt:{values:[{referenceValue:'projects/'+project+'/databases/(default)/documents/'+path+'/'+after}],before:false}}:{})};
    const response=await fetch(host+'/'+parent+':runQuery',{method:'POST',headers,body:JSON.stringify({structuredQuery})});assert.equal(response.status,200,await response.clone().text());
    return{docs:(await response.json()).filter(row=>row.document).map(row=>({id:row.document.name.split('/').at(-1),data:()=>Object.fromEntries(Object.entries(row.document.fields).map(([k,v])=>[k,decode(v)]))}))};
  }});
  const firestore=()=>({collection,batch(){const writes=[];return{set:(r,v)=>writes.push({update:{name:'projects/'+project+'/databases/(default)/documents/'+r.path,fields:encode(v).mapValue.fields},currentDocument:{exists:false}}),commit:async()=>{const response=await fetch(host+':commit',{method:'POST',headers,body:JSON.stringify({writes})});assert.equal(response.status,200,await response.text());}};},runTransaction:()=>{throw Error('Client legacy publication forbidden');}});
  firestore.FieldPath={documentId:()=> '__name__'};
  let local=null,acks=0;
  const modules={'../lib/id.js':{isIsoDate},'../lib/defaults.js':{APP_SCHEMA_VERSION:21},'../storage/db.js':{cachePlainPeriodProtection:async()=>{},activeAccountStorageUid:()=>uid,acknowledgePlainWorkspace:async(_uid,_local,revision,sha)=>{acks++;local={...local,baseCloudRevision:revision,baseCloudSha256:sha};return true;},acknowledgeIdenticalPlainWorkspace:async()=>true},'./firebase.js':{currentCloudUser:()=>({uid}),currentCloudIdToken:async()=>clientToken(uid)},'../lib/backup.js':{assertRestorableBackupVault:()=>{}}};
  const context={exports:{},require:name=>modules[name],firebase:{firestore},crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Date,Promise,btoa,atob,AbortController,setTimeout,clearTimeout,navigator:{onLine:true},fetch:async(url,options)=>{assert.equal(url,'/api/workspace-commit');try{const result=await service.execute(identity,JSON.parse(options.body));return{ok:true,status:200,json:async()=>result};}catch(error){return{ok:false,status:error.status,json:async()=>({code:error.code})};}}};
  const code=ts.transpileModule(await readFile(new URL('../src/cloud/plain-workspace.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,context);const api=context.exports;
  const downloaded=await api.downloadPlainCloudWorkspace(uid);assert.equal(downloaded.payload.documents[0].id,'invoice');
  local={id:'workspace-v2',uid,payload:structuredClone(downloaded.payload),schemaVersion:21,localRevision:id(),updatedAt:new Date().toISOString(),baseCloudRevision:downloaded.meta.revision,baseCloudSha256:downloaded.meta.sha256};
  local.payload.expenses.push({id:'open-period',workspaceId:'default',branchId:'main',date:'2026-11-01',category:'other',description:'QA browser November',amount:'5',currency:'USD',supplierId:'',reference:'',notes:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  assert.equal(await api.uploadPlainCloudWorkspace(uid,local),'pushed');assert.equal(acks,1);
  local.payload.documents[0].items[0].unitPrice='200';local.localRevision=id();const pending=JSON.stringify(local);
  await assert.rejects(api.uploadPlainCloudWorkspace(uid,local),/PERIOD_CHANGED/);assert.equal(JSON.stringify(local),pending);assert.equal(acks,1);
  const current=(await root.collection('accounting').doc('control').get()).data();
  await service.execute(identity,{operation:'reopen',opId:id(),expectedRevision:local.baseCloudRevision,expectedGeneration:current.generation,workspaceId:'default',reason:'QA browser correction'});
  assert.equal(await api.uploadPlainCloudWorkspace(uid,local),'pushed');assert.equal(acks,2);
  assert.equal((await root.collection('periodReports').doc(closed.reportId).get()).exists,true);
  assert.equal((await api.downloadPlainCloudWorkspace(uid)).payload.documents[0].items[0].unitPrice,'200');
  const latest=(await root.collection('accounting').doc('control').get()).data();
  const replacementReport=await service.execute(identity,{operation:'close',opId:id(),expectedRevision:local.baseCloudRevision,expectedGeneration:latest.generation,workspaceId:'default',through:'2026-10-31',reason:'QA replacement publication'});
  const archive=await api.getPeriodReportArchive(uid);await validatePeriodArchive(archive);
  assert.equal(archive.reports.length,2);assert.equal(archive.operations.length,6);
  assert.ok(archive.reports.some(r=>r.reportId===closed.reportId));assert.ok(archive.reports.some(r=>r.reportId===replacementReport.reportId));
  assert.equal(archive.reports.find(r=>r.reportId===closed.reportId).state.sources.documents[0].items[0].unitPrice,'100');
  assert.equal(archive.reports.find(r=>r.reportId===replacementReport.reportId).state.sources.documents[0].items[0].unitPrice,'200');
  const backupText=JSON.stringify({format:'LOUREX_WORKSPACE_EXPORT_V2',version:2,payload:base,periodArchive:archive});
  const restored=await readPlainBackup({size:Buffer.byteLength(backupText),text:async()=>backupText});
  local={...local,payload:restored,localRevision:id()};
  await assert.rejects(api.uploadPlainCloudWorkspace(uid,local),/PERIOD_CHANGED/);
  assert.equal((await api.downloadPlainCloudWorkspace(uid)).payload.documents[0].items[0].unitPrice,'200');
  for(const report of archive.reports)assert.equal((await root.collection('periodReports').doc(report.reportId).get()).data().sha256,report.sha256);


});
test.after(async()=>{await db.terminate();await deleteApp(app);});
