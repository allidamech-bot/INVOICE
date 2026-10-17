// Read-only anonymous Firestore denial on the actual LOUREX Firebase project.
// Launches production's public sign-in page and reuses its Firebase SDK/config.
// NEVER signs in, creates accounts, queries customer UIDs, lists users, writes,
// uploads, invokes AI, or prints response data. Uses synthetic random UID only.
// A PASS proves these anonymous requests were denied, not full deployed-rule parity.
import {webkit} from 'playwright';
import {randomBytes} from 'node:crypto';
const origin='https://invoice-three-puce.vercel.app/';
const uid='qa-unsigned-deny-'+randomBytes(12).toString('hex');
const browser=await webkit.launch({headless:true});
let exitCode=0;
const findings=[];
try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  try{
    const response=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});
    if(response?.status()!==200)throw new Error('INCONCLUSIVE: public production app did not return HTTP 200');
    await page.waitForFunction(()=>{
      try{return Boolean(window.firebase?.apps?.length&&window.firebase?.auth&&window.firebase?.firestore);}catch{return false;}
    },null,{timeout:22000});
    const state=await page.evaluate(async(uid)=>{
      const firebase=window.firebase;
      const identity=firebase.auth().currentUser;
      if(identity)return {precondition:'unexpected-active-session',probeResults:[]};
      const firestore=firebase.firestore();
      const base=firestore.collection('users').doc(uid);
      const calls=[
        {name:'workspace-manifest',execute:()=>base.collection('workspace').doc('meta').get({source:'server'})},
        {name:'workspace-history',execute:()=>base.collection('workspaceHistory').limit(1).get({source:'server'})},
        {name:'assistant-history',execute:()=>base.collection('assistantHistory').limit(1).get({source:'server'})}
      ];
      const probeResults=[];
      for(const call of calls){
        try{
          await Promise.race([
            call.execute(),
            new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Timed out'),{code:'qa-timeout'})),15000))
          ]);
          // Never serialize any document or return its fields even if the read succeeds.
          probeResults.push({name:call.name,state:'UNEXPECTED_READ_ALLOWED'});
        }catch(error){
          const code=String(error?.code||'unknown');
          probeResults.push({name:call.name,state:code==='permission-denied'?'DENIED':'INCONCLUSIVE_ERROR',code:code.slice(0,60)});
        }
      }
      return {precondition:'signed-out',probeResults};
    },uid);
    findings.push(state);
    if(state.precondition!=='signed-out'||state.probeResults.length!==3){exitCode=2;}
    else if(state.probeResults.some(r=>r.state==='UNEXPECTED_READ_ALLOWED'))exitCode=1;
    else if(state.probeResults.some(r=>r.state!=='DENIED'))exitCode=2;
  }catch(error){
    exitCode=2;
    findings.push({precondition:'inconclusive',reason:String(error?.message||error).slice(0,240)});
  }finally{await context.close();}
}finally{await browser.close();}
console.log(JSON.stringify({type:'LOUREX_PRODUCTION_FIRESTORE_UNSIGNED_GUARD',
  scope:'3 synthetic-UID anonymous read-only probes via production Firebase SDK; not an authenticated rules acceptance',
  findings},null,2));
if(exitCode===1)console.error('FAIL: anonymous Firebase read unexpectedly succeeded; investigate authorization before production acceptance.');
if(exitCode===2)console.error('INCONCLUSIVE: anonymous Firebase guard could not be attested; not proof of an application defect.');
if(exitCode===0)console.log('PASS: three synthetic-UID Firestore reads denied for signed-out user on production Firebase SDK. Rules parity and authorized flows remain unverified.');
process.exitCode=exitCode;
