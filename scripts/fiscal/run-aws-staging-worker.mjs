// This entrypoint is disabled until approved QA, pinned trust material, private
// systemd credentials and an explicit operator dispatch gate are present.
import {openSync,readFileSync,fstatSync,closeSync,lstatSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {createStagingServiceSupervisor} from '../../api/_fiscal/staging-service-supervisor.js';
import {validateAwsFiscalWorkerConfig,requireAwsFiscalDispatchApproval} from '../../api/_fiscal/aws-worker-configuration.js';
import {bindAwsTrustedRuntime} from '../../api/_fiscal/aws-trusted-runtime-profile.js';
import {initializeAwsStagingFirebase} from '../../api/_fiscal/staging-aws-firebase.js';

const denied=()=>{throw Error('LOUREX_AWS_WORKER_NOT_READY');};
function protectedFile(path,maxBytes){
 if(dirname(path)!=='/etc/lourex-staging')denied();
 const dir=lstatSync('/etc/lourex-staging');
 if(!dir.isDirectory()||dir.uid!==0||(dir.mode&0o022)!==0)denied();
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.uid!==0||(st.mode&0o022)!==0||st.size<1||st.size>maxBytes)denied();
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
async function main(){
 // Three independent gates: isolated QA identity, root-owned pinned trust
 // profile, and explicit operator authorization after Simulation acceptance.
 requireAwsFiscalDispatchApproval(process.env);
 const config=validateAwsFiscalWorkerConfig(JSON.parse(protectedFile('/etc/lourex-staging/worker.json',16384).toString('utf8')));
 const scopes=config.scopes;
 const profileBytes=protectedFile('/etc/lourex-staging/trusted-runtime-profile.json',131072);
 if(createHash('sha256').update(profileBytes).digest('hex')!==config.profileSha256)denied();
 const profile=JSON.parse(profileBytes.toString('utf8'));
 const {db}=await initializeAwsStagingFirebase(config);
 const {createStagingFiscalRuntime}=await import('../../api/_fiscal/staging-runtime.js');
 const runtime=bindAwsTrustedRuntime({profile,scopes,credentialsDirectory:process.env.CREDENTIALS_DIRECTORY,db,createStagingFiscalRuntime});
 if(typeof runtime?.cycle!=='function')denied();
 const supervisor=createStagingServiceSupervisor({scopes,cycle:runtime.cycle});
 const controller=new AbortController();
 process.once('SIGTERM',()=>controller.abort());
 process.once('SIGINT',()=>controller.abort());
 console.log('LOUREX AWS STAGING WORKER STARTED');
 await supervisor.serve(controller.signal);
 console.log('LOUREX AWS STAGING WORKER STOPPED');
}
try{await main();}catch{
 // Never leak Google tokens, certificates, PINs or authority response data.
 console.error('LOUREX AWS STAGING WORKER STOPPED: NOT READY');
 process.exitCode=1;
}
