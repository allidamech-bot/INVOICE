// Read-only QA Firestore data-plane probe. Do not run against lourex-invoice.
// Reuses the already verified AWS WIF pool/provider; no IAM changes.
import {initializeAwsStagingFirebase} from '../../api/_fiscal/staging-aws-firebase.js';
const [projectId,adcPath]=process.argv.slice(2);
if(!/^[a-z][a-z0-9-]{0,18}-fiscal-qa$/.test(projectId??'')||projectId==='lourex-invoice'||adcPath!=='/etc/lourex-staging/aws-adc.json'||process.argv.length!==4)throw Error('AWS_FEDERATION_CONFIG_INVALID');
const serviceAccount='lourex-aws-worker@'+projectId+'.iam.gserviceaccount.com';
try{
 const {db}=await initializeAwsStagingFirebase({projectId,audience:'//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging',serviceAccount,adcPath});
 await db.terminate();
 console.log('LOUREX AWS ISOLATED FIREBASE READ-ONLY PASSED');
}catch{
 console.error('LOUREX AWS ISOLATED FIREBASE NOT VERIFIED');
 process.exitCode=1;
}
