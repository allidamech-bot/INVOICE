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
    const pending=new Map();
    let nextId=0,opened=false;
    socket.addEventListener('error',()=>{if(!opened)reject(new Error('Chrome DevTools WebSocket failed.'));});
    socket.addEventListener('open',()=>{
      opened=true;
      resolve({
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
      if(!message.id)return;
      const task=pending.get(message.id);
      if(!task)return;
      clearTimeout(task.timeout);pending.delete(message.id);
      if(message.error)task.no(new Error(message.error.message||'CDP request failed'));
      else task.ok(message.result||{});
    });
  });
}

const profile=await mkdtemp(join(tmpdir(),'lourex-qa-chrome-'));
const childProcesses=[];
let cdp;
try{
  const server=spawn(process.execPath,['./node_modules/http-server/bin/http-server','dist','-p','4173','-a','127.0.0.1','-c-1'],{stdio:'ignore'});
  childProcesses.push(server);
  await waitUntil(async()=>{
    const res=await fetch('http://127.0.0.1:4173/index.html');
    return res.ok;
  },10000,'local production build web server');
  const chrome=spawn(browserBinary(),[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  childProcesses.push(chrome);
  const portFile=join(profile,'DevToolsActivePort');
  const address=await waitUntil(async()=>{
    const lines=(await readFile(portFile,'utf8')).trim().split('\n');
    return lines[0]&&Number(lines[0])>0?Number(lines[0]):0;
  },30000,'Chrome DevTools port');
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
        expression:'JSON.stringify({ready:document.readyState,root:!!document.getElementById("root"),boot:!!document.getElementById("lourex-boot"),loading:!!document.querySelector(".loading-screen"),buttons:document.querySelectorAll("#root button").length,rootText:(document.getElementById("root")?.innerText||"").slice(0,240),horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)-document.documentElement.clientWidth,viewport:document.documentElement.clientWidth})',
        returnByValue:true
      });
      const value=response.result?.value;
      if(!value)return null;
      const state=JSON.parse(value);
      return state.ready==='complete'&&!state.boot&&!state.loading&&state.root&&state.buttons>0?state:null;
    },25000,item.name+' render beyond boot screen');
    assert.ok(state.root,'React application root must exist.');
    assert.ok(!state.boot&&!state.loading,'Startup must leave all loading screens.');
    assert.ok(state.buttons>0,'Application must expose actual interactive controls.');
    assert.ok(state.viewport>0,'Viewport width must be measurable.');
    assert.ok(state.horizontalOverflow<=4,item.name+' has '+state.horizontalOverflow+'px page-level horizontal overflow.');
    console.log('PASS '+item.name+': viewport='+state.viewport+', horizontalOverflow='+state.horizontalOverflow+', rendered='+JSON.stringify(state.rootText.slice(0,110)));
  }
}finally{
  cdp?.close();
  for(const child of childProcesses.reverse())if(child.exitCode===null)child.kill('SIGTERM');
  await sleep(750);
  await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:250});
}
