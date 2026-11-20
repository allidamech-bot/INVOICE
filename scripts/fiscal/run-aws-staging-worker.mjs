// This entrypoint does nothing without independently approved QA data-plane
// access and an operator-installed root-owned trusted runtime adapter.
import {openSync,readFileSync,fstatSync,closeSync,lstatSync,constants} from 'node:fs';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStagingServiceSupervisor,validateStagingServiceScopes} from '../../api/_fiscal/staging-service-supervisor.js';
import {initializeAwsStagingFirebase} from '../../api/_fiscal/staging-aws-firebase.js';

const denied=()=>{throw Error('LOUREX_AWS_WORKER_NOT_READY');};
function protectedFile(path,maxBytes){
 if(dirname(path)!=='/etc/lourex-staging')denied();
 const dir=lstatSync('/etc/lourex-staging');
 if(!dir.isDirectory()||dir.uid!==0||(dir.mode&0o022)!==0)denied();
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.uid!==0||(st.mode&0o022)!==0||st.size<1||st.size>maxBytes)denied();
  return readFileSync(fd);
 }finally{closeSync(fd);}
}
async function main(){
 if(process.env.LOUREX_AWS_STAGING_ENABLED!=='true'||process.env.LOUREX_AWS_WORKER_ENABLED!=='true'||process.env.VERCEL_ENV||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.AWS_ACCESS_KEY_ID||process.env.AWS_SECRET_ACCESS_KEY||process.env.AWS_SESSION_TOKEN||process.env.AWS_PROFILE)denied();
 const config=JSON.parse(protectedFile('/etc/lourex-staging/worker.json',16384).toString('utf8'));
 if(!config||Object.keys(config).sort().join(',')!=='adcPath,audience,projectId,scopes,serviceAccount'||!Array.isArray(config.scopes))denied();
 const scopes=validateStagingServiceScopes(config.scopes);
 // Only the pinned trusted code file may supply authority trust, SDK paths,
 // approved policies, EC2 SoftHSM stores and transport. No default mocks.
 protectedFile('/etc/lourex-staging/runtime-adapter.mjs',131072);
 const adapter=await import(pathToFileURL('/etc/lourex-staging/runtime-adapter.mjs').href);
 if(typeof adapter.createTrustedStagingRuntime!=='function')denied();
 const {db,auth}=await initializeAwsStagingFirebase(config);
 const {createStagingFiscalRuntime}=await import('../../api/_fiscal/staging-runtime.js');
 const runtime=await adapter.createTrustedStagingRuntime({db,auth,createStagingFiscalRuntime});
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
