import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyDeveloperSandboxClearance} from '../api/_fiscal/developer-sandbox-clearance.js';

const input=Buffer.from('<Invoice><ID>synthetic</ID></Invoice>');
const stamped=Buffer.from('<Invoice><ID>synthetic</ID><Signature>fake</Signature></Invoice>');
const alternate=Buffer.from('<Invoice><ID>different</ID></Invoice>');
const canonicalize=b=>Buffer.from(b.toString('utf8').replace(/<Signature>[^<]*<\/Signature>/g,''));
const hash=createHash('sha256').update(input).digest('base64');
const request={uuid:'00000000-0000-4000-8000-000000000001',invoiceHash:hash,invoice:input.toString('base64')};
const body={clearanceStatus:'CLEARED',clearedInvoice:stamped.toString('base64'),validationResults:{status:'WARNING',errorMessages:[],warningMessages:[{code:'BR-KSA-TEST-1',message:'do not leak the full explanation'}]}};
function verify(patch={}){
 return verifyDeveloperSandboxClearance({httpStatus:202,body,request,canonicalize,...patch});
}
test('synthetic test clearance binds returned bytes to exact submitted canonical UBL and reports only warning codes',()=>{
 const result=verify();
 assert.equal(result.status,'DEVELOPER_CLEARED_ARTIFACT_MATCHED');
 assert.equal(result.warningCount,1);
 assert.deepEqual(result.warningCodes,['BR-KSA-TEST-1']);
 assert(!JSON.stringify(result).includes('do not leak'));
});
test('HTTP CLEARED flag never approves a changed or malformed invoice',()=>{
 for(const patch of [
  {body:{...body,clearedInvoice:alternate.toString('base64')}},
  {body:{...body,clearedInvoice:'a===abc'}},
  {body:{...body,clearanceStatus:'NOT_CLEARED'}},
  {body:{...body,validationResults:{...body.validationResults,errorMessages:[{code:'rejected'}]}}},
  {body:{...body,validationResults:{...body.validationResults,status:'ERROR'}}},
  {httpStatus:400},
  {request:{...request,invoiceHash:Buffer.alloc(32,2).toString('base64')}},
  {request:{...request,invoice:alternate.toString('base64')}},
  {canonicalize:()=>{throw Error('INVALID_XML')}},
 ])assert.throws(()=>verify(patch));
});
test('unexpected canonicalizer output is rejected and developer warning descriptions are not returned',()=>{
 for(const v of [null,undefined,'oops',Buffer.alloc(0),Buffer.alloc(524289)])assert.throws(()=>verify({canonicalize:()=>v}));
 const invalid={...body,validationResults:{...body.validationResults,warningMessages:[{code:'valid-1'},{code:'no space or tokens'},{errorCode:'warning:42'}]}};
 const r=verify({body:invalid});
 assert.equal(r.warningCount,3);
 assert.deepEqual(r.warningCodes,['valid-1','warning:42']);
});
