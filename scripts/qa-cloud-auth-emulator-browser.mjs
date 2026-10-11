// Browser integration: two independent Chrome profiles, real Firebase Auth + Firestore
// emulator transports, actual compiled LOUREX storage/cloud modules. No remote
// credentials, no production writes, no new npm dependencies.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,ms,name)=>{
  const until=Date.now()+ms;
  while(Date.now()<until){try{const x=await fn();if(x)return x;}catch{}await sleep(220);}
  throw new Error('Timed out waiting for '+name);
};
function chromeBinary(){
  for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
    try{execFileSync(name,['--version'],{stdio:'ignore'});return name;}catch{}
  }
  throw new Error('Chrome not installed on runner.');
}
function cdpClient(address){
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(address),pending=new Map();
    let id=0;
    socket.addEventListener('error',()=>reject(new Error('CDP socket disconnected')));
    socket.addEventListener('open',()=>resolve({
      call(method,params={}){
        return new Promise((ok,no)=>{
          const n=++id;
          const timeout=setTimeout(()=>{pending.delete(n);no(new Error('CDP timeout: '+method));},45000);
          pending.set(n,{ok,no,timeout});socket.send(JSON.stringify({id:n,method,params}));
        });
      },
      close:()=>socket.close()
    }),{once:true});
    socket.addEventListener('message',event=>{
      const msg=JSON.parse(String(event.data));
      const task=pending.get(msg.id);if(!task)return;
      pending.delete(msg.id);clearTimeout(task.timeout);
      if(msg.error)task.no(new Error(msg.error.message));
      else task.ok(msg.result??{});
    });
  });
}
const running=[],profiles=[],sessions=[];
const authProject='lourex-invoice';
const port=4199;
const browserSource=`<!doctype html><html><head><meta charset="utf-8"></head><body>
  <script src="./vendor/firebase-app-compat.js?v=12.19.0"></script>
  <script src="./vendor/firebase-auth-compat.js?v=12.19.0"></script>
  <script src="./vendor/firebase-firestore-compat.js?v=12.19.0"></script>
  <script>
    firebase.initializeApp({apiKey:'qa-local-fake-key',authDomain:'lourex-invoice.firebaseapp.com',projectId:'lourex-invoice',appId:'1:985119320046:web:test-local-only'});
    firebase.auth().useEmulator('http://127.0.0.1:9099',{disableWarnings:true});
    firebase.firestore().useEmulator('127.0.0.1',8080);
    window.LourexEmulatorsReady=true;
  </script>
</body></html>`;
async function openProfile(binary,name){
  const profile=await mkdtemp(join(tmpdir(),'lourex-auth-emulator-'));
  profiles.push(profile);
  const child=spawn(binary,[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,
    'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr?.on('data',b=>stderr=(stderr+String(b)).slice(-3000));
  running.push(child);
  const targetPort=await wait(async()=>{
    if(child.exitCode!==null)throw new Error('Chrome exit '+child.exitCode+' '+stderr);
    const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
    return Number(lines[0])||null;
  },30000,'Chrome '+name+' DevTools');
  const target=await wait(async()=>{
    const response=await fetch('http://127.0.0.1:'+targetPort+'/json/list');
    const list=await response.json();return list.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
  },15000,'Chrome '+name+' target');
  const cdp=await cdpClient(target.webSocketDebuggerUrl);
  sessions.push(cdp);
  await cdp.call('Page.enable');await cdp.call('Runtime.enable');
  await cdp.call('Page.navigate',{url:'http://127.0.0.1:'+port+'/qa-firebase-emulator.html'});
  await wait(async()=>{
    const x=await cdp.call('Runtime.evaluate',{expression:'Boolean(window.LourexEmulatorsReady)',returnByValue:true});
    return x.result?.value===true;
  },20000,'Firebase emulator scripts '+name);
  return cdp;
}
async function evaluate(cdp,expression){
  const response=await cdp.call('Runtime.evaluate',{
    expression:`(async()=>{try{return {ok:true,result:await (${expression})}}catch(error){return {ok:false,error:String(error?.stack||error)}}})()`,
    awaitPromise:true,returnByValue:true
  });
  if(response.exceptionDetails)throw new Error('CDP JavaScript exception '+JSON.stringify(response.exceptionDetails));
  const value=response.result?.value;
  if(!value?.ok)throw new Error('Browser integration failed: '+JSON.stringify(value?.error??response));
  return value.result;
}
const modules=`(async()=>{
  const db=await import('./src/storage/db.js');
  const sync=await import('./src/cloud/plain-workspace.js');
  const defaults=await import('./src/lib/defaults.js');
  const documents=await import('./src/lib/documents.js');
  const user=firebase.auth().currentUser;
  if(!user)throw Error('Firebase Auth session absent');
  await db.activateAccountStorage(user.uid);
  return {db,sync,defaults,documents,user};
})()`;
try{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore Emulator must be running');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth Emulator must be running');
  await writeFile('dist/qa-firebase-emulator.html',browserSource);
  const server=spawn(process.execPath,['./node_modules/http-server/bin/http-server','dist','-p',String(port),'-a','127.0.0.1','-c-1'],{stdio:'ignore'});
  running.push(server);
  await wait(async()=>{const res=await fetch('http://127.0.0.1:'+port+'/qa-firebase-emulator.html');return res.ok;},12000,'test-only HTTP server');
  const chrome=chromeBinary(),a=await openProfile(chrome,'A'),b=await openProfile(chrome,'B');
  const email='lourex.qa.'+Date.now()+'@example.test',password='LourexEmulator-strong-2026!';
  const signUp=await evaluate(a,`firebase.auth().createUserWithEmailAndPassword(${JSON.stringify(email)},${JSON.stringify(password)}).then(r=>r.user.uid)`);
  assert.ok(signUp.length>5);
  const initial=await evaluate(a,`(async()=>{
    const {db,sync,defaults,documents,user}=await ${modules};
    const vault=defaults.emptyVault();
    vault.documents.push(documents.createBlankDocument('invoice','INV-QA-0001',vault.company));
    const local=await db.savePlainWorkspace(user.uid,vault,null,null);
    const result=await sync.reconcilePlainCloudWorkspace(user.uid);
    return {uid:user.uid,result,number:local.payload.documents[0].number,revision:(await db.getPlainWorkspace()).baseCloudRevision};
  })()`);
  assert.equal(initial.uid,signUp);assert.equal(initial.result,'pushed');
  assert.equal(initial.number,'INV-QA-0001');assert.ok(initial.revision);
  console.log('PASS real Firebase browser A: created account and uploaded first invoice');

  const signedIn=await evaluate(b,`firebase.auth().signInWithEmailAndPassword(${JSON.stringify(email)},${JSON.stringify(password)}).then(r=>r.user.uid)`);
  assert.equal(signedIn,signUp,'second browser must sign into the same Firebase UID');
  const received=await evaluate(b,`(async()=>{
    const {db,sync,user}=await ${modules};
    const outcome=await sync.reconcilePlainCloudWorkspace(user.uid);
    const local=await db.getPlainWorkspace();
    return {outcome,number:local?.payload.documents[0]?.number,revision:local?.baseCloudRevision};
  })()`);
  assert.equal(received.outcome,'pulled');assert.equal(received.number,'INV-QA-0001');
  console.log('PASS real Firebase browser B: same account, same invoice, no PIN');

  const savedB=await evaluate(b,`(async()=>{
    const {db,sync,defaults,documents,user}=await ${modules};
    const local=await db.getPlainWorkspace();
    const next={...local.payload,documents:[...local.payload.documents,documents.createBlankDocument('proforma','PI-QA-0002',local.payload.company)]};
    if(!await db.updatePlainWorkspaceIfUnchanged(user.uid,local.localRevision,next))throw Error('B IndexedDB CAS failed');
    return {outcome:await sync.reconcilePlainCloudWorkspace(user.uid),count:(await db.getPlainWorkspace()).payload.documents.length};
  })()`);
  assert.equal(savedB.outcome,'pushed');assert.equal(savedB.count,2);
  const updatedA=await evaluate(a,`(async()=>{
    const {db,sync,user}=await ${modules};
    const result=await sync.reconcilePlainCloudWorkspace(user.uid);
    const local=await db.getPlainWorkspace();
    return {result,number:local.payload.documents[1].number,count:local.payload.documents.length};
  })()`);
  assert.equal(updatedA.result,'pulled');assert.equal(updatedA.number,'PI-QA-0002');
  console.log('PASS real Firebase browsers A/B: edits flow both ways via Firestore');

  const changesA=await evaluate(a,`(async()=>{
    const {db,documents,user}=await ${modules};
    const local=await db.getPlainWorkspace();
    const next={...local.payload,documents:[...local.payload.documents,documents.createBlankDocument('invoice','INV-A-0003',local.payload.company)]};
    return Boolean(await db.updatePlainWorkspaceIfUnchanged(user.uid,local.localRevision,next));
  })()`);
  assert.equal(changesA,true);
  const changesB=await evaluate(b,`(async()=>{
    const {db,sync,documents,user}=await ${modules};
    const local=await db.getPlainWorkspace();
    const next={...local.payload,documents:[...local.payload.documents,documents.createBlankDocument('invoice','INV-B-0003',local.payload.company)]};
    if(!await db.updatePlainWorkspaceIfUnchanged(user.uid,local.localRevision,next))throw Error('B local edit failed');
    return await sync.reconcilePlainCloudWorkspace(user.uid);
  })()`);
  assert.equal(changesB,'pushed');
  const conflict=await evaluate(a,`(async()=>{
    const {db,sync,user}=await ${modules};
    const result=await sync.reconcilePlainCloudWorkspace(user.uid);
    const local=await db.getPlainWorkspace();
    return {result,number:local.payload.documents.at(-1).number};
  })()`);
  assert.equal(conflict.result,'diverged');
  assert.equal(conflict.number,'INV-A-0003','unsynced offline-equivalent edit must never be overwritten');
  console.log('PASS real Firebase browser A/B: overlapping edits fail closed without loss');

  // Simulate a truly disconnected browser, not a fake navigator flag.
  // Changes must remain in account-scoped IndexedDB and upload after Chrome
  // regains network access without prompting for device PIN or re-login.
  await b.call('Network.enable');
  await b.call('Network.emulateNetworkConditions',{
    offline:true,latency:0,downloadThroughput:0,uploadThroughput:0
  });
  const offlineEdit=await evaluate(b,`(async()=>{
    const {db,user}=await ${modules};
    const local=await db.getPlainWorkspace();
    const customers=[...local.payload.customers,{id:'offline-qa-customer',
      companyNameEn:'Offline client',companyNameAr:'عميل دون اتصال',contactPerson:'',
      addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
      vatTaxNumber:'',commercialRegistration:''}];
    const result=await db.updatePlainWorkspaceIfUnchanged(user.uid,local.localRevision,{
      ...local.payload,customers
    });
    return {stored:Boolean(result),online:navigator.onLine,
      count:(await db.getPlainWorkspace()).payload.customers.length};
  })()`);
  assert.ok(offlineEdit.stored,'offline save must succeed locally');
  assert.equal(offlineEdit.online,false,'browser should actually be offline');
  assert.equal(offlineEdit.count,1,'offline customer must survive in account cache');
  await b.call('Network.emulateNetworkConditions',{
    offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1
  });
  const reconnected=await wait(async()=>{
    const r=await evaluate(b,`(async()=>{
      const {db,sync,user}=await ${modules};
      try{
        const outcome=await sync.reconcilePlainCloudWorkspace(user.uid);
        const local=await db.getPlainWorkspace();
        return {outcome,online:navigator.onLine,revision:local.baseCloudRevision};
      }catch(error){return {outcome:String(error),online:navigator.onLine};}
    })()`);
    return r.outcome==='pushed'?r:null;
  },25000,'offline Firebase reconnect and upload');
  assert.equal(reconnected.online,true);
  console.log('PASS real Firebase browser B: offline customer persists and uploads automatically after reconnection');

  const loggedOut=await evaluate(b,`(async()=>{
    await firebase.auth().signOut();
    const {db,sync}=await (async()=>{
      const db=await import('./src/storage/db.js');
      const sync=await import('./src/cloud/plain-workspace.js');
      return {db,sync};
    })();
    await db.activateAccountStorage(null);
    let denied=false;try{await sync.getPlainCloudMeta(${JSON.stringify(signUp)})}catch{denied=true;}
    return {uid:firebase.auth().currentUser?.uid??null,denied};
  })()`);
  assert.equal(loggedOut.uid,null);assert.equal(loggedOut.denied,true);
  console.log('PASS browser B: authenticated access revoked on sign-out');
}finally{
  for(const c of sessions){try{c.close();}catch{}}
  for(const child of running){try{child.kill('SIGTERM');}catch{}}
  for(const dir of profiles){try{await rm(dir,{recursive:true,force:true});}catch{}}
  try{await rm('dist/qa-firebase-emulator.html',{force:true});}catch{}
}
