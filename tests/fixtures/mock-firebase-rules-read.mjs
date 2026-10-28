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
  if(calls!==1&&calls!==3)throw new Error('Unexpected release-read order');
  return {ok:true,json:async()=>({
   name:release,updateTime:calls===3&&process.env.TEST_CHANGED_RELEASE==='yes'
    ?'2026-10-26T19:34:00.000Z':'2026-10-26T18:34:00.000Z',
   rulesetName:process.env.TEST_BAD_RELEASE==='yes'
    ?'projects/other-project/rulesets/fixture_01':ruleset
  })};
 }
 if(u==='https://firebaserules.googleapis.com/v1/'+ruleset){
  if(calls!==2)throw new Error('Unexpected number of Firebase GET calls');
  return {ok:true,json:async()=>({name:ruleset,createTime:'2026-10-26T18:33:59.000Z',source:{files:[{name:'firestore.rules',content:liveText}]}})};
 }
 throw new Error('Unexpected destination: '+u);
};
