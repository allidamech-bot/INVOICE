import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionIssuanceCommand,parseProductionIssuanceCommand} from '../api/_fiscal/production-issuance-command.js';
const owner={uid:'account',role:'owner'},base='fiscalProductionV1/account/workspaces/company';
const scope={environment:'production',accountUid:'account',workspaceId:'company',egsId:'unit'};
const doc={id:'invoice',workspaceId:'company',branchId:'branch',kind:'invoice',invoiceMode:'tax',revision:1,status:'draft'};
const unit={...scope,branchId:'branch',state:'active'};
const request=operation=>({operation:'issuance-'+operation,workspaceId:'company',documentId:'invoice',documentRevision:1});
function fixture({configured=true,documents=[doc],units=[unit],rows={}}={}){
 const calls=[],snap=value=>({exists:value!==undefined,data:()=>value});
 const db={doc:p=>p,collection:p=>({limit:()=>p}),runTransaction:async fn=>fn({get:async p=>p===base+'/egs'?{docs:units.map(u=>({id:u.egsId,data:()=>u}))}:snap(rows[p.slice(base.length+1)])})};
 const loadWorkspace=async(_tx,s)=>{assert.equal(s.accountUid,owner.uid);assert.equal(s.workspaceId,'company');return {documents,branches:[{id:'branch',workspaceId:'company',active:true}],sourceRevision:'revision-001',sourceSha256:'a'.repeat(64),periodGeneration:1};};
 const issue={...Object.fromEntries(['review','approve','prepare','submit','recover','reconcile','postSale'].map(k=>[k,async(...args)=>{calls.push([k,...args]);}])),responseStatus:async()=>({hasReceipt:true,recoveryAvailable:true}),output:{availability:async(_tx,_s,r)=>({xml:['cleared','reported'].includes(r.status),pdf:false}),read:async(...args)=>{calls.push(['download',...args]);return {environment:'production',documentId:doc.id,format:args[3]};}}};
 const execute=createProductionIssuanceCommand({db,loadWorkspace,issuance:configured?issue:undefined,authority:{readUnit:async(_tx,s)=>units.find(u=>u.egsId===s.egsId)}});
 return {execute,calls};
}
test('strict public command never accepts an issuer or EGS or arbitrary authority parameters',()=>{
 const r={...request('review'),invoiceType:'standard',supplyDate:'2026-11-20',paymentMeans:'10'};
 assert.deepEqual(parseProductionIssuanceCommand(r),r);
 for(const extra of [{egsId:'foreign'},{accountUid:'other'},{environment:'simulation'},{invoiceHash:'x'},{amount:'10'}])assert.throws(()=>parseProductionIssuanceCommand({...r,...extra}),/INVALID/);
 assert.throws(()=>parseProductionIssuanceCommand({...request('submit'),expectedVersion:0}),/INVALID/);
});
test('unconfigured runtime exposes no issuance capabilities and refuses every mutation',async()=>{
 const {execute,calls}=fixture({configured:false});
 const s=await execute(owner,request('document-status'));
 assert.equal(s.environment,'production');assert(Object.values(s.capabilities).every(v=>v===false));
 await assert.rejects(execute(owner,{...request('review'),invoiceType:'standard',supplyDate:'2026-11-20',paymentMeans:'10'}),/UNAVAILABLE/);
 assert.equal(calls.length,0);
});
test('authenticated branch derives one active EGS; ambiguous, inactive and foreign units fail closed',async()=>{
 const {execute,calls}=fixture();
 const r={...request('review'),invoiceType:'standard',supplyDate:'2026-11-20',paymentMeans:'10'};
 assert.equal((await execute(owner,request('document-status'))).capabilities.review,true);
 await execute(owner,r);assert.equal(calls[0][2].egsId,'unit');
 await assert.rejects(execute({...owner,role:'viewer'},r),/FORBIDDEN/);
 for(const units of [[unit,{...unit,egsId:'unit2'}],[{...unit,state:'enrolling'}],[{...unit,branchId:'other'}]])assert.equal((await fixture({units}).execute(owner,request('document-status'))).capabilities.review,false);
 await assert.rejects(fixture({units:[{...unit,accountUid:'other'}]}).execute(owner,request('document-status')),/FORBIDDEN/);
});
const intent={...scope,state:'approved',documentId:doc.id,documentRevision:1,sha256:'b'.repeat(64)};
const queued={...scope,documentId:doc.id,uuid:'uuid',snapshotDigest:intent.sha256,status:'queued',version:1};
test('immutable intent remains preparable after unrelated source change; queued issue is versioned',async()=>{
 const {execute,calls}=fixture({rows:{'issueIntents/invoice':intent}});
 assert.equal((await execute(owner,request('document-status'))).capabilities.preparation,true);
 await execute(owner,request('prepare'));assert.equal(calls[0][0],'prepare');
 const f=fixture({rows:{'issueIntents/invoice':intent,'issues/invoice':queued}});
 await assert.rejects(f.execute(owner,{...request('submit'),expectedVersion:2}),/SOURCE_CHANGED/);
 await f.execute(owner,{...request('submit'),expectedVersion:1});assert.equal(f.calls[0][0],'submit');
 await assert.rejects(f.execute(owner,request('post-sale')));
});
test('uncertain invoice exposes reconciliation, never resubmission; final output is verified and posting remains separate',async()=>{
 const uncertain=fixture({rows:{'issueIntents/invoice':intent,'issues/invoice':{...queued,status:'uncertain',version:3}}});
 const s=await uncertain.execute(owner,request('document-status'));
 assert.equal(s.capabilities.submission,false);assert.equal(s.capabilities.reconciliation,true);
 await assert.rejects(uncertain.execute(owner,{...request('submit'),expectedVersion:3}),/SOURCE_CHANGED/);
 await uncertain.execute(owner,{...request('reconcile'),expectedVersion:3});assert.equal(uncertain.calls[0][0],'reconcile');
 const accepted={...queued,status:'cleared',version:3,resultDigest:'c'.repeat(64)};
 const a=fixture({rows:{'issueIntents/invoice':intent,'issues/invoice':accepted}});
 assert.equal((await a.execute(owner,request('document-status'))).artifacts.xml,true);
 await a.execute(owner,request('post-sale'));assert.equal(a.calls[0][0],'postSale');
 const historical=fixture({documents:[{...doc,status:'final'}]});
 assert.equal((await historical.execute(owner,request('document-status'))).capabilities.review,false);
 const posting={...scope,sourceId:doc.id,sourceRevision:1,uuid:accepted.uuid,snapshotDigest:accepted.snapshotDigest,evidenceDigest:accepted.resultDigest,commercialPosted:true};
 const posted=fixture({documents:[{...doc,status:'final'}],rows:{'issueIntents/invoice':intent,'issues/invoice':accepted,'accountingEntries/sale-invoice':posting}});
 assert.equal((await posted.execute(owner,request('document-status'))).commercialPosted,true);
 await posted.execute(owner,{...request('download'),format:'xml'});assert.equal(posted.calls[0][0],'download');
});
