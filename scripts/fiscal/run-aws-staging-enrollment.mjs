// Explicitly invoked, restricted ONE-SHOT ZATCA Simulation enrollment.
// No HTTP listener, scheduler, consumer polling or production issuer access.
import {openSync,readFileSync,fstatSync,closeSync,lstatSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {validateAwsFiscalWorkerConfig} from '../../api/_fiscal/aws-worker-configuration.js';
import {bindAwsTrustedRuntime} from '../../api/_fiscal/aws-trusted-runtime-profile.js';
import {initializeAwsStagingFirebase} from '../../api/_fiscal/staging-aws-firebase.js';
import {
 requireAwsEnrollmentOperator,validateAwsEnrollmentInstruction,
 readAwsEnrollmentOtp,executeAwsEnrollmentInstruction,
} from '../../api/_fiscal/aws-enrollment-operator.js';

const reject=()=>{throw Error('LOUREX_AWS_ENROLLMENT_NOT_READY');};
function protectedFile(path,max){
 if(dirname(path)!=='/etc/lourex-staging')reject();
 const d=lstatSync('/etc/lourex-staging');
 if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==0||(d.mode&0o022)!==0)reject();
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const s=fstatSync(fd);
  if(!s.isFile()||s.nlink!==1||s.uid!==0||(s.mode&0o022)!==0||s.size<1||s.size>max)reject();
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
async function main(){
 requireAwsEnrollmentOperator(process.env);
 const config=validateAwsFiscalWorkerConfig(JSON.parse(
  protectedFile('/etc/lourex-staging/worker.json',16384).toString('utf8')));
 const trust=protectedFile('/etc/lourex-staging/trusted-runtime-profile.json',131072);
 if(createHash('sha256').update(trust).digest('hex')!==config.profileSha256)reject();
 const profile=JSON.parse(trust.toString('utf8'));
 const instruction=validateAwsEnrollmentInstruction(JSON.parse(
  protectedFile('/etc/lourex-staging/enrollment-command.json',8192).toString('utf8')),config.scopes);
 // OTP is passed by systemd via an ephemeral, root-provisioned /run file,
 // not argv, environment, command JSON, Firebase, Vercel or this repository.
 const otp=instruction.action==='begin'?readAwsEnrollmentOtp():undefined;
 const {db}=await initializeAwsStagingFirebase(config);
 const {createStagingFiscalRuntime}=await import('../../api/_fiscal/staging-runtime.js');
 const runtime=bindAwsTrustedRuntime({
  profile,scopes:config.scopes,credentialsDirectory:process.env.CREDENTIALS_DIRECTORY,
  db,createStagingFiscalRuntime,
 });
 const result=await executeAwsEnrollmentInstruction(runtime,instruction,{otp});
 console.log('LOUREX AWS FISCAL ENROLLMENT STEP COMPLETED: '+result.action+' '+result.state);
}
try{await main();}catch{
 // Never print a hidden credential, OTP, certificate, CSR, or ZATCA response.
 console.error('LOUREX AWS FISCAL ENROLLMENT STOPPED: NOT READY OR HELD');
 process.exitCode=1;
}
