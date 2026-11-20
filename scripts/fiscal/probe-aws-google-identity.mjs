// Identity exchange only: no Firestore read/write, no credential disclosure.
import {probeAwsGoogleIdentity} from '../../api/_fiscal/aws-google-identity.js';
try{
 await probeAwsGoogleIdentity();
 console.log('LOUREX AWS GOOGLE IDENTITY PASSED');
 console.log('FIRESTORE ACCESS: NOT GRANTED');
}catch{
 console.error('LOUREX AWS GOOGLE IDENTITY NOT VERIFIED');
 process.exitCode=1;
}
