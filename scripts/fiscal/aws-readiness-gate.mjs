// Read-only audit for the existing AWS ZATCA Simulation deployment.
// Never reads secret values, sends invoices, starts services, or approves release.
import {lstatSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const release='/opt/lourex-fiscal/current';
const cfg='/etc/lourex-staging';
const sha=/^[a-f0-9]{64}$/;
const ident=/^[A-Za-z0-9_-]{1,128}$/;
function stat(path){try{return lstatSync(path);}catch{return null;}}
function safeFile(path,max=131072){
  const s=stat(path);
  if(!s||!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.nlink!==1||(s.mode&0o022)||s.size<1||s.size>max)return null;
  try{return readFileSync(path);}catch{return null;}
}
function parse(path,max){try{const b=safeFile(path,max);return b?JSON.parse(b.toString('utf8')):null;}catch{return null;}}
function stopped(unit){
  const r=spawnSync('/usr/bin/systemctl',['is-active',unit],{timeout:3000,encoding:'utf8'});
  return !r.error&&r.stdout.trim()==='inactive';
}
export function fiscalAudit({base=cfg,releaseRoot=release,serviceStopped=stopped,read=safeFile,readJson=parse}={}){
  const checks={};
  const mark=(name,ok)=>{checks[name]=ok?'PASS':'BLOCKED';};
  const rel=read(releaseRoot+'/.lourex-fiscal-commit',100);
  mark('reviewedReleaseInstalled',rel?.toString('utf8').trim()==='de7947a5ffa9c3a56cbaf95835533d75b1cd4786');
  const sdk='/opt/lourex-fiscal/sdk4-R4.0.0';
  mark('sdkStaged',!!stat(sdk+'/Apps/fatoora')&&!!stat(sdk+'/Apps/zatca-einvoicing-sdk-238-R4.0.0.jar')&&!!stat(sdk+'/Configuration/config.json'));
  const py=spawnSync('/opt/lourex-fiscal/python-qa/bin/python3',['-I','-c','import PyKCS11, cryptography, defusedxml'],{timeout:5000,env:{PATH:'/usr/bin:/bin'}});
  mark('fiscalPython',!py.error&&py.status===0);
  mark('softHsmConfiguration',!!safeFile(base+'/softhsm2.conf',4096));
  const secretRoot=stat(base+'/secrets');
  const secretOk=secretRoot?.isDirectory()&&secretRoot.uid===0&&(secretRoot.mode&0o777)===0o700&&
    ['wrapping-key','pin-derivation-key'].every(x=>{const s=stat(base+'/secrets/'+x);return s?.isFile()&&s.uid===0&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size===32;});
  mark('credentialFilesProtected',!!secretOk);
  mark('qaAdcProtected',!!safeFile(base+'/aws-adc.json',16384));
  const worker=readJson(base+'/worker.json',16384);
  const scopes=worker?.scopes;
  const keys=['environment','accountUid','workspaceId','egsId'];
  const valid=Array.isArray(scopes)&&scopes.length>0&&scopes.length<=64&&scopes.every(s=>s&&Object.keys(s).sort().join(',')===keys.slice().sort().join(',')&&s.environment==='simulation'&&keys.slice(1).every(k=>ident.test(s[k]??'')))&&new Set(scopes.map(s=>keys.map(k=>s[k]).join('|'))).size===scopes.length;
  const qa=valid&&worker.projectId==='lourex-fiscal-qa'&&worker.serviceAccount==='lourex-aws-worker@lourex-fiscal-qa.iam.gserviceaccount.com'&&worker.adcPath===base+'/aws-adc.json'&&worker.audience==='//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging'&&sha.test(worker.profileSha256??'');
  mark('qaOnlyScopes',!!qa);
  const profileBytes=read(base+'/trusted-runtime-profile.json',131072);
  const profile=readJson(base+'/trusted-runtime-profile.json',131072);
  mark('pinnedSimulationProfile',!!(qa&&profileBytes&&profile?.environment==='simulation'&&profile.projectId==='lourex-fiscal-qa'&&profile.version==='LOUREX_AWS_TRUST_PROFILE_V1'&&createHash('sha256').update(profileBytes).digest('hex')===worker.profileSha256));
  mark('enrollmentStopped',serviceStopped('lourex-aws-enrollment.service'));
  mark('dispatchStopped',serviceStopped('lourex-aws-staging.service'));
  // External evidence cannot be supplied by local file existence or hashes.
  checks.sdkArchiveProvenance='UNVERIFIED';
  checks.officialSimulationCaCrlPolicy='UNVERIFIED';
  checks.offInstanceBackupRestore='UNVERIFIED';
  checks.authorizedSyntheticEgs='UNVERIFIED';
  checks.zatcaSimulationAcceptance='NOT_PERFORMED';
  return {format:'LOUREX_FISCAL_AWS_READINESS_V1',scope:'SIMULATION_ONLY',decision:'HOLD',checks};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{process.stdout.write(JSON.stringify(fiscalAudit(),null,2)+'\n');}
  catch{process.stdout.write('LOUREX_FISCAL_READINESS_AUDIT_FAILED_CLOSED\n');}
  process.exitCode=2;
}
