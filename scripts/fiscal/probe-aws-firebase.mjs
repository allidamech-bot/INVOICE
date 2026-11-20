// Run under the existing restricted Linux service identity; no credential output.
import {initializeAwsStagingFirebase} from '../../api/_fiscal/staging-aws-firebase.js';
const projectId='lourex-fiscal-qa',serviceAccount='lourex-aws-worker@'+projectId+'.iam.gserviceaccount.com';
const [number,adcPath]=process.argv.slice(2);
if(!/^\d+$/.test(number??'')||adcPath!=='/etc/lourex-staging/aws-adc.json'||process.argv.length!==4)throw Error('AWS_FEDERATION_CONFIG_INVALID');
try{
 const {db}=await initializeAwsStagingFirebase({projectId,audience:'//iam.googleapis.com/projects/'+number+'/locations/global/workloadIdentityPools/lourex-aws-qa/providers/ec2',serviceAccount,adcPath});
 await db.terminate();
 console.log('LOUREX AWS FIREBASE FEDERATION PASSED');
}catch{
 console.error('LOUREX AWS FIREBASE FEDERATION NOT VERIFIED');
 process.exitCode=1;
}
