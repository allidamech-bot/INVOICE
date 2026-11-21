#!/usr/bin/env node
// LOUREX offline-only AWS fiscal worker readiness audit.
// NO Google/AWS/ZATCA traffic, no service activation, no writes and no secrets read.
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,accessSync,constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateAwsFiscalWorkerConfig} from '../../api/_fiscal/aws-worker-configuration.js';
import {validateAwsTrustedRuntimeProfile,readVerifiedAwsTrustFile} from '../../api/_fiscal/aws-trusted-runtime-profile.js';

const BASE='/opt/lourex-fiscal/current';
const CFG='/etc/lourex-staging/worker.json';
const TRUST='/etc/lourex-staging/trusted-runtime-profile.json';
const REQUIRED=['package.json','api/_fiscal/staging-runtime.js','scripts/fiscal/run-aws-staging-worker.mjs','node_modules/firebase-admin/package.json'];
const deny=code=>{throw Error('FISCAL_OFFLINE_PREFLIGHT_'+code);};
function readRootConfig(path,max){
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==0||
    (st.mode&0o022)!==0||st.size<1||st.size>max)deny('PROTECTED_CONFIGURATION');
 const bytes=readFileSync(path);
 if(bytes.length!==st.size)deny('PROTECTED_CONFIGURATION');
 return bytes;
}
export function auditAwsFiscalWorkerLocal({
 fsRoot=BASE,workerConfig=CFG,trustProfile=TRUST,processUser=process.getuid?.(),
 readTrustFile=readVerifiedAwsTrustFile,
}={}){
 // Running this as ubuntu would reproduce the original false-positive:
 // files must be readable by the actual restricted worker account.
 if(fsRoot!==BASE||workerConfig!==CFG||trustProfile!==TRUST||
    processUser===0||!Number.isSafeInteger(processUser))deny('RESTRICTED_USER_REQUIRED');
 const login=execFileSync('/usr/bin/id',['-un'],{encoding:'utf8',timeout:5000,maxBuffer:256}).trim();
 if(login!=='lourex-staging')deny('RESTRICTED_USER_REQUIRED');
 const node=execFileSync('/opt/lourex-fiscal/bin/node',['--version'],{encoding:'utf8',timeout:5000,maxBuffer:256}).trim();
 if(!/^v24\./.test(node))deny('SYSTEMD_NODE24_NOT_FOUND');
 const root=lstatSync(BASE);
 if(!root.isDirectory()||root.isSymbolicLink()||root.uid!==0||(root.mode&0o022)!==0)deny('IMMUTABLE_RELEASE_NOT_READY');
 for(const name of REQUIRED){
  const path=BASE+'/'+name;
  accessSync(path,constants.R_OK);
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.uid!==0||(stat.mode&0o022)!==0)deny('RELEASE_DEPENDENCY_NOT_READY');
 }
 const config=validateAwsFiscalWorkerConfig(JSON.parse(readRootConfig(CFG,16384).toString('utf8')));
 const profileBytes=readRootConfig(TRUST,131072);
 if(createHash('sha256').update(profileBytes).digest('hex')!==config.profileSha256)deny('TRUST_PROFILE_MISMATCH');
 const profile=validateAwsTrustedRuntimeProfile(JSON.parse(profileBytes.toString('utf8')),config.scopes);
 const refs=[
  profile.policy.document,
  {path:profile.sdk.manifestPath,sha256:profile.sdk.manifestSha256},
  ...profile.clearance.crls,
  ...profile.chains.flatMap(c=>[...c.certificates,...c.crls]),
 ];
 for(const ref of refs)readTrustFile(ref);
 for(const path of [profile.sdk.pythonExecutable,profile.keyStore.pythonExecutable,
   profile.sdk.installationRoot,profile.sdk.javaHome,profile.classPath]){
  accessSync(path,constants.R_OK);
 }
 // Never read/print secrets, request AWS/Google tokens or contact ZATCA.
 // Absence of dispatch authorization is desirable at this offline stage.
 if(process.env.LOUREX_AWS_DISPATCH_APPROVED)deny('UNEXPECTED_DISPATCH_AUTHORIZATION');
 return Object.freeze({offlineLocalReadiness:true,scopeCount:config.scopes.length,trustArtifacts:refs.length,dispatchEnabled:false});
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const result=auditAwsFiscalWorkerLocal();
  console.log('LOUREX AWS FISCAL LOCAL FILES VERIFIED');
  console.log('LOUREX FISCAL SCOPES VERIFIED: '+result.scopeCount);
  console.log('LOUREX FISCAL OFFLINE PREFLIGHT PASSED; DISPATCH DISABLED');
 }catch{
  console.error('LOUREX FISCAL OFFLINE PREFLIGHT NOT READY');
  process.exitCode=2;
 }
}
