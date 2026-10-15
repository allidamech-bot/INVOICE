const project='lourex-invoice';
const release='projects/'+project+'/releases/cloud.firestore';
const ruleset='projects/'+project+'/rulesets/fixture_01';
const expected='Bearer synthetic-test-access-token';
const liveText="rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }\n";
let calls=0;
globalThis.fetch=async (url,options={})=>{
 calls++;
 if(options.method!=='GET'||options.redirect!=='error'
    ||options.headers?.Authorization!==expected
    ||options.signal?.aborted)
  throw new Error('Invalid Cloud Shell read-only token use');
 const u=String(url);
 if(u==='https://firebaserules.googleapis.com/v1/'+release){
  return {ok:true,json:async()=>({rulesetName:process.env.TEST_BAD_RELEASE==='yes'?'projects/other-project/rulesets/fixture_01':ruleset})};
 }
 if(u==='https://firebaserules.googleapis.com/v1/'+ruleset){
  if(calls!==2)throw new Error('Unexpected number of Firebase GET calls');
  return {ok:true,json:async()=>({source:{files:[{name:'firestore.rules',content:liveText}]}})};
 }
 throw new Error('Unexpected destination: '+u);
};
