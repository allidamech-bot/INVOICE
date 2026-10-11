// Real Chromium smoke test on GitHub's standard Ubuntu runner.
// No new packages, no credentials, no Production URL and no account data.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitUntil(fn,timeoutMs,label){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    try{const result=await fn();if(result)return result;}catch{}
    await sleep(250);
  }
  throw new Error('Timed out: '+label);
}
function browserBinary(){
  for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
    try{execFileSync(name,['--version'],{stdio:'ignore'});return name;}catch{}
  }
  throw new Error('Chrome/Chromium is not preinstalled on this free Ubuntu runner.');
}
function openCdp(url){
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(url);
    const pending=new Map(),exceptions=[],consoleErrors=[];
    let nextId=0,opened=false;
    socket.addEventListener('error',()=>{if(!opened)reject(new Error('Chrome DevTools WebSocket failed.'));});
    socket.addEventListener('open',()=>{
      opened=true;
      resolve({
        exceptions,consoleErrors,
        call(method,params={}){
          const id=++nextId;
          return new Promise((ok,no)=>{
            const timeout=setTimeout(()=>{pending.delete(id);no(new Error('CDP timeout: '+method));},12000);
            pending.set(id,{ok,no,timeout});
            socket.send(JSON.stringify({id,method,params}));
          });
        },
        close(){socket.close();}
      });
    },{once:true});
    socket.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data));
      if(message.method==='Runtime.exceptionThrown'){
        const d=message.params?.exceptionDetails;
        exceptions.push(String(d?.exception?.description||d?.text||'Unknown JS exception').slice(0,2000));
      }
      if(message.method==='Runtime.consoleAPICalled'&&message.params?.type==='error'){
        consoleErrors.push((message.params.args||[]).map(a=>String(a.value??a.description??'')).join(' ').slice(0,2000));
      }
      if(!message.id)return;
      const task=pending.get(message.id);
      if(!task)return;
      clearTimeout(task.timeout);pending.delete(message.id);
      if(message.error)task.no(new Error(message.error.message||'CDP request failed'));
      else task.ok(message.result||{});
    });
  });
}

