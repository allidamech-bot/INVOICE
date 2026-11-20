import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionPeriodGuard} from '../api/_fiscal/production-period-guard.js';
const start={documents:[]},uid='owner',w='company';
const base='fiscalProductionV1/'+uid+'/workspaces/'+w;
const unit={environment:'production',accountUid:uid,workspaceId:w,egsId:'unit',state:'enrolling',issuer:{accountUid:uid,workspaceId:w,saRegime:'phase-2',effectiveFrom:'2026-01-01'}};
const doc={id:'inv',workspaceId:w,kind:'invoice',status:'final',issueDate:'2026-11-20',invoiceMode:'ordinary'};
function fixture({registered=true,locked=false}={}){
 const db={collection:path=>({limit:()=>({path,query:true})}),doc:path=>({path})};
 const tx={get:async ref=>ref.query?{docs:registered&&ref.path===base+'/egs'?[{id:'unit',data:()=>unit}]:[]}:{exists:locked&&ref.path===base+'/issueIntents/inv',data:()=>({state:'approved'})}};
 return (before,candidate,input={operation:'commit'})=>createProductionPeriodGuard(db)(tx,uid,before,candidate,input);
}
test('normal companies, historical documents and drafts are unaffected',async()=>{
 await fixture({registered:false})(start,{documents:[doc]});
 await fixture()(start,{documents:[{...doc,issueDate:'2025-12-31'}]});
 await fixture()(start,{documents:[{...doc,status:'draft'}]});
});
test('enrolled phase two company cannot bypass issuance by ordinary mode or moving a final record',async()=>{
 await assert.rejects(fixture()(start,{documents:[doc]}),/FISCAL_ISSUANCE_REQUIRED/);
 await assert.rejects(fixture()({documents:[doc]},{documents:[{...doc,workspaceId:'other'}]}),/FISCAL_ISSUANCE_REQUIRED/);
 await assert.rejects(fixture()({documents:[doc]},start),/FISCAL_ISSUANCE_REQUIRED/);
});
test('approved draft locked and fiscal period close held until authoritative reconciliation exists',async()=>{
 await assert.rejects(fixture({locked:true})({documents:[{...doc,status:'draft'}]},{documents:[{...doc,status:'draft',number:'changed'}]}),/FISCAL_DOCUMENT_LOCKED/);
 await assert.rejects(fixture()(start,start,{operation:'close',workspaceId:w,through:'2026-11-30'}),/FISCAL_PERIOD_RECONCILIATION_REQUIRED/);
 await fixture()(start,start,{operation:'close',workspaceId:w,through:'2025-12-31'});
});
