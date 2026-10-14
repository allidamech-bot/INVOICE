// Real Chromium DOM regression of the final compiled LOUREX AI scroll follower.
// Local ephemeral fixture only: no Firebase login, business data or deployment.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,limit=30000){
  const stop=Date.now()+limit;
  while(Date.now()<stop){try{const r=await fn();if(r)return r;}catch{}await wait(250);}
  throw new Error('Timed out waiting for Chromium or fixture');
}
const browser=['google-chrome','google-chrome-stable','chromium','chromium-browser'].find(name=>{
  try{execFileSync(name,['--version'],{stdio:'ignore'});return true;}catch{return false;}
});
assert.ok(browser,'Chromium is required for AI chat browser regression');
const profile=await mkdtemp(join(tmpdir(),'lourex-ai-chat-'));
const processes=[];
let socket;
const filename='__lourex_ai_chat_scroll_qa__.html';
try{
  await writeFile('dist/'+filename,'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI chat scroll test</title></head><body></body></html>');
  const server=spawn(process.execPath,['./node_modules/http-server/bin/http-server','dist','-p','4181','-a','127.0.0.1','-c-1'],{stdio:'ignore'});
  processes.push(server);
  await until(async()=>{const r=await fetch('http://127.0.0.1:4181/'+filename);return r.ok;},12000);
  const chrome=spawn(browser,[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,
    'about:blank'
  ],{stdio:'ignore'});
  processes.push(chrome);
  const port=await until(async()=>{
    const s=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];
    return Number(s)>0?Number(s):0;
  });
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=pages.find(row=>row.type==='page'&&row.webSocketDebuggerUrl);
  assert.ok(target,'Could not connect to Chromium page');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  const pending=new Map();
  let next=0;
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',()=>reject(new Error('CDP WebSocket failed')),{once:true});
  });
  socket.addEventListener('message',event=>{
    const packet=JSON.parse(String(event.data));
    if(!packet.id)return;
    const job=pending.get(packet.id);
    if(!job)return;
    pending.delete(packet.id);clearTimeout(job.timer);
    if(packet.error)job.reject(new Error(packet.error.message));
    else job.resolve(packet.result||{});
  });
  const cmd=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timed out'));},16000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params}));
  });
  await cmd('Page.enable');await cmd('Runtime.enable');
  for(const {width,height,mobile,name} of [
    {width:390,height:844,mobile:true,name:'iPhone'},
    {width:820,height:1180,mobile:true,name:'iPad'}
  ]){
    await cmd('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
    await cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile});
    await cmd('Page.navigate',{url:'http://127.0.0.1:4181/'+filename});
    await until(async()=>{
      const p=await cmd('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
      return p.result?.value==='complete';
    },10000);
    const expression=`(async()=>{
      const {attachAiChatScrollFollower}=await import('/src/lib/ai-chat-scroll.js');
      const box=document.createElement('div');
      box.className='lourex-ai-messages';
      Object.assign(box.style,{height:'220px',width:'320px',display:'block',overflowY:'auto',overflowX:'hidden',position:'relative'});
      const first=document.createElement('div');
      first.style.height='1300px';first.textContent='Existing history';
      box.append(first);document.body.append(box);
      const pause=()=>new Promise(resolve=>setTimeout(resolve,140));
      const bottom=()=>box.scrollHeight-box.clientHeight-box.scrollTop;
      const follower=attachAiChatScrollFollower(box);
      await pause();
      if(bottom()>3)throw new Error('Initial history did not follow to bottom: '+bottom());
      first.style.height='1460px'; // Late layout expansion, no new message.
      await pause();
      if(bottom()>3)throw new Error('Late PDF-like layout resize did not follow: '+bottom());
      box.scrollTop=180; // User intentionally reads an older turn.
      await pause();
      const before=box.scrollTop;
      const reply=document.createElement('div');reply.style.height='180px';reply.textContent='Incoming message';
      box.append(reply);
      await pause();
      if(Math.abs(box.scrollTop-before)>3)throw new Error('Incoming reply hijacked manual scrollback: '+before+' -> '+box.scrollTop);
      follower.followNewMessage(); // The user sends their next message.
      await pause();
      if(bottom()>3)throw new Error('New outgoing user message did not return to latest reply: '+bottom());
      const more=document.createElement('div');more.style.height='160px';more.textContent='Streaming response';
      box.append(more);await pause();
      if(bottom()>3)throw new Error('Incoming answer no longer followed: '+bottom());
      follower.disconnect();
      box.scrollTop=0;await pause();
      const after=document.createElement('div');after.style.height='100px';box.append(after);
      await pause();
      if(box.scrollTop>3)throw new Error('Disconnected observer continued to force scroll: '+box.scrollTop);
      box.remove();
      return {ok:true,width:innerWidth,finalScrollAfterDisconnect:box.scrollTop};
    })().catch(error=>({error:String(error?.stack||error)}))`;
    const result=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    const value=result.result?.value;
    assert.ok(value?.ok,name+' real browser scroll regression failed: '+JSON.stringify(value));
    assert.equal(value.width,width,name+' must run at its intended CSS viewport, not the default mobile 980px layout');
    console.log('PASS '+name+' real compiled scroll follower: '+JSON.stringify(value));
  }
}finally{
  socket?.close();
  for(const p of processes.reverse())if(p.exitCode===null)p.kill('SIGTERM');
  await wait(500);
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:250});
  await rm('dist/'+filename,{force:true});
}