const profiles=[];
const childProcesses=[];
let cdp;
try{
  const server=spawn(process.execPath,['./node_modules/http-server/bin/http-server','dist','-p','4173','-a','127.0.0.1','-c-1'],{stdio:'ignore'});
  childProcesses.push(server);
  await waitUntil(async()=>{
    const res=await fetch('http://127.0.0.1:4173/index.html');
    return res.ok;
  },10000,'local production build web server');
  // Chromium sometimes fails to expose CDP on heavily loaded shared Ubuntu
  // runners. Retry only process startup, never application or UI assertions.
  // Keep stderr so CI distinguishes a crashed browser from a product regression.
  const chromeBinary=browserBinary();
  let address=0;
  let launchError=new Error('Chrome could not launch');
  for(let attempt=1;attempt<=2&&!address;attempt++){
    const profile=await mkdtemp(join(tmpdir(),'lourex-qa-chrome-'));
    profiles.push(profile);
    const chrome=spawn(chromeBinary,[
      '--headless=new','--no-sandbox','--disable-dev-shm-usage',
      '--disable-gpu','--no-first-run','--no-default-browser-check',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
    ],{stdio:['ignore','ignore','pipe']});
    childProcesses.push(chrome);
    let stderr='';
    chrome.stderr?.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4096);});
    try{
      const portFile=join(profile,'DevToolsActivePort');
      const value=await waitUntil(async()=>{
        if(chrome.exitCode!==null)return {exited:chrome.exitCode};
        const lines=(await readFile(portFile,'utf8')).trim().split('\n');
        return lines[0]&&Number(lines[0])>0?Number(lines[0]):0;
      },30000,'Chrome DevTools port on attempt '+attempt);
      if(typeof value!=='number')throw new Error('Chrome exited with code '+value.exited);
      address=value;
    }catch(error){
      launchError=new Error(String(error instanceof Error?error.message:error)+'; browser exit='+String(chrome.exitCode)+'; stderr='+String(stderr||'[empty]'));
      if(chrome.exitCode===null)chrome.kill('SIGTERM');
      if(attempt<2)await sleep(1000);
    }
  }
  if(!address)throw launchError;
  const targets=await waitUntil(async()=>{
    const response=await fetch('http://127.0.0.1:'+address+'/json/list');
    const pages=await response.json();
    return pages.find(page=>page.type==='page'&&page.webSocketDebuggerUrl);
  },30000,'browser page target');
  cdp=await openCdp(targets.webSocketDebuggerUrl);
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');

  const cases=[
    {name:'iPhone-width Chromium emulation',width:390,height:844,mobile:true},
    {name:'iPad-width Chromium emulation',width:820,height:1180,mobile:true},
    {name:'desktop Chromium',width:1440,height:900,mobile:false}
  ];
  for(const item of cases){
    await cdp.call('Emulation.setDeviceMetricsOverride',{
      width:item.width,height:item.height,deviceScaleFactor:1,mobile:item.mobile
    });
    await cdp.call('Emulation.setTouchEmulationEnabled',{enabled:item.mobile});
    await cdp.call('Page.navigate',{url:'http://127.0.0.1:4173/'});
    const state=await waitUntil(async()=>{
      const response=await cdp.call('Runtime.evaluate',{
        expression:'JSON.stringify({ready:document.readyState,root:!!document.getElementById("root"),boot:!!document.getElementById("lourex-boot"),loading:!!document.querySelector(".loading-screen"),buttons:document.querySelectorAll("#root button").length,authGateway:!!document.querySelector(".ta-auth-page"),googleButton:!!document.querySelector(".ta-google-button"),passwordField:!!document.querySelector("input[type=password]"),legacyPinFields:document.querySelectorAll("input[autocomplete=one-time-code],[data-pin-setup],[data-pin-unlock]").length,rootText:(document.getElementById("root")?.innerText||"").slice(0,240),horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)-document.documentElement.clientWidth,viewport:document.documentElement.clientWidth})',
        returnByValue:true
      });
      const value=response.result?.value;
      if(!value)return null;
      const state=JSON.parse(value);
      return state.ready==='complete'&&!state.boot&&!state.loading&&state.root&&state.buttons>0?state:null;
    },25000,item.name+' render beyond boot screen');
    assert.ok(state.root,'React application root must exist.');
    assert.doesNotMatch(state.rootText,/An unexpected screen error occurred|حدث خطأ غير متوقع/i,
      item.name+' rendered the fatal AppErrorBoundary: '+JSON.stringify({
        text:state.rootText,exceptions:cdp.exceptions.slice(-4),consoleErrors:cdp.consoleErrors.slice(-4)
      }));
    assert.equal(cdp.exceptions.length,0,item.name+' emitted browser JavaScript exceptions: '+JSON.stringify(cdp.exceptions.slice(-4)));
    assert.ok(!state.boot&&!state.loading,'Startup must leave all loading screens.');
    assert.ok(state.buttons>0,'Application must expose actual interactive controls.');
    assert.ok(state.authGateway,'Signed-out user must see Firebase account gateway, not a PIN vault.');
    assert.ok(state.googleButton,'Google sign-in must be available at account entry.');
    assert.ok(state.passwordField,'Email/password sign-in must be available at account entry.');
    assert.equal(state.legacyPinFields,0,'Device PIN controls must never render.');
    assert.ok(state.viewport>0,'Viewport width must be measurable.');
    assert.ok(state.horizontalOverflow<=4,item.name+' has '+state.horizontalOverflow+'px page-level horizontal overflow.');
    console.log('PASS '+item.name+': viewport='+state.viewport+', horizontalOverflow='+state.horizontalOverflow+', rendered='+JSON.stringify(state.rootText.slice(0,110)));
  }
  // Exercise the *real compiled IndexedDB implementation* inside Chromium.
  // One Firebase UID must never read or overwrite another UID's offline cache.
  const scoped=await cdp.call('Runtime.evaluate',{
    expression:`(async()=>{
      const db=await import('./src/storage/db.js');
      const uidA='lourex-ci-account-A',uidB='lourex-ci-account-B';
      const payload={schemaVersion:1,company:{nameEn:'CI A'},appSettings:{},documents:[],customers:[{id:'A'}]};
      await db.activateAccountStorage(uidA);
      const first=await db.savePlainWorkspace(uidA,payload,null,null);
      await db.activateAccountStorage(uidB);
      if(await db.getPlainWorkspace())throw new Error('Account B inherited account A cache');
      const other={...payload,company:{nameEn:'CI B'},customers:[{id:'B'}]};
      await db.savePlainWorkspace(uidB,other,null,null);
      await db.activateAccountStorage(uidA);
      const restored=await db.getPlainWorkspace();
      if(!restored||restored.payload.customers[0].id!=='A')
        throw new Error('Account A did not recover its own data');
      const next={...restored.payload,customers:[{id:'A-new'}]};
      const update=await db.updatePlainWorkspaceIfUnchanged(uidA,restored.localRevision,next);
      if(!update)throw new Error('Atomic local save was rejected');
      const stale=await db.updatePlainWorkspaceIfUnchanged(uidA,restored.localRevision,payload);
      if(stale)throw new Error('Stale local writer bypassed CAS');
      await db.activateAccountStorage(uidB);
      const b=await db.getPlainWorkspace();
      if(b?.payload.customers[0].id!=='B')
        throw new Error('Account B data was overwritten by A');
      return {accountIsolation:true,atomicCAS:true,accountB:b.payload.company.nameEn};
    })().catch(e=>({error:String(e?.stack||e)}))`,
    awaitPromise:true,returnByValue:true
  });
  const dbState=scoped.result?.value;
  assert.ok(dbState?.accountIsolation&&dbState?.atomicCAS,
    'Compiled IndexedDB account isolation failure: '+JSON.stringify(dbState));
  console.log('PASS real Chromium IndexedDB: separate Firebase UID caches and stale-write CAS');
}finally{
  cdp?.close();
  for(const child of childProcesses.reverse())if(child.exitCode===null)child.kill('SIGTERM');
  await sleep(750);
  for(const profile of profiles)await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:250});
}
