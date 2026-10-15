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
const authProject='demo-lourex-pinless-auth';
const port=4199;
const browserSource=`<!doctype html><html><head><meta charset="utf-8"></head><body>
  <script src="./vendor/firebase-app-compat.js?v=12.19.0"></script>
  <script src="./vendor/firebase-auth-compat.js?v=12.19.0"></script>
  <script src="./vendor/firebase-firestore-compat.js?v=12.19.0"></script>
  <script>
    firebase.initializeApp({apiKey:'qa-local-fake-key',authDomain:'demo-lourex-pinless-auth.firebaseapp.com',projectId:'demo-lourex-pinless-auth',appId:'1:985119320046:web:test-local-only'});
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

  // A third Firebase UID, created in the same isolated emulator, must not
  // read or overwrite the original owner's manifest, even using the raw SDK.
  // Also verify that local IndexedDB starts in a separate empty account scope.
  const outsiderUid=await evaluate(b,`firebase.auth().createUserWithEmailAndPassword(
    ${JSON.stringify('lourex.qa.outsider.'+Date.now()+'@example.test')},
    ${JSON.stringify(password)}
  ).then(r=>r.user.uid)`);
  assert.notEqual(outsiderUid,signUp,'third account must have a distinct Firebase UID');
  const outsider=await evaluate(b,`(async()=>{
    const db=await import('./src/storage/db.js');
    await db.activateAccountStorage(firebase.auth().currentUser.uid);
    const local=await db.getPlainWorkspace();
    const ref=firebase.firestore().collection('users').doc(${JSON.stringify(signUp)})
      .collection('workspace').doc('meta');
    let readDenied=false,writeDenied=false;
    try{await ref.get();}catch(error){readDenied=error.code==='permission-denied';}
    try{await ref.set({revision:'forged'});}catch(error){writeDenied=error.code==='permission-denied';}
    return {readDenied,writeDenied,localEmpty:local===null,
      signedInUid:firebase.auth().currentUser.uid};
  })()`);
  assert.equal(outsider.signedInUid,outsiderUid);
  assert.ok(outsider.readDenied,'outsider must not read the original owner workspace');
  assert.ok(outsider.writeDenied,'outsider must not overwrite the original owner workspace');
  assert.ok(outsider.localEmpty,'a different UID must not inherit original account IndexedDB state');
  const stillSafe=await evaluate(a,`(async()=>{
    const {sync,user}=await ${modules};
    const meta=await sync.getPlainCloudMeta(user.uid);
    return {ok:Boolean(meta?.revision),uid:user.uid};
  })()`);
  assert.equal(stillSafe.uid,signUp);
  assert.equal(stillSafe.ok,true,'unauthorized attempts must not corrupt original account');
  console.log('PASS real Firebase browser C: cross-account read/write denied and local data isolated');
  // New, clean device recovery: use only the authenticated owner's committed
  // emulator snapshot. Never restore a conflicting unsynced draft from A.
  const recoveredDevice=await openProfile(chrome,'D-recovery');
  const recoveredUid=await evaluate(recoveredDevice,`firebase.auth().signInWithEmailAndPassword(${JSON.stringify(email)},${JSON.stringify(password)}).then(r=>r.user.uid)`);
  assert.equal(recoveredUid,signUp);
  const recovered=await evaluate(recoveredDevice,`(async()=>{
    const {db,sync,user}=await ${modules};
    const before=await db.getPlainWorkspace();
    const outcome=await sync.reconcilePlainCloudWorkspace(user.uid);
    const current=await db.getPlainWorkspace();
    return {fresh:before===null,outcome,
      numbers:current?.payload.documents.map(d=>d.number)||[],
      customers:current?.payload.customers.map(c=>c.id)||[]};
  })()`);
  assert.equal(recovered.fresh,true,'new profile starts without a business database');
  assert.equal(recovered.outcome,'pulled','restore only the committed Firebase workspace');
  assert.deepEqual(recovered.numbers,['INV-QA-0001','PI-QA-0002','INV-B-0003']);
  assert.ok(recovered.customers.includes('offline-qa-customer'),'offline edit survives recovery');
  console.log('PASS real Firebase browser D: clean-device restore of committed invoices and previously offline customer');

  // End-to-end financial ledger on the real browser/Firestore emulator boundary.
  // A final invoice must debit stock once; a linked final credit note does
  // not restock; a physically evidenced partial receipt does.
  const postedPhysical=await evaluate(recoveredDevice,`(async()=>{
    const {db,sync,user,documents}=await ${modules};
    const ops=await import('./src/lib/operations.js');
    const invoices=await import('./src/lib/invoice-stock.js');
    const returns=await import('./src/lib/sales-returns.js');
    const lifecycle=await import('./src/lib/document-lifecycle.js');
    const before=await db.getPlainWorkspace();
    const vault=before.payload,date=new Date().toISOString().slice(0,10),now=new Date().toISOString();
    const workspaceId=vault.appSettings.activeWorkspaceId,branchId=vault.appSettings.activeBranchId;
    const item={id:'firebase-qa-stock-item',sku:'QA-CARTON-STOCK',descriptionEn:'QA physical carton',descriptionAr:'كرتون تجريبي',
      hsCode:'',origin:'',packing:'',unit:'Carton',createdAt:now,updatedAt:now,
      lastUnitPrice:'10.00',lastCurrency:'USD',lastUnitCost:'4.50',lastCostCurrency:'USD',
      usageCount:0,lastUsedAt:now,workspaceId,branchId};
    const encoded='JVBERi0xLjQKMSAwIG9iagplbmRvYmoK',proof={id:'qa-physical-return-proof',
      name:'signed-qa-return.pdf',mimeType:'application/pdf',size:atob(encoded).length,
      dataUrl:'data:application/pdf;base64,'+encoded,createdAt:now};
    const opening={...ops.createManualInventoryMovement(item,'opening','10',date,'Verified QA opening count','4.50','USD'),
      toWarehouseId:vault.warehouses[0].id,workspaceId,branchId,reasonCategory:'opening',createdBy:'owner',evidence:proof};
    const added={...vault,savedItems:[...vault.savedItems,item],inventoryMovements:[...vault.inventoryMovements,opening]};
    const invoice={...documents.createBlankDocument('invoice','INV-QA-STOCK-0001',added.company),status:'final',issueDate:date};
    invoice.customerSnapshot={sourceCustomerId:'buyer-stock-qa',companyNameEn:'QA Stock Buyer',companyNameAr:'',
      contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
    invoice.items=[{...invoice.items[0],id:'qa-stock-invoice-line',savedItemId:item.id,stockTreatment:'tracked',skuSnapshot:item.sku,
      descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,unit:'Carton',quantity:'4',unitPrice:'10.00'}];
    const issued=invoices.postIssuedInvoiceStock({...added,documents:[...added.documents,invoice]},invoice).vault;
    const afterIssue=ops.inventoryBalances(issued.savedItems,issued.inventoryMovements).find(row=>row.item.id===item.id).quantity;
    const credit={...lifecycle.createCreditNoteDraft(invoice,'CN-QA-STOCK-0001','40.00'),status:'final',issueDate:date};
    credit.items=[{...credit.items[0],id:'qa-stock-credit-line',quantity:'2',unitPrice:'10.00'}];
    const credited={...issued,documents:[...issued.documents,credit]};
    const afterCredit=ops.inventoryBalances(credited.savedItems,credited.inventoryMovements).find(row=>row.item.id===item.id).quantity;
    const received=returns.postSalesReturn(credited,{creditNoteId:credit.id,invoiceLineId:invoice.items[0].id,
      creditLineId:credit.items[0].id,warehouseId:credited.warehouses[0].id,quantity:'1.5',date,
      reason:'Returned sealed cartons checked and received by QA warehouse',evidence:proof,operatorId:'owner'}).vault;
    const afterReceipt=ops.inventoryBalances(received.savedItems,received.inventoryMovements).find(row=>row.item.id===item.id).quantity;
    if(!await db.updatePlainWorkspaceIfUnchanged(user.uid,before.localRevision,received))throw Error('Stock posting IndexedDB CAS failed');
    const outcome=await sync.reconcilePlainCloudWorkspace(user.uid);
    return {outcome,afterIssue,afterCredit,afterReceipt,
      debit:received.inventoryMovements.filter(row=>row.sourceId===invoice.id&&row.type==='issue').length,
      receipts:received.inventoryMovements.filter(row=>row.salesReturn?.invoiceId===invoice.id).length};
  })()`);
  assert.equal(postedPhysical.outcome,'pushed');
  assert.deepEqual([postedPhysical.afterIssue,postedPhysical.afterCredit,postedPhysical.afterReceipt],['6','6','7.5']);
  assert.equal(postedPhysical.debit,1);assert.equal(postedPhysical.receipts,1);
  console.log('PASS real Firebase browser D: issued invoice and evidenced credit-linked receipt uploaded atomically');

  // Profile B previously signed in as the third, unrelated UID. Explicitly
  // switch back to the owner and re-select only the owner's IndexedDB scope.
  const backToOwner=await evaluate(b,`(async()=>{
    await firebase.auth().signOut();
    const {user}=await firebase.auth().signInWithEmailAndPassword(${JSON.stringify(email)},${JSON.stringify(password)});
    return user.uid;
  })()`);
  assert.equal(backToOwner,signUp,'returning owner login must restore the right Firebase UID');
  const replicatedPhysical=await evaluate(b,`(async()=>{
    const {db,sync,user}=await ${modules};
    const ops=await import('./src/lib/operations.js');
    const result=await sync.reconcilePlainCloudWorkspace(user.uid);
    const vault=(await db.getPlainWorkspace()).payload;
    const balance=ops.inventoryBalances(vault.savedItems,vault.inventoryMovements)
      .find(row=>row.item.id==='firebase-qa-stock-item')?.quantity;
    return {result,balance,invoice:vault.documents.some(d=>d.number==='INV-QA-STOCK-0001'),
      credit:vault.documents.some(d=>d.number==='CN-QA-STOCK-0001'),
      debit:vault.inventoryMovements.filter(m=>m.sourceNumber==='INV-QA-STOCK-0001'&&m.type==='issue').length,
      receipts:vault.inventoryMovements.filter(m=>m.salesReturn?.creditNoteId===vault.documents.find(d=>d.number==='CN-QA-STOCK-0001')?.id).length};
  })()`);
  assert.equal(replicatedPhysical.result,'pulled');assert.equal(replicatedPhysical.balance,'7.5');
  assert.equal(replicatedPhysical.invoice,true);assert.equal(replicatedPhysical.credit,true);
  assert.equal(replicatedPhysical.debit,1);assert.equal(replicatedPhysical.receipts,1);
  console.log('PASS real Firebase browser B: issued debit and partial return reconstruct exactly once on second device');

}finally{
  for(const c of sessions){try{c.close();}catch{}}
  for(const child of running){try{child.kill('SIGTERM');}catch{}}
  for(const dir of profiles){try{await rm(dir,{recursive:true,force:true});}catch{}}
  try{await rm('dist/qa-firebase-emulator.html',{force:true});}catch{}
}
