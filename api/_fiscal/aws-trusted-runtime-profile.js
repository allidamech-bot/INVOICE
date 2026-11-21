import {createHash} from 'node:crypto';
import {openSync,readFileSync,fstatSync,lstatSync,closeSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {validateStagingServiceScopes} from './staging-service-supervisor.js';
import {AWS_FISCAL_QA_PROJECT} from './aws-worker-configuration.js';

// Reviewed adapter to the EXISTING fiscal runtime, not a new authority verifier.
const HEX=/^[a-f0-9]{64}$/;
const OID=/^[012](?:\.(?:0|[1-9][0-9]{0,9})){2,20}$/;
const PREFIXES=['/opt/lourex-fiscal/','/etc/lourex-staging/'];
const deny=()=>{throw Error('LOUREX_AWS_TRUST_PROFILE_DENIED');};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
const validPath=p=>typeof p==='string'&&PREFIXES.some(prefix=>p.startsWith(prefix))&&resolve(p)===p&&!p.split('/').includes('..')&&!p.includes('\0');
const fileRef=r=>exact(r,['path','sha256'])&&validPath(r.path)&&HEX.test(r.sha256);
const nonemptyList=(rows,limit,check)=>Array.isArray(rows)&&rows.length>0&&rows.length<=limit&&rows.every(check);
const validateKeyStore=p=>exact(p,['stateDir','configPath','pythonExecutable'])&&
 typeof p.stateDir==='string'&&p.stateDir.startsWith('/var/lib/lourex-staging/')&&resolve(p.stateDir)===p.stateDir&&
 !p.stateDir.startsWith('/var/lib/lourex-staging/tokens')&&p.configPath==='/etc/lourex-staging/softhsm2.conf'&&
 typeof p.pythonExecutable==='string'&&p.pythonExecutable.startsWith('/opt/lourex-fiscal/')&&resolve(p.pythonExecutable)===p.pythonExecutable;
const validateSdk=s=>exact(s,['pythonExecutable','installationRoot','manifestPath','manifestSha256','javaHome'])&&
 validPath(s.pythonExecutable)&&validPath(s.installationRoot)&&validPath(s.manifestPath)&&HEX.test(s.manifestSha256)&&
 typeof s.javaHome==='string'&&s.javaHome.startsWith('/usr/lib/jvm/')&&resolve(s.javaHome)===s.javaHome;
const validateTrust=t=>exact(t,['environment','rootDigest','egsPolicyOid'])&&t.environment==='simulation'&&HEX.test(t.rootDigest)&&OID.test(t.egsPolicyOid);
const validateClearance=c=>exact(c,['trust','crls','qrProfile'])&&
 exact(c.trust,['environment','rootDigest','authoritySignerDigests','policyOid','curve'])&&
 c.trust.environment==='simulation'&&c.trust.curve==='secp256k1'&&HEX.test(c.trust.rootDigest)&&OID.test(c.trust.policyOid)&&
 nonemptyList(c.trust.authoritySignerDigests,32,x=>typeof x==='string'&&HEX.test(x))&&
 nonemptyList(c.crls,7,fileRef)&&c.qrProfile==='canonical-sha256-der-spki-v1';

export function validateAwsTrustedRuntimeProfile(profile,scopes){
 try{
  const allowed=validateStagingServiceScopes(scopes);
  if(!exact(profile,['version','projectId','environment','keyStore','sdk','classPath','trust','policy','clearance','chains'])||
   profile.version!=='LOUREX_AWS_TRUST_PROFILE_V1'||profile.environment!=='simulation'||profile.projectId!==AWS_FISCAL_QA_PROJECT||
   !validateKeyStore(profile.keyStore)||!validateSdk(profile.sdk)||!validPath(profile.classPath)||!validateTrust(profile.trust)||
   !exact(profile.policy,['identifier','document'])||!/^https:\/\/(?:www\.)?zatca\.gov\.sa\/[A-Za-z0-9_./%-]+$/.test(profile.policy.identifier)||!fileRef(profile.policy.document)||
   !validateClearance(profile.clearance)||profile.clearance.trust.rootDigest!==profile.trust.rootDigest||
   !Array.isArray(profile.chains)||profile.chains.length>64)deny();
  const scopeKeys=new Set(allowed.map(s=>JSON.stringify([s.accountUid,s.workspaceId,s.egsId])));
  const seen=new Set();
  for(const row of profile.chains){
   if(!exact(row,['scope','leafDigest','certificates','crls'])||
    !HEX.test(row.leafDigest)||!nonemptyList(row.certificates,8,fileRef)||row.certificates.length<2||
    !Array.isArray(row.crls)||row.crls.length!==row.certificates.length-1||!row.crls.every(fileRef))deny();
   const s=validateStagingServiceScopes([row.scope])[0],k=JSON.stringify([s.accountUid,s.workspaceId,s.egsId]);
   if(!scopeKeys.has(k)||seen.has(k))deny();seen.add(k);
   if(row.certificates[0].sha256!==row.leafDigest||row.certificates.at(-1).sha256!==profile.trust.rootDigest)deny();
  }
  // The service polls every selected EGS. A missing certificate chain must
  // fail startup rather than leave that unit in an untestable partial state.
  if(seen.size!==scopeKeys.size)deny();
  return profile;
 }catch{deny();}
}

// Every approved trust artifact is root-owned and cannot be a symlink.
// This read is offline; it cannot generate credentials or fetch vendor trust.
export function readVerifiedAwsTrustFile(ref){
 if(!fileRef(ref))deny();
 const parts=ref.path.split('/').filter(Boolean);
 let prefix='';
 for(let i=0;i<parts.length;i++){
  prefix+='/'+parts[i];
  const st=lstatSync(prefix);
  if(st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)!==0)deny();
  if(i<parts.length-1&&!st.isDirectory())deny();
 }
 const fd=openSync(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.uid!==0||(st.mode&0o022)!==0||st.size<1||st.size>524288)deny();
  const bytes=readFileSync(fd);
  if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256)deny();
  return bytes;
 }finally{closeSync(fd);}
}
export function bindAwsTrustedRuntime({profile,scopes,readFile=readVerifiedAwsTrustFile,credentialsDirectory,createStagingFiscalRuntime,db}){
 validateAwsTrustedRuntimeProfile(profile,scopes);
 if(credentialsDirectory!=='/run/credentials/lourex-aws-staging.service'||
 typeof createStagingFiscalRuntime!=='function'||!db||typeof readFile!=='function')deny();
 const load=ref=>{
  const bytes=readFile(ref);
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>524288||createHash('sha256').update(bytes).digest('hex')!==ref.sha256)deny();
  return bytes;
 };
 // Material is pinned BEFORE any cycle; never trust authority response XML
 // or browser input as a replacement for independently authorized PKIX roots.
 const policyBytes=load(profile.policy.document);
 load({path:profile.sdk.manifestPath,sha256:profile.sdk.manifestSha256});
 const crls=profile.clearance.crls.map(load);
 const chains=new Map();
 for(const row of profile.chains){
  const key=JSON.stringify([row.scope.accountUid,row.scope.workspaceId,row.scope.egsId]);
  const chainDer=row.certificates.map(load),crlsDer=row.crls.map(load);
  chains.set(key,Object.freeze({leafDigest:row.leafDigest,chainDer,crlsDer}));
 }
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const loadCertificateChain=async ({scope,leafDer})=>{
  if(scope?.environment!=='simulation'||!Buffer.isBuffer(leafDer))deny();
  const key=JSON.stringify([scope.accountUid,scope.workspaceId,scope.egsId]);
  const chain=chains.get(key);
  if(!chain||digest(leafDer)!==chain.leafDigest||!chain.chainDer[0].equals(leafDer))deny();
  return {identityVerified:true,chainDer:chain.chainDer.map(b=>Buffer.from(b)),crlsDer:chain.crlsDer.map(b=>Buffer.from(b))};
 };
 const policy={identifier:profile.policy.identifier,sha256:profile.policy.document.sha256,documentBytes:policyBytes};
 const options={db,projectId:AWS_FISCAL_QA_PROJECT,
  keyStore:{...profile.keyStore,pinSecretPath:credentialsDirectory+'/pin-derivation-key'},
  secretPath:credentialsDirectory+'/wrapping-key',
  trust:profile.trust,loadCertificateChain,sdk:profile.sdk,classPath:profile.classPath,policy,
  clearance:{trust:profile.clearance.trust,crlsDer:crls,policy,qrProfile:profile.clearance.qrProfile}};
 const runtime=createStagingFiscalRuntime(options);
 if(typeof runtime?.cycle!=='function')deny();
 return runtime;
}
