import test from 'node:test';
import assert from 'node:assert/strict';
import {issuanceBoundary,assertProductionSale,fiscalBase} from '../api/_fiscal/issuance-boundary.js';
const s={environment:'production',accountUid:'a',workspaceId:'w',egsId:'e'},pin='a'.repeat(64);
const u={...s,state:'active',branchId:'b',operationalCredentialRef:'op',certificateDigest:pin,unit:{functionalityMap:'1100'}};
const doc={kind:'invoice',role:'standard',invoiceMode:'tax',currency:'SAR',branchId:'b'},r={invoiceType:'standard',taxCategory:'S',taxRate:'15'};
test('default simulation service cannot access production and production needs authority and SDK pin',async()=>{
 const b=issuanceBoundary({});assert.throws(()=>b.base(s));assert.throws(()=>issuanceBoundary({}, {productionAuthority:{readUnit:async()=>u}}));
 const p=issuanceBoundary({}, {productionAuthority:{readUnit:async()=>u},sdkInstallationManifestSha256:pin});
 assert.equal(fiscalBase(s),'fiscalProductionV1/a/workspaces/w');
 assert.throws(()=>p.base({...s,environment:'simulation'}));assert.equal((await p.read({},s)).unit.active,true);
});
test('inactive or cross-company issuance unit cannot enter production ledger',async()=>{
 for(const bad of [{...u,state:'enrolling'},{...u,workspaceId:'other'},{...u,certificateDigest:'bad'}]){
 const p=issuanceBoundary({}, {productionAuthority:{readUnit:async()=>bad},sdkInstallationManifestSha256:pin});await assert.rejects(p.read({},s));
 }
});
test('unsupported documents and unregistered branch or invoice type fail before external operation',()=>{
 assert.doesNotThrow(()=>assertProductionSale(s,doc,r,u));
 for(const patch of [{invoiceMode:'ordinary'},{currency:'USD'},{role:'credit-note'},{branchId:'other'}])assert.throws(()=>assertProductionSale(s,{...doc,...patch},r,u));
 assert.throws(()=>assertProductionSale(s,doc,{...r,scenario:{}},u));
 assert.throws(()=>assertProductionSale(s,doc,r,{...u,unit:{functionalityMap:'0100'}}));
});
