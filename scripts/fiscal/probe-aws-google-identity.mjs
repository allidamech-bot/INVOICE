// Identity exchange only: no Firestore read/write, no credential disclosure.
import {probeAwsGoogleIdentity} from '../../api/_fiscal/aws-google-identity.js';
try{
 await probeAwsGoogleIdentity();
 console.log('LOUREX AWS GOOGLE IDENTITY PASSED');
 console.log('FIRESTORE ACCESS: NOT GRANTED');
 }catch(e){
 const safe=String(e?.message??'');
 const allowed=/^AWS_GOOGLE_IDENTITY_([A-Z0-9_]+)$/.exec(safe);
 console.error('LOUREX AWS GOOGLE IDENTITY NOT VERIFIED: '+(allowed?allowed[1]:'LOCAL_UNKNOWN'));
 process.exitCode=1;
}
