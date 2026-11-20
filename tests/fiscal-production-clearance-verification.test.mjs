import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProductionStandardClearanceVerifier,createStandardClearanceVerifier} from '../api/_fiscal/clearance-verifier.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const scope={environment:'production',accountUid:'owner',workspaceId:'one',egsId:'unit'};
const xml=Buffer.from('<Invoice>original</Invoice>'),cleared=Buffer.from('<Invoice>stamped</Invoice>');
const record={...scope,mode:'clearance',artifactDigest:sha(xml),uuid:'11111111-1111-4111-8111-111111111111',invoiceHash:Buffer.alloc(32).toString('base64')};
const evidenceBytes=Buffer.from(JSON.stringify({clearanceStatus:'CLEARED',clearedInvoice:cleared.toString('base64'),validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}}));
const result={status:'clearance-response',httpStatus:200,warnings:false,clearedBytes:cleared,evidenceBytes,evidenceDigest:sha(evidenceBytes)};
const args={scope,record,result,xml};
const adapters={verifyContent:async()=>true,verifyStamp:async()=>true,verifyQr:async()=>true};
test('production and simulation receipt verification are isolated',async()=>{
 const verify=createProductionStandardClearanceVerifier(adapters),qa=createStandardClearanceVerifier(adapters);
 assert.equal(await verify(args),true);
 assert.equal(await verify({...args,scope:{...scope,environment:'simulation'}}),false);
 assert.equal(await verify({...args,record:{...record,environment:'simulation'}}),false);
 assert.equal(await qa(args),false);
});
test('production requires all independent checks and exact authority bytes',async()=>{
 const verify=createProductionStandardClearanceVerifier(adapters);
 for(const k of Object.keys(adapters))assert.equal(await createProductionStandardClearanceVerifier({...adapters,[k]:async()=>false})(args),false);
 for(const changed of [{...args,xml:Buffer.from('changed')},{...args,scope:{...scope,workspaceId:'other'}},{...args,result:{...result,clearedBytes:Buffer.from('changed')}},{...args,result:{...result,evidenceDigest:'0'.repeat(64)}},{...args,result:{...result,httpStatus:400}},{...args,result:{...result,warnings:true}}])assert.equal(await verify(changed),false);
});
