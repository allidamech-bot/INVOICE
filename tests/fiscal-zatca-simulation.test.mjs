import test from 'node:test';
import assert from 'node:assert/strict';
import {createZatcaSimulationClient} from '../api/_fiscal/zatca-simulation.js';
import {requiredComplianceChecks,startOnboarding,recordComplianceCheck,assertReadyForProductionCsid} from '../api/_fiscal/onboarding.js';

const scope={accountUid:'qa-owner',workspaceId:'qa-company',egsId:'qa-egs'};
const b64=s=>Buffer.from(s).toString('base64');
const cert={...scope,environment:'simulation',kind:'compliance',requestId:123,binarySecurityToken:b64('synthetic-certificate'),secret:'synthetic-secret'};
const csid={requestID:123,dispositionMessage:'ISSUED',binarySecurityToken:cert.binarySecurityToken,secret:cert.secret,errors:null};
const prod={...cert,kind:'production'};
const payload={uuid:'11111111-1111-4111-8111-111111111111',invoiceHash:Buffer.alloc(32,1).toString('base64'),invoice:b64('<synthetic/>')};
const pass={validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}};
const reported={...pass,reportingStatus:'REPORTED'};
function harness(bodies=[]){
  const calls=[];
  const client=createZatcaSimulationClient({environment:'simulation',authorizedScope:scope,fetchImpl:async(url,options)=>{
    calls.push({url,...options,body:JSON.parse(options.body)});
    const [status,body]=bodies.shift()??[200,csid];
    return new Response(JSON.stringify(body),{status});
  }});
  return {client,calls};
}
function progress(credential=cert,map='1100'){
  return startOnboarding({functionalityMap:map,credentialRef:'cert-1',csrDigest:'a'.repeat(64),credential});
}
function mark(record,type,i,outcome='verified-pass'){
  return recordComplianceCheck(record,record.version,{type,outcome,responseDigest:'b'.repeat(64),artifactDigest:String(i+1).padStart(64,'0')});
}
function completed(credential=cert){
  return requiredComplianceChecks('1100').reduce((r,t,i)=>mark(r,t,i),progress(credential));
}
test('production transport cannot be activated',()=>{
  assert.throws(()=>createZatcaSimulationClient({environment:'production',authorizedScope:scope}),/PRODUCTION_DISABLED/);
});
test('compliance CSID request uses only fixed simulation path and allowlisted payload',async()=>{
  const {client,calls}=harness();
  assert.deepEqual(await client.requestCompliance({otp:'123456',csr:b64('synthetic CSR'),secret:'ignored'}),cert);
  assert.equal(calls[0].url,'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/compliance');
  assert.deepEqual(calls[0].body,{csr:b64('synthetic CSR')});
  assert.equal(calls[0].headers.OTP,'123456');assert.equal(calls[0].headers['Accept-Version'],'V2');assert.equal(calls[0].redirect,'error');
  await assert.rejects(client.requestCompliance({otp:'12345',csr:b64('CSR')}),/INVALID_OTP/);
  assert.equal(calls.length,1);
});
test('no credential travels across EGS, workspace, environment or certificate stage',async()=>{
  const {client,calls}=harness();
  for(const patch of [{workspaceId:'other'},{accountUid:'other'},{egsId:'other'},{environment:'production'},{kind:'compliance'}])
    await assert.rejects(client.submit({...prod,...patch},payload,'reporting'),/CREDENTIAL_SCOPE_MISMATCH/);
  assert.equal(calls.length,0);
});
test('onboarding requires all distinct document checks and refuses failed or stale sessions',()=>{
  assert.equal(requiredComplianceChecks('1000').length,3);assert.equal(requiredComplianceChecks('0100').length,3);
  assert.equal(requiredComplianceChecks('1100').length,6);assert.throws(()=>requiredComplianceChecks('0000'));
  const q=progress(), one=mark(q,'standard-invoice',0);
  assert.throws(()=>mark(one,'standard-invoice',1));
  assert.throws(()=>mark(one,'standard-credit',0));
  assert.throws(()=>recordComplianceCheck(one,1,{type:'standard-credit'}));
  assert.throws(()=>assertReadyForProductionCsid(one,cert));
  const failure=mark(q,'standard-invoice',0,'verified-fail');assert.equal(failure.state,'restart-required');
  assert.throws(()=>mark(failure,'standard-credit',1));
  assert.doesNotThrow(()=>assertReadyForProductionCsid(completed(),cert));
});
test('promotion requires exact completed onboarding binding and uses compliance basic authentication',async()=>{
  const {client,calls}=harness();
  await assert.rejects(client.requestProductionCsid(cert,progress()),/COMPLIANCE_NOT_COMPLETE/);
  await assert.rejects(client.requestProductionCsid(cert,completed({...cert,requestId:456})),/COMPLIANCE_BINDING_MISMATCH/);
  assert.equal(calls.length,0);
  assert.deepEqual(await client.requestProductionCsid(cert,completed()),prod);
  assert.equal(calls[0].url.endsWith('/simulation/production/csids'),true);
  assert.equal(calls[0].headers.Authorization,'Basic '+b64(cert.binarySecurityToken+':'+cert.secret));
  assert.deepEqual(calls[0].body,{compliance_request_id:'123'});
});
test('compliance and reporting responses remain distinct; payload is allowlisted',async()=>{
  const {client,calls}=harness([[200,reported],[202,{...reported,validationResults:{status:'WARNING',errorMessages:[],warningMessages:[{}]}}]]);
  const c=await client.checkCompliance(cert,{...payload,extra:'discard'},'reporting');assert.equal(c.status,'compliance-response');
  const r=await client.submit(prod,payload,'reporting');assert.equal(r.status,'reporting-response');assert.equal(r.warnings,true);
  assert.equal(calls[0].url.endsWith('/compliance/invoices'),true);
  assert.deepEqual(calls[0].body,payload);assert.equal(calls[1].url.endsWith('/invoices/reporting/single'),true);
});
test('clearance requires explicit accepted status and returned artifact; no 303 reroute',async()=>{
  const {client,calls}=harness([[200,{...pass,clearanceStatus:'CLEARED',clearedInvoice:b64('<cleared/>')}],[200,{...pass,clearanceStatus:'CLEARED'}],[303,{...pass,clearanceStatus:'NOT_CLEARED'}]]);
  const c=await client.submit(prod,payload,'clearance');assert.equal(c.status,'clearance-response');assert.equal(c.clearedBytes.toString(),'<cleared/>');
  assert.equal(calls[0].headers['Clearance-Status'],'1');
  assert.equal((await client.submit(prod,payload,'clearance')).status,'uncertain');
  assert.equal((await client.submit(prod,payload,'clearance')).status,'uncertain');assert.equal(calls.length,3);
});
test('errors or malformed successful response never become accepted',async()=>{
  const {client}=harness([[200,{reportingStatus:'REPORTED'}],[400,{...reported}],[200,{...reported,validationResults:{status:'PASS',errorMessages:[{}],warningMessages:[]}}]]);
  for(let i=0;i<3;i++)assert.equal((await client.submit(prod,payload,'reporting')).status,'uncertain');
});
test('transport error does not leak secrets or automatically retry',async()=>{
  let attempts=0;
  const client=createZatcaSimulationClient({environment:'simulation',authorizedScope:scope,fetchImpl:async()=>{attempts++;throw Error(cert.secret);}});
  await assert.rejects(client.submit(prod,payload,'reporting'),e=>e.message==='ZATCA_TRANSPORT_UNCERTAIN');
  assert.equal(attempts,1);
});
