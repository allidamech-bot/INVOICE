// Read-only audit for the existing AWS ZATCA Simulation deployment.
// Never reads secret values, sends invoices, starts services, or approves release.
import {lstatSync,readFileSync,openSync,fstatSync,closeSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateAwsFiscalWorkerConfig} from '../../api/_fiscal/aws-worker-configuration.js';
import {validateAwsTrustedRuntimeProfile} from '../../api/_fiscal/aws-trusted-runtime-profile.js';

const release='/opt/lourex-fiscal/current';
const cfg='/etc/lourex-staging';
function stat(path){try{return lstatSync(path);}catch{return null;}}
function safeFile(path,max=131072){
  let fd;
  try{
    // Mirror the worker's O_NOFOLLOW/fstat boundary: do not allow a
    // symlink swap between a path check and reading trusted configuration.
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const s=fstatSync(fd);
    if(!s.isFile()||s.uid!==0||s.nlink!==1||(s.mode&0o022)||s.size<1||s.size>max)return null;
    const bytes=readFileSync(fd);
    return bytes.length===s.size?bytes:null;
  }catch{return null;}
  finally{if(fd!==undefined)closeSync(fd);}
}
function stopped(unit){
  const r=spawnSync('/usr/bin/systemctl',['is-active',unit],{timeout:3000,encoding:'utf8'});
  return !r.error&&r.stdout.trim()==='inactive';
}
export function fiscalAudit({base=cfg,releaseRoot=release,expectedReleaseSha='',serviceStopped=stopped,read=safeFile}={}){
  const checks={};
  const mark=(name,ok)=>{checks[name]=ok?'PASS':'BLOCKED';};
  const rel=read(releaseRoot+'/.lourex-fiscal-commit',100);
  // The installed fiscal source may be upgraded to an explicitly reviewed main
  // commit. A missing/invalid operator pin NEVER passes the release check.
  mark('reviewedReleaseInstalled',/^[a-f0-9]{40}$/.test(expectedReleaseSha)&&rel?.toString('utf8').trim()===expectedReleaseSha);
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
  // Audit exactly the same schemas as the trusted worker. A matching SHA
  // over arbitrary JSON must not yield a false-positive "pinned" PASS.
  // Parse from each protected byte snapshot, never from a second file read.
  let worker;
  try{
    const bytes=read(base+'/worker.json',16384);
    if(!Buffer.isBuffer(bytes))throw Error('MISSING_WORKER');
    worker=validateAwsFiscalWorkerConfig(JSON.parse(bytes.toString('utf8')));
  }catch{worker=null;}
  mark('qaOnlyScopes',!!worker);
  let pinned=false;
  try{
    const bytes=read(base+'/trusted-runtime-profile.json',131072);
    if(!worker||!Buffer.isBuffer(bytes)||
       createHash('sha256').update(bytes).digest('hex')!==worker.profileSha256)throw Error('PROFILE_MISMATCH');
    validateAwsTrustedRuntimeProfile(JSON.parse(bytes.toString('utf8')),worker.scopes);
    pinned=true;
  }catch{pinned=false;}
  mark('pinnedSimulationProfile',pinned);
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
  try{process.stdout.write(JSON.stringify(fiscalAudit({expectedReleaseSha:process.argv[2]??''}),null,2)+'\n');}
  catch{process.stdout.write('LOUREX_FISCAL_READINESS_AUDIT_FAILED_CLOSED\n');}
  process.exitCode=2;
}
