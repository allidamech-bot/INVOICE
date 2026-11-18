import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSimulationOnboardingStore} from '../api/_fiscal/onboarding-store.js';
import {createSimulationEnrollment} from '../api/_fiscal/enrollment.js';
import {requiredComplianceChecks} from '../api/_fiscal/onboarding.js';
const scope={accountUid:'owner',workspaceId:'qa',egsId:'egs',environment:'simulation'};
const owner={uid:'owner',role:'owner'},cmd={workspaceId:'qa',egsId:'egs'};
const unit='fiscalPrivateV1/owner/workspaces/qa/egs/egs',base=unit.split('/egs/')[0],profile=unit+'/enrollment/approved',current=unit+'/onboarding/current';
const csr=Buffer.from('synthetic-csr'),sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(overrides={}){
 const rows=new Map([[base,{...scope,syntheticOnly:true}],[unit,{...scope,active:false}],[profile,{...scope,state:'approved',issuer:{accountUid:'owner',workspaceId:'qa',issuerCountry:'SA',saRegime:'phase-2',vatNumber:'300000000000003'},keyBinding:{...scope,keyVersion:'qa-signing-key',publicKeyDigest:'a'.repeat(64),protectionLevel:'HSM'},csr:csr.toString('base64'),csrDigest:sha(csr),functionalityMap:'1100'}]]);
 let tail=Promise.resolve(),seq=0;const calls=[],credentials=new Map();
 const db={doc:path=>({path}),runTransaction(fn){const job=tail.then(async()=>{const staged=new Map(structuredClone([...rows]));let wrote=false;const tx={async get(ref){assert.equal(wrote,false);return {exists:staged.has(ref.path),data:()=>structuredClone(staged.get(ref.path))};},create(ref,v){wrote=true;assert(!staged.has(ref.path));staged.set(ref.path,structuredClone(v));},update(ref,v){wrote=true;assert(staged.has(ref.path));staged.set(ref.path,{...staged.get(ref.path),...structuredClone(v)});}};const out=await fn(tx);rows.clear();for(const [k,v] of staged)rows.set(k,v);return out;});tail=job.catch(()=>{});return job;}};
 const vault={async store(s,ref,c){assert(!credentials.has(ref));credentials.set(ref,structuredClone(c));rows.set(unit+'/simulationCredentials/'+ref,{...scope,ref,version:1,kind:c.kind});},async load(s,ref,kind){const c=credentials.get(ref);assert.equal(c.kind,kind);return structuredClone(c);}};
 const onboarding=createSimulationOnboardingStore({db,vault});
 const fetchImpl=async(url,options)=>{calls.push(url);assert.match(url,/\/simulation\//);assert.equal(options.redirect,'error');let r;if(url.endsWith('/compliance')){assert.equal(options.headers.OTP,'123456');r={dispositionMessage:'ISSUED',requestID:1,binarySecurityToken:Buffer.from('compliance-cert').toString('base64'),secret:'secret-a'};}else if(url.endsWith('/production/csids')){r={dispositionMessage:'ISSUED',requestID:2,binarySecurityToken:Buffer.from('operational-cert').toString('base64'),secret:'secret-b'};}else{r={validationResults:{status:'PASS',errorMessages:[],warningMessages:[]},clearanceStatus:'CLEARED',reportingStatus:'REPORTED'};}return new Response(JSON.stringify(r),{status:200});};
 const service=createSimulationEnrollment({db,vault,onboarding,clock:()=> '2026-11-18T10:00:00.000Z',makeId:()=> 'attempt-'+(++seq),fetchImpl,verifyCsr:async()=>true,verifyCredential:async()=>true,buildComplianceInvoice:async({type})=>({type,mode:type.startsWith('standard-')?'clearance':'reporting',verifiedByOfficialSdk:true,uuid:'11111111-1111-4111-8111-111111111111',invoiceHash:Buffer.alloc(32).toString('base64'),invoice:Buffer.from('xml-'+type).toString('base64')}),verifyComplianceResult:async()=> 'verified-pass',...overrides});
 const begin=()=>service.begin(owner,{...cmd,otp:'123456'});
 async function complete(){let r=await begin();for(const type of requiredComplianceChecks('1100')){r=await service.check(owner,{...cmd,expectedVersion:r.version});assert.equal(r.checks.at(-1).type,type);}return r;}
 return {service,rows,calls,begin,complete};
}
test('trusted enrollment composes all six compliance checks and operational CSID, no fake activation or secrets in result',async()=>{
 const f=fixture();const ready=await f.complete();assert.equal(ready.state,'checks-complete');assert.equal(ready.version,7);
 const end=await f.service.operational(owner,{...cmd,expectedVersion:7});assert.equal(end.state,'operational-recorded');assert.equal(end.version,9);
 assert.equal(f.calls.length,8);assert.equal(f.rows.get(unit).active,false);assert.doesNotMatch(JSON.stringify(end),/secret|credentialRef|binarySecurityToken/);
 assert.doesNotMatch(JSON.stringify([...f.rows]),/secret-a|secret-b|123456/);
});
test('concurrent or ambiguous compliance CSID initiation cannot repeat authority request',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.begin(),f.begin()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls.length,1);
 let calls=0;const g=fixture({fetchImpl:async()=>{calls++;throw Error('network');}});await assert.rejects(g.begin());await assert.rejects(g.begin(),/ATTEMPT_HELD/);assert.equal(calls,1);assert.equal(g.rows.get(unit+'/enrollmentAttempts/compliance-csid').state,'held');
});
test('unverified CSR or browser-supplied source cannot initiate enrollment',async()=>{
 const f=fixture({verifyCsr:async()=>false});await assert.rejects(f.begin(),/CSR_NOT_VERIFIED/);assert.equal(f.calls.length,0);
 const g=fixture();await assert.rejects(g.service.begin(owner,{...cmd,otp:'123456',csr:'injected'}));await assert.rejects(g.service.begin({...owner,role:'viewer'},{...cmd,otp:'123456'}));assert.equal(g.calls.length,0);
});
test('missing SDK evidence blocks compliance submission and incomplete checks block operational CSID',async()=>{
 const f=fixture({buildComplianceInvoice:async()=>({verifiedByOfficialSdk:false})});await f.begin();await assert.rejects(f.service.check(owner,{...cmd,expectedVersion:1}),/ARTIFACT_NOT_VERIFIED/);await assert.rejects(f.service.operational(owner,{...cmd,expectedVersion:1}));assert.equal(f.calls.length,1);
});
test('unresolved compliance result retains hold and cannot trigger another authority call',async()=>{
 const f=fixture({verifyComplianceResult:async()=>null});await f.begin();await assert.rejects(f.service.check(owner,{...cmd,expectedVersion:1}),/UNRESOLVED/);await assert.rejects(f.service.check(owner,{...cmd,expectedVersion:1}),/ATTEMPT_HELD/);assert.equal(f.calls.length,2);assert.equal(f.rows.get(current).version,1);
});
