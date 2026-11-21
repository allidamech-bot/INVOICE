import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createZatcaSimulationClient} from '../api/_fiscal/zatca-simulation.js';
import {requiredComplianceChecks,startOnboarding,recordComplianceCheck,assertReadyForProductionCsid} from '../api/_fiscal/onboarding.js';
import {verifiedComplianceReceipt} from '../api/_fiscal/production-compliance-input.js';

// This is a deterministic, OFFLINE simulated-authority transport contract.
// Never mistake these fabricated responses for ZATCA Simulation/Production
// acceptance, actual official SDK proof or protected-key signature evidence.
const b64=s=>Buffer.from(s).toString('base64');
const hash=s=>createHash('sha256').update(s).digest('hex');
const validations={validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}};
const host='https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/';
function company(label,number){
 const scope={environment:'simulation',accountUid:'synthetic-owner-'+label,workspaceId:'synthetic-company-'+label,egsId:'synthetic-egs-'+label};
 const ccBody={requestID:number,dispositionMessage:'ISSUED',binarySecurityToken:b64('synthetic-compliance-'+label),secret:'synthetic-compliance-secret-'+label,errors:null};
 const operationalBody={...ccBody,requestID:number+10,binarySecurityToken:b64('synthetic-operational-'+label),secret:'synthetic-operational-secret-'+label};
 const calls=[];
 let checkCount=0;
 const fetchImpl=async(url,request)=>{
  assert(url.startsWith(host),'QA must never contact the production/developer portal endpoint');
  assert.equal(request.method,'POST');assert.equal(request.redirect,'error');
  assert.equal(request.headers['Accept-Version'],'V2');
  const route=url.slice(host.length),body=JSON.parse(request.body);
  calls.push({route,headers:request.headers,body});
  if(route==='compliance'){
   assert.deepEqual(Object.keys(body),['csr']);
   assert.equal(request.headers.OTP,'123456');
   assert.equal(body.csr,b64('isolated CSR '+label));
   return new Response(JSON.stringify(ccBody),{status:201});
  }
  if(route==='compliance/invoices'){
   assert.equal(request.headers.Authorization,'Basic '+b64(ccBody.binarySecurityToken+':'+ccBody.secret));
   assert.deepEqual(Object.keys(body).sort(),['invoice','invoiceHash','uuid']);
   checkCount++;
   const mode=checkCount<=3?'clearance':'reporting';
   return new Response(JSON.stringify({...validations,...(mode==='clearance'?{clearanceStatus:'CLEARED'}:{reportingStatus:'REPORTED'})}),{status:200});
  }
  if(route==='production/csids'){
   assert.equal(checkCount,6);
   assert.equal(request.headers.Authorization,'Basic '+b64(ccBody.binarySecurityToken+':'+ccBody.secret));
   assert.deepEqual(body,{compliance_request_id:String(number)});
   return new Response(JSON.stringify(operationalBody),{status:200});
  }
  if(route==='invoices/clearance/single'){
   assert.equal(request.headers.Authorization,'Basic '+b64(operationalBody.binarySecurityToken+':'+operationalBody.secret));
   assert.equal(request.headers['Clearance-Status'],'1');
   return new Response(JSON.stringify({...validations,clearanceStatus:'CLEARED',clearedInvoice:b64('<synthetic-cleared invoice="'+label+'"/>')}),{status:200});
  }
  if(route==='invoices/reporting/single'){
   assert.equal(request.headers.Authorization,'Basic '+b64(operationalBody.binarySecurityToken+':'+operationalBody.secret));
   return new Response(JSON.stringify({...validations,reportingStatus:'REPORTED'}),{status:202});
  }
  throw Error('Unexpected mock route '+route);
 };
 const client=createZatcaSimulationClient({environment:'simulation',authorizedScope:scope,fetchImpl});
 return {client,scope,calls,ccBody,operationalBody};
}
function invoice(label,n){
 const uuid='00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 return {uuid,invoiceHash:Buffer.alloc(32,n).toString('base64'),invoice:b64('<synthetic tenant="'+label+'" index="'+n+'"/>')};
}
async function complete(env){
 const {client,scope}=env,cc=await client.requestCompliance({otp:'123456',csr:b64('isolated CSR '+scope.accountUid.split('-').at(-1))});
 assert.equal(cc.environment,'simulation');
 assert.equal(cc.accountUid,scope.accountUid);
 let progress=startOnboarding({functionalityMap:'1100',credentialRef:'qa-'+scope.egsId,csrDigest:hash('isolated CSR '+scope.accountUid),credential:cc});
 const all=requiredComplianceChecks('1100');assert.equal(all.length,6);
 for(let i=0;i<all.length;i++){
  const type=all[i],mode=type.startsWith('standard')?'clearance':'reporting',payload=invoice(scope.accountUid,i+1);
  const evidence=await client.checkCompliance(cc,payload,mode);
  assert.equal(evidence.status,'compliance-response');
  assert.equal(verifiedComplianceReceipt({mode,httpStatus:evidence.httpStatus,bytes:evidence.evidenceBytes,evidenceDigest:evidence.evidenceDigest}),'verified-pass');
  progress=recordComplianceCheck(progress,progress.version,{type,responseDigest:evidence.evidenceDigest,artifactDigest:hash(Buffer.from(payload.invoice,'base64')),outcome:'verified-pass'});
 }
 assert.equal(progress.state,'checks-complete');assert.equal(progress.checks.length,6);
 assertReadyForProductionCsid(progress,cc);
 const operational=await client.requestProductionCsid(cc,progress);
 assert.equal(operational.kind,'production');assert.equal(operational.workspaceId,scope.workspaceId);
 const standard=await client.submit(operational,invoice(scope.accountUid,7),'clearance');
 assert.equal(standard.status,'clearance-response');assert(standard.clearedBytes.length>0);
 const simplified=await client.submit(operational,invoice(scope.accountUid,8),'reporting');
 assert.equal(simplified.status,'reporting-response');
 assert.deepEqual(env.calls.map(c=>c.route),[
  'compliance',...Array(6).fill('compliance/invoices'),
  'production/csids','invoices/clearance/single','invoices/reporting/single'
 ]);
 return {cc,operational};
}
test('two synthetic SaaS taxpayers complete six-check mock transport with distinct credentials',async()=>{
 const a=company('alpha',101),b=company('bravo',202);
 const aa=await complete(a),bb=await complete(b);
 assert.notEqual(aa.cc.binarySecurityToken,bb.cc.binarySecurityToken);
 assert.notEqual(aa.operational.secret,bb.operational.secret);
 assert(a.calls.every(x=>!JSON.stringify(x).includes('synthetic-compliance-secret-bravo')));
 assert(b.calls.every(x=>!JSON.stringify(x).includes('synthetic-compliance-secret-alpha')));
 const before=[a.calls.length,b.calls.length];
 await assert.rejects(a.client.submit(bb.operational,invoice('bravo',9),'reporting'),/CREDENTIAL_SCOPE_MISMATCH/);
 await assert.rejects(b.client.submit(aa.operational,invoice('alpha',9),'clearance'),/CREDENTIAL_SCOPE_MISMATCH/);
 await assert.rejects(a.client.checkCompliance(bb.cc,invoice('bravo',10),'reporting'),/CREDENTIAL_SCOPE_MISMATCH/);
 await assert.rejects(b.client.requestProductionCsid(aa.cc,{}),/CREDENTIAL_SCOPE_MISMATCH|COMPLIANCE_BINDING_MISMATCH/);
 assert.deepEqual([a.calls.length,b.calls.length],before,'cross-tenant attempts must fail before HTTP');
});
test('QA transport does not relabel a production-scoped EGS as a Simulation EGS',()=>{
 const scope={environment:'production',accountUid:'real-owner',workspaceId:'real-company',egsId:'real-egs'};
 assert.throws(()=>createZatcaSimulationClient({environment:'simulation',authorizedScope:scope,fetchImpl:()=>{throw Error('NETWORK_NOT_ALLOWED');}}),/SIMULATION_SCOPE_REQUIRED/);
 assert.throws(()=>createZatcaSimulationClient({environment:'production',authorizedScope:scope,fetchImpl:()=>{throw Error('NETWORK_NOT_ALLOWED');}}),/PRODUCTION_DISABLED/);
});
