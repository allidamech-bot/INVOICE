import {createHash,X509Certificate,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isAbsolute,join} from 'node:path';
import {createStagingEnvelopeWrapper} from './staging-envelope.js';
import {createStagingKeyStore} from './staging-key-store.js';
import {createStagingCredentialVault} from './credential-vault.js';
import {createSimulationOnboardingStore} from './onboarding-store.js';
import {createStagingEnrollmentLifecycle} from './managed-enrollment.js';
import {createStagingSimulationEnrollment} from './enrollment.js';
import {createStagingProtectedSigningSession,createStagingComplianceSigningSession} from './protected-signing.js';
import {verifyAuthorityCertificate} from './authority-certificate.js';
import {createSdk4LocalValidator,normalizeSdk4Proof} from './sdk4-local-validator.js';
import {createCommercialFiscalPreparation} from './commercial-preparation.js';
import {createFiscalLedger} from './ledger.js';
import {createFiscalSimulationWorker} from './simulation-worker.js';
import {createFiscalReconciler} from './reconciliation.js';
import {readStagingContext,createStagingDispatchRequest,createStagingDispatchWorker} from './staging-dispatch.js';
import {simulationBase} from './simulation-scope.js';
import {readApprovedIntent} from './issue-intent.js';
import {readStoredSdkProof} from './sdk4-validation-evidence.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';
import {hashArtifact,hashCanonicalInvoice} from './fiscal-artifacts.js';
import {verifySdk4SimplifiedStamp,sdk4StampSigningTime,buildManagedSdk4SimplifiedStamp} from './sdk4-xades-candidate.js';
import {classifyStoredSubmissionResponse} from './zatca-simulation.js';
import {createOfflineStandardClearanceVerifier} from './standard-clearance-crypto.js';
import {makeComplianceInput,verifiedComplianceReceipt} from './production-compliance-input.js';
import {requiredComplianceChecks} from './onboarding.js';
import {buildFiscalCandidate} from './ubl-draft.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const HEX=/^[a-f0-9]{64}$/;
const data=s=>s.exists?s.data():null;
const need=(ok,code='FISCAL_STAGING_NOT_READY')=>{if(!ok)throw Error(code);};
const same=(a,b)=>a&&b&&['environment','accountUid','workspaceId','egsId'].every(k=>a[k]===b[k]);
const bindingMatches=(a,b)=>same(a,b)&&['keyVersion','publicKeyDigest','protectionLevel'].every(k=>a[k]===b[k]);
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const digest=v=>sha(JSON.stringify(canonical(v)));
export function createStagingCanonicalizer({javaHome,classPath}){
 need([javaHome,classPath].every(p=>typeof p==='string'&&isAbsolute(p)));
 return (bytes,mode)=>{
  need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=524288&&mode==='invoice');
  const r=spawnSync(join(javaHome,'bin/java'),['-cp',classPath,'CanonicalInvoice',mode],{input:bytes,timeout:15000,maxBuffer:1048576,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});
  need(!r.error&&r.status===0&&r.stdout.length>0);return r.stdout;
 };
}
// Private EC2 staging composition. No HTTP listener, no production mode, no
// mock certificate trust, no implicit provisioning from a browser request.
export function createStagingFiscalRuntime({db,projectId,keyStore,secretPath,trust,loadCertificateChain,sdk,classPath,policy,clearance,clock=()=>new Date().toISOString()}){
 need(typeof projectId==='string'&&/^[a-z][a-z0-9-]{0,18}-fiscal-qa$/.test(projectId)&&projectId!=='lourex-invoice'&&typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&trust?.environment==='simulation'&&HEX.test(trust.rootDigest??'')&&typeof trust.egsPolicyOid==='string'&&typeof loadCertificateChain==='function'&&policy&&clearance?.trust?.environment==='simulation');
 const context=(s,opts)=>db.runTransaction(tx=>readStagingContext(db,tx,s,opts));
 const authorizeBinding=async b=>{try{return bindingMatches((await context(b)).config.keyBinding,b);}catch{return false;}};
 const keys=createStagingKeyStore({...keyStore,authorizeBinding,authorizeProvision:async s=>{try{const {config,unit}=await context(s);return unit.active===false&&config.keyBinding===undefined;}catch{return false;}}});
 const vault=createStagingCredentialVault({db,...createStagingEnvelopeWrapper({secretPath}),authorizeScope:async(tx,c)=>{const {config}=await readStagingContext(db,tx,c);return !!config.keyBinding;}});
 const canonicalize=createStagingCanonicalizer({javaHome:sdk?.javaHome,classPath});
 const validate=createSdk4LocalValidator({...sdk,canonicalize});
 const verifyClearance=createOfflineStandardClearanceVerifier({...clearance,classPath,policy});
 const ledger=createFiscalLedger(db,{sdkInstallationManifestSha256:sdk.manifestSha256,requireStagingDispatch:true});
 const onboarding=createSimulationOnboardingStore({db,vault});
 async function certificate(s,p,c){
  need(same(s,p)&&same(s,c)&&['compliance','production'].includes(c.kind)&&await authorizeBinding(p.keyBinding));
  const leaf=new X509Certificate(Buffer.from(c.binarySecurityToken,'base64')),leafDigest=sha(leaf.raw);
  need(sha(leaf.publicKey.export({format:'der',type:'spki'}))===p.keyBinding.publicKeyDigest);
  const chain=await loadCertificateChain({scope:s,profile:p,credentialKind:c.kind,leafDer:Buffer.from(leaf.raw)});
  need(chain?.identityVerified===true&&Buffer.isBuffer(chain.chainDer?.[0])&&chain.chainDer[0].equals(leaf.raw));
  const at=clock();
  need(verifyAuthorityCertificate({environment:'simulation',chainDer:chain.chainDer,crlsDer:chain.crlsDer,trust:{environment:'simulation',rootDigest:trust.rootDigest,authoritySignerDigests:[leafDigest],policyOid:trust.egsPolicyOid,curve:'secp256k1'},signedAt:at,observedAt:at}));
  return {leafDigest,chainDer:chain.chainDer,crlsDer:chain.crlsDer};
 }
 async function session(s,p,c){
  const verified=await certificate(s,p,c);
  need(await keys.resolveSigner(s,p.keyBinding));
  const isCompliance=c.kind==='compliance';
  return (isCompliance?createStagingComplianceSigningSession:createStagingProtectedSigningSession)({scope:s,binding:p.keyBinding,credential:{...s,kind:isCompliance?'compliance':'operational',issuerVat:p.issuer.vatNumber,keyVersion:p.keyBinding.keyVersion,publicKeyDigest:p.keyBinding.publicKeyDigest,leafDigest:verified.leafDigest},chainDer:verified.chainDer,crlsDer:verified.crlsDer,trust,clock,authorizeBinding,stagingSignerOptions:keys.signingOptions(p.keyBinding)});
 }
 async function profile(s){
  const {config,unit}=await context(s);need(config.keyBinding);
  return {config,unit};
 }
 const lifecycle=createStagingEnrollmentLifecycle({db,vault,resolveSigner:keys.resolveSigner,resolveProtectedSession:async(s,issuer,binding,c)=>{
  const {config}=await profile(s);need(digest(issuer)===digest(config.issuer)&&bindingMatches(binding,config.keyBinding));return session(s,config,c);
 },clock});
 async function provision(s){
  const initial=await context(s);need(initial.unit.active===false);
  const ref=db.doc(initial.base+'/egs/'+s.egsId+'/enrollment/config');
  if(initial.config.keyBinding){await keys.resolveSigner(s,initial.config.keyBinding);return initial.config.keyBinding;}
  const binding=await keys.provision(s);
  return db.runTransaction(async tx=>{
   const {config,unit}=await readStagingContext(db,tx,s);need(unit.active===false);
   if(config.keyBinding){need(bindingMatches(config.keyBinding,binding));return config.keyBinding;}
   need(digest(config)===digest(initial.config));tx.update(ref,{keyBinding:binding});return binding;
  });
 }
 // The approved synthetic fixture and exact prior accepted candidates define
 // the compliance chain. Candidate XML is immutable across concurrent checks.
 async function complianceCandidate({scope:s,type,profile:p,credential}){
  const root=simulationBase(s)+'/egs/'+s.egsId,ref=db.doc(root+'/complianceCandidates/'+type);
  async function read(tx){
   const {config,unit}=await readStagingContext(db,tx,s);need(unit.active===false&&bindingMatches(config.keyBinding,p.keyBinding)&&digest(config.issuer)===digest(p.issuer)&&config.complianceSeller?.vatNumber===p.issuer.vatNumber&&config.complianceSeller?.name===p.issuer.legalName);
   const current=data(await tx.get(db.doc(root+'/onboarding/current'))),saved=data(await tx.get(ref));
   const required=requiredComplianceChecks(config.unit.functionalityMap);
   need(current?.state==='checking'&&same(current.binding,s)&&current.binding.requestId===credential.requestId&&current.binding.certificateDigest===sha(credential.binarySecurityToken)&&required[current.checks.length]===type&&current.checks.every(x=>x.outcome==='verified-pass'));
   const prior=[];
   for(const check of current.checks){
    const a=data(await tx.get(db.doc(root+'/complianceCandidates/'+check.type)));
    need(same(a,s)&&a.type===check.type&&a.artifactDigest===check.artifactDigest&&a.credentialRequestId===credential.requestId);
    prior.push(a);
   }
   return {config,current,required,prior,saved};
  }
  function existing(v,initial){
   need(same(v,s)&&v.type===type&&v.credentialRequestId===credential.requestId&&v.onboardingVersion===initial.current.version&&v.configDigest===digest(initial.config)&&typeof v.invoice==='string'&&v.invoice.length<=700000);
   const bytes=Buffer.from(v.invoice,'base64');
   need(bytes.toString('base64')===v.invoice&&sha(bytes)===v.artifactDigest&&hashCanonicalInvoice(canonicalize(bytes,'invoice'))===v.invoiceHash&&normalizeSdk4Proof(v.sdkProof,{uuid:v.uuid,mode:v.mode,artifactDigest:v.artifactDigest}).installationManifestSha256===sdk.manifestSha256&&v.sdkProof.kind===type&&v.verifiedByOfficialSdk===true);
   return v;
  }
  const initial=await db.runTransaction(read);if(initial.saved)return existing(initial.saved,initial);
  const invoice=makeComplianceInput({type,seller:initial.config.complianceSeller,testBuyer:initial.config.complianceBuyer,prior:initial.prior,required:initial.required,uuid:randomUUID(),at:clock()});
  const mode=invoice.mode==='standard'?'clearance':'reporting';
  let bytes=Buffer.from(buildFiscalCandidate(invoice).bytes);
  const invoiceHash=hashCanonicalInvoice(canonicalize(bytes,'invoice'));
  if(mode==='reporting'){
   const signed=await buildManagedSdk4SimplifiedStamp({unsigned:bytes,session:await session(s,initial.config,credential),policy,canonicalize});
   need(signed.invoiceHash===invoiceHash);bytes=Buffer.from(signed.bytes);
  }
  const artifactDigest=sha(bytes),sdkProof=normalizeSdk4Proof(await validate({scope:s,mode,invoice,bytes,invoiceHash}),{uuid:invoice.uuid,mode,artifactDigest});
  const candidate={...s,type,mode,uuid:invoice.uuid,icv:invoice.icv,number:invoice.number,issueDate:invoice.issueDate,invoiceHash,artifactDigest,invoice:bytes.toString('base64'),sdkProof,verifiedByOfficialSdk:true,onboardingVersion:initial.current.version,credentialRequestId:credential.requestId,configDigest:digest(initial.config)};
  return db.runTransaction(async tx=>{
   const current=await read(tx);need(current.current.version===initial.current.version&&digest(current.config)===digest(initial.config));
   if(current.saved)return existing(current.saved,current);
   tx.create(ref,candidate);return candidate;
  });
 }
 const commands=createStagingSimulationEnrollment({db,vault,onboarding,verifyCsr:lifecycle.verifyCsr,verifyCredential:async({scope,profile,credential})=>{await certificate(scope,profile,credential);return true;},buildComplianceInvoice:complianceCandidate,verifyComplianceResult:async({type,candidate,response})=>candidate.type===type&&response.status==='compliance-response'&&verifiedComplianceReceipt({mode:candidate.mode,httpStatus:response.httpStatus,bytes:response.evidenceBytes,evidenceDigest:response.evidenceDigest})==='verified-pass'?'verified-pass':null,clock});
 const enrollment=Object.freeze({...commands,begin:async(identity,command)=>{
  need(identity?.role==='owner'&&typeof command?.otp==='string'&&/^\d{6}$/.test(command.otp));
  const s={environment:'simulation',accountUid:identity.uid,workspaceId:command.workspaceId,egsId:command.egsId};
  await lifecycle.prepareCsr(s);return commands.begin(identity,command);
 }});
 async function active(s,issuer){
  const {config,unit}=await profile(s);need(unit.active===true&&typeof unit.operationalCredentialRef==='string'&&HEX.test(unit.certificateDigest??''));
  if(issuer)need(digest(issuer)===digest(config.issuer));
  const credential=await vault.load(s,unit.operationalCredentialRef,'production'),c=await certificate(s,config,credential);
  need(c.leafDigest===unit.certificateDigest);
  return {config,credential,certificate:c};
 }
 const resolveCredential=async s=>(await active(s)).credential;
 const resolveProtectedSession=async(s,issuer)=>{const {config,credential}=await active(s,issuer);return session(s,config,credential);};
 const prepareCommercial=createCommercialFiscalPreparation({db,ledger,canonicalize,validateOfficial:validate,resolveProtectedSession,policy,clock});
 const prepare=async(scope,documentId)=>{await active(scope);return prepareCommercial(scope,documentId);};
 async function verifyPrepared({scope:s,record,xml,snapshot,credential}){
  try{
   need(['submitting','uncertain'].includes(record.status)&&hashArtifact(xml)===record.artifactDigest&&hashArtifact(snapshot)===record.snapshotDigest&&same(credential,s)&&credential.kind==='production');
   const base=simulationBase(s),path=base+'/issues/'+record.documentId;
   const {config,certificate:c}=await active(s);
   const intent=await db.runTransaction(async tx=>{
    await readStagingContext(db,tx,s,{active:true});const saved=data(await tx.get(db.doc(path)));
    need(saved&&['accountUid','workspaceId','egsId','documentId','uuid','icv','previousInvoiceHash','invoiceHash','artifactDigest','snapshotDigest','generatedAt','mode','sdkValidationDigest','version','attemptId','status'].every(k=>saved[k]===record[k]));
    const i=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+record.documentId)),s,record.documentId);
    need(i.digest===record.snapshotDigest&&i.bytes.equals(snapshot)&&digest(i.payload.issuer)===digest(config.issuer));
    need(await readStoredSdkProof(db,tx,path,saved,sdk.manifestSha256));return i;
   });
   need(sha(new X509Certificate(Buffer.from(credential.binarySecurityToken,'base64')).raw)===c.leafDigest);
   const p=intent.payload,mapped=mapCommercialFiscalInvoice({scope:s,document:p.document,issuer:p.issuer,review:p.review,identity:{documentId:record.documentId,uuid:record.uuid,icv:record.icv,previousInvoiceHash:record.previousInvoiceHash,generatedAt:record.generatedAt}});
   const unsigned=Buffer.from(mapped.candidate.bytes);
   need(mapped.mode===record.mode&&hashCanonicalInvoice(canonicalize(unsigned,'invoice'))===record.invoiceHash&&hashCanonicalInvoice(canonicalize(xml,'invoice'))===record.invoiceHash);
   if(record.mode==='clearance')return xml.equals(unsigned);
   const at=sdk4StampSigningTime(xml),leaf=new X509Certificate(c.chainDer[0]);
   need(Date.parse(at)>=Date.parse(leaf.validFrom)&&Date.parse(at)<=Date.parse(leaf.validTo));
   return verifySdk4SimplifiedStamp({unsigned,bytes:xml,leafDer:leaf.raw,at,policy,canonicalize});
  }catch{return false;}
 }
 async function verifyAuthorityResult({scope,record,result,xml}){
  try{
   const version=record.status==='uncertain'?record.version-1:record.version,saved=await ledger.readResponse(scope,record.documentId,version,record.attemptId);
   need(saved.receipt&&saved.record.version===record.version&&saved.record.artifactDigest===record.artifactDigest&&saved.bytes.equals(result.evidenceBytes)&&saved.receipt.digest===result.evidenceDigest&&saved.receipt.httpStatus===result.httpStatus);
   const actual=classifyStoredSubmissionResponse({httpStatus:saved.receipt.httpStatus,bytes:saved.bytes,mode:record.mode});
   need(actual.status===(record.mode==='clearance'?'clearance-response':'reporting-response')&&actual.status===result.status&&actual.warnings===result.warnings&&actual.evidenceDigest===result.evidenceDigest);
   if(record.mode==='reporting')return true;
   need(actual.clearedBytes.equals(result.clearedBytes));return verifyClearance({scope,record,result:actual,xml});
  }catch{return false;}
 }
 const submit=createFiscalSimulationWorker({ledger,resolveCredential,verifyPrepared,verifyAuthorityResult,clock});
 const reconcile=createFiscalReconciler({ledger,resolveCredential,verifyPrepared,verifyAuthorityResult,clock});
 const enqueue=createStagingDispatchRequest({db,clock}),cycle=createStagingDispatchWorker({db,ledger,submit,reconcile,clock});
 return Object.freeze({provision,enrollment,activate:lifecycle.activate,prepare,enqueue,cycle,resolveProtectedSession,resolveCredential});
}
