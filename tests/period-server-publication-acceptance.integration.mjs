import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createPeriodService} from '../api/_accounting/period-store.js';
import {encodeWorkspace,decodeWorkspace} from '../api/_accounting/period-format.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';

// Hard guard: never use ADC, a live project, or a non-loopback Firestore host.
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local Firestore emulator required; live projects forbidden.');
const app=initializeApp({projectId:'demo-lourex-period'},'period-publication-'+Date.now());
const db=getFirestore(app),service=createPeriodService(db),id=()=>randomBytes(16).toString('hex');
function fixture(){
 const payload=emptyVault();
 payload.workspaces.push({...structuredClone(payload.workspaces[0]),id:'other'});
 payload.branches.push({...payload.branches[0],id:'east'},{...payload.branches[0],id:'other-main',workspaceId:'other'});
 payload.documents=[['main','default'],['east','default'],['other-main','other']].map(([branchId,workspaceId],i)=>{
  const doc=createBlankDocument('invoice','QA-PUBLICATION-'+i,payload.company);
  Object.assign(doc,{id:'invoice-'+i,status:'final',workspaceId,branchId,issueDate:'2026-10-01',currency:'USD'});
  doc.items[0].quantity='1';doc.items[0].unitPrice='100';return doc;
 });
 return payload;
}
async function account(){
 const identity={uid:'qa-period-publication-'+id(),role:'owner'},root=db.collection('users').doc(identity.uid),payload=fixture(),revision=id();
 const encoded=encodeWorkspace(payload,revision);
 for(const chunk of encoded.chunks)await root.collection('workspace').doc('chunk-'+revision+'-'+String(chunk.index).padStart(5,'0')).create(chunk);
 await root.collection('workspace').doc('meta').create(encoded.meta);
 const state=await service.execute(identity,{operation:'enroll',opId:id(),expectedRevision:revision,expectedGeneration:0});
 return{identity,root,payload,state};
}
const input=(f,operation,extra={})=>({operation,opId:id(),expectedRevision:f.state.revision,expectedGeneration:f.state.generation,...extra});
async function execute(f,command,using=service){const result=await using.execute(f.identity,command);f.state=result;return result;}
const close=f=>execute(f,input(f,'close',{workspaceId:'default',through:'2026-10-31',reason:'Synthetic acceptance close'}));
async function stage(f,opId,payload){const encoded=encodeWorkspace(payload,opId),ref=f.root.collection('periodStaging').doc(opId);await ref.create(encoded.meta);for(const chunk of encoded.chunks)await ref.collection('chunks').doc(String(chunk.index).padStart(5,'0')).create(chunk);}
async function authority(f){
 const values={};for(const name of ['workspace','accounting','periodOperations','periodReports','workspaceHistory']){
  const rows=await f.root.collection(name).get();
  // Unreferenced immutable chunks created before a losing transaction are
  // deliberately excluded: they are not published financial state or audit.
  values[name]=rows.docs.filter(d=>name!=='workspace'||d.id==='meta').map(d=>({id:d.id,data:d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
 }
 return JSON.stringify(values);
}
async function publishedPayload(f){const meta=(await f.root.collection('workspace').doc('meta').get()).data();const rows=await f.root.collection('periodGenerations').doc(meta.revision).collection('chunks').get();return decodeWorkspace(meta,rows.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index));}

test('server close protects both company branches while another company remains editable',async()=>{
 const f=await account(),closed=await close(f),report=f.root.collection('periodReports').doc(closed.reportId),originalReport=(await report.get()).data();
 const next=structuredClone(f.payload);next.documents[2].items[0].unitPrice='150';
 const command=input(f,'commit');await stage(f,command.opId,next);await execute(f,command);
 assert.equal((await publishedPayload(f)).documents[2].items[0].unitPrice,'150');
 for(const index of [0,1]){
  const changed=structuredClone(next);changed.documents[index].items[0].unitPrice='200';
  const rejected=input(f,'commit');await stage(f,rejected.opId,changed);const before=await authority(f);
  await assert.rejects(service.execute(f.identity,rejected),/PERIOD_CHANGED/);assert.equal(await authority(f),before,'closed branch rejection publishes nothing');
 }
 const moved=structuredClone(next);Object.assign(moved.documents[1],{workspaceId:'other',branchId:'other-main'});
 const rejected=input(f,'commit');await stage(f,rejected.opId,moved);const before=await authority(f);
 await assert.rejects(service.execute(f.identity,rejected),/PERIOD_CHANGED/);assert.equal(await authority(f),before);
 assert.deepEqual((await report.get()).data(),originalReport,'company and branch attempts preserve retained publication');
});

test('final transaction failure publishes neither close boundary, report metadata nor operation receipt; same ID retries once',async()=>{
 const f=await account(),command=input(f,'close',{workspaceId:'default',through:'2026-10-31',reason:'Synthetic transaction failure'}),before=await authority(f);
 let attempts=0;
 const faultDb=new Proxy(db,{get(target,key){if(key==='runTransaction')return async()=>{attempts++;throw Error('QA_BEFORE_PUBLICATION');};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(createPeriodService(faultDb).execute(f.identity,command),/QA_BEFORE_PUBLICATION/);
 assert.equal(attempts,1);assert.equal(await authority(f),before);
 const saved=await execute(f,command);assert.deepEqual(await service.execute(f.identity,command),saved);
 assert.equal((await f.root.collection('periodReports').get()).size,1);
 assert.equal((await f.root.collection('periodOperations').get()).size,2,'only enrollment and successful close');
 assert.equal(saved.generation,2);
});

test('commit receipt recovers a lost response after another operation without duplicating financial history',async()=>{
 const f=await account(),next=structuredClone(f.payload);next.documents[2].items[0].unitPrice='175';
 const command=input(f,'commit');await stage(f,command.opId,next);const saved=await execute(f,command);
 // The caller loses this successful response; another device then closes.
 await close(f);const before=await authority(f);
 assert.deepEqual(await service.execute(f.identity,command),saved);
 assert.equal(await authority(f),before,'replay cannot advance generation or append a second history row');
 assert.equal((await publishedPayload(f)).documents[2].items[0].unitPrice,'175');
 await assert.rejects(service.execute(f.identity,{...command,expectedGeneration:command.expectedGeneration+1}),/OPERATION_REUSED/);
 assert.equal(await authority(f),before);
});

test('another UID cannot consume staged bytes or a receipt belonging to the first account',async()=>{
 const first=await account(),second=await account(),command=input(first,'commit');await stage(first,command.opId,first.payload);
 const firstBefore=await authority(first),secondBefore=await authority(second);
 const otherCommand={...command,expectedRevision:second.state.revision,expectedGeneration:second.state.generation};
 await assert.rejects(service.execute(second.identity,otherCommand),/INVALID_WORKSPACE_MANIFEST/);
 assert.equal(await authority(first),firstBefore);assert.equal(await authority(second),secondBefore);
 await execute(first,command);const publishedFirst=await authority(first);
 await assert.rejects(service.execute(second.identity,otherCommand),/INVALID_WORKSPACE_MANIFEST/);
 assert.equal(await authority(first),publishedFirst);assert.equal(await authority(second),secondBefore);
});

test('corrupt retained report blocks publication and the same staged request recovers after synthetic repair',async()=>{
 const f=await account(),closed=await close(f),report=f.root.collection('periodReports').doc(closed.reportId),reportBefore=(await report.get()).data(),chunks=await report.collection('chunks').get(),chunk=chunks.docs[0],original=chunk.data();
 // Deliberate corruption of this synthetic emulator account only.
 await chunk.ref.set({...original,data:'e30='});
 const next=structuredClone(f.payload);next.documents[2].items[0].unitPrice='180';
 const command=input(f,'commit');await stage(f,command.opId,next);const before=await authority(f);
 await assert.rejects(service.execute(f.identity,command),/INVALID_WORKSPACE_CHUNKS|WORKSPACE_HASH_MISMATCH/);
 assert.equal(await authority(f),before);
 await chunk.ref.set(original);const saved=await execute(f,command),after=await authority(f);
 assert.deepEqual(await service.execute(f.identity,command),saved);assert.equal(await authority(f),after);
 assert.equal((await publishedPayload(f)).documents[2].items[0].unitPrice,'180');
 assert.deepEqual((await report.get()).data(),reportBefore,'repair and retry retain the original report metadata');
});

test('unknown company and caller-supplied branch cannot mutate authoritative close state',async()=>{
 const f=await account(),before=await authority(f);
 await assert.rejects(service.execute(f.identity,input(f,'close',{workspaceId:'missing',through:'2026-10-31',reason:'Synthetic unknown company'})),/INVALID_PERIOD_SOURCE/);
 await assert.rejects(service.execute(f.identity,input(f,'close',{workspaceId:'default',branchId:'main',through:'2026-10-31',reason:'Synthetic branch injection'})),/INVALID_COMMAND/);
 assert.equal(await authority(f),before);
});

test('lost server period control blocks silent re-enrollment, false unenrolled status and cached success',async()=>{
 const f=await account();
 const closeCommand=input(f,'close',{workspaceId:'default',through:'2026-10-31',reason:'Synthetic historical close'});
 const closed=await execute(f,closeCommand);
 const originalReport=(await f.root.collection('periodReports').doc(closed.reportId).get()).data();
 // Emulate catastrophic loss in a brand-new demo Firebase emulator UID ONLY.
 await f.root.collection('accounting').doc('control').delete();
 const before=await authority(f);
 const inspect={operation:'inspect',opId:id(),expectedRevision:f.state.revision,expectedGeneration:f.state.generation};
 const enroll={operation:'enroll',opId:id(),expectedRevision:f.state.revision,expectedGeneration:0};
 for(const command of [inspect,enroll,closeCommand]){
  await assert.rejects(service.execute(f.identity,command),/PERIOD_AUTHORITY_MISSING/,
   'the server must not claim a clean account or replay a success after losing control');
  assert.equal(await authority(f),before,'failed recovery must not publish or mutate financial history');
 }
 assert.deepEqual((await f.root.collection('periodReports').doc(closed.reportId).get()).data(),originalReport);
});

test('retained immutable report alone blocks reset even if both control and operation receipts are lost',async()=>{
 const f=await account(),closed=await close(f);
 const report=(await f.root.collection('periodReports').doc(closed.reportId).get()).data();
 await f.root.collection('accounting').doc('control').delete();
 // A second isolated catastrophe removes operation metadata, but not the report.
 const operations=await f.root.collection('periodOperations').get();
 for(const operation of operations.docs)await operation.ref.delete();
 const before=await authority(f);
 await assert.rejects(service.execute(f.identity,{
  operation:'inspect',opId:id(),expectedRevision:f.state.revision,expectedGeneration:f.state.generation
 }),/PERIOD_AUTHORITY_MISSING/);
 await assert.rejects(service.execute(f.identity,{
  operation:'enroll',opId:id(),expectedRevision:f.state.revision,expectedGeneration:0
 }),/PERIOD_AUTHORITY_MISSING/);
 assert.equal(await authority(f),before,'no new authority or financial changes after loss');
 assert.deepEqual((await f.root.collection('periodReports').doc(closed.reportId).get()).data(),report);
});


test('authoritative generation marker blocks false fresh enrollment when control, receipts and reports are all missing',async()=>{
 const f=await account();
 const manifestBefore=(await f.root.collection('workspace').doc('meta').get()).data();
 assert.equal(manifestBefore.chunkStorage,'period-generations-v1',
   'server-owned manifest survives a completed enrollment');
 const originalRevision=manifestBefore.revision;
 // Deliberate catastrophic loss of control and receipts in a demo UID ONLY.
 await f.root.collection('accounting').doc('control').delete();
 const operations=await f.root.collection('periodOperations').get();
 for(const op of operations.docs)await op.ref.delete();
 assert.equal((await f.root.collection('periodReports').get()).empty,true);
 assert.equal((await f.root.collection('periodOperations').get()).empty,true);
 const before=await authority(f);
 const inspect={operation:'inspect',opId:id(),expectedRevision:originalRevision,expectedGeneration:1};
 const reset={operation:'enroll',opId:id(),expectedRevision:originalRevision,expectedGeneration:0};
 for(const command of [inspect,reset]){
  await assert.rejects(service.execute(f.identity,command),/PERIOD_AUTHORITY_MISSING/,
    'a trusted generation marker must never be interpreted as a pristine legacy account');
  assert.equal(await authority(f),before,'failed reset must preserve every financial snapshot');
 }
 const manifestAfter=(await f.root.collection('workspace').doc('meta').get()).data();
 assert.equal(manifestAfter.revision,originalRevision);
 assert.equal(manifestAfter.chunkStorage,'period-generations-v1');
});

test.after(async()=>{await db.terminate();await deleteApp(app);});
