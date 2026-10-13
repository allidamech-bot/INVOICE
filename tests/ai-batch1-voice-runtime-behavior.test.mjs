import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('built iOS voice composer hands off microphone in both directions and clears stale listening status',t=>{
  const path=new URL('../dist/ai-composer-v449.js',import.meta.url);
  if(!existsSync(path))return t.skip('Build first: npm run build');
  let code=readFileSync(path,'utf8');
  assert.match(code,/ios-release-v3-cross-owner/);
  // Build postprocessors may append additional closures; instrument the canonical source IIFE, not the last one.
  const last=code.indexOf('\n})();');
  assert.ok(last>=0,'canonical composer IIFE terminator missing');
  code=code.slice(0,last+1)+"window.__voiceProbe={toggleVoice,abortVoice,recognition:()=>recognition,release:()=>nativeReleaseUntil};\n"+code.slice(last+1);
  class ElementStub{
    constructor(){
      this.dataset={};this.isConnected=true;
      const names=new Set();
      this.classList={toggle:(name,on)=>on?names.add(name):names.delete(name),remove:(...items)=>items.forEach(name=>names.delete(name)),contains:name=>names.has(name)};
    }
    querySelector(){return null;}querySelectorAll(){return [];}getAttribute(){return null;}setAttribute(name,value){this[name]=value;}
  }
  class ButtonStub extends ElementStub{}
  class InputStub extends ElementStub{
    constructor(){super();this.value='';this.maxLength=6000;}
    dispatchEvent(){}
  }
  const status=new ElementStub(),mic=new ButtonStub(),input=new InputStub(),panel=new ElementStub();
  status.querySelector=()=>({textContent:''});
  panel.querySelector=selector=>({
    '.lourex-ai-voice-status':status,
    '.lourex-ai-composer-mic':mic,
    '.lourex-ai-compose form>input':input
  })[selector]||null;
  let clock=100000,nextTimer=0,workflowActive=false,workflowLease=0;
  const timers=new Map(),listeners=new Map();
  class FakeEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}}
  class SpeechStub{
    static instances=[];
    constructor(){this.aborted=false;SpeechStub.instances.push(this);}
    start(){this.onstart?.();}
    stop(){}
    abort(){this.aborted=true;}
  }
  const win={
    SpeechRecognition:SpeechStub,
    addEventListener:(type,handler)=>{const list=listeners.get(type)||[];list.push(handler);listeners.set(type,list);},
    dispatchEvent:event=>{for(const handler of listeners.get(event.type)||[])handler(event);},
    requestAnimationFrame:()=>1,
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{at:clock+ms,fn});return id;},
    clearTimeout:id=>timers.delete(id)
  };
  const doc={
    documentElement:new ElementStub(),
    querySelector:selector=>selector==='#lourex-ai-panel'?panel:null,
    getElementById:id=>id==='lourex-ai-panel'?panel:null,
    addEventListener(){}
  };
  const microtasks=[];
  const context={
    window:win,document:doc,
    queueMicrotask:fn=>microtasks.push(fn),
    navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit'},
    MutationObserver:class{observe(){}},
    HTMLElement:ElementStub,HTMLButtonElement:ButtonStub,HTMLInputElement:InputStub,
    CustomEvent:FakeEvent,Event:FakeEvent,Node:ElementStub,Element:ElementStub,
    Date:{now:()=>clock}
  };
  runInNewContext(code,context,{timeout:3000});
  for(let n=0;microtasks.length&&n<30;n++)microtasks.shift()();
  assert.equal(microtasks.length,0,'voice runtime microtasks must settle');
  assert.ok(win.__voiceProbe,'runtime voice probe failed');
  win.__voiceProbe.toggleVoice(panel);
  assert.equal(SpeechStub.instances.length,1);
  assert.equal(status.dataset.state,'listening');
  assert.equal(mic['aria-pressed'],'true');
  const toWorkflow={active:false,readyAt:0};
  win.dispatchEvent(new FakeEvent('lourex-ai-workflow-voice-request',{detail:toWorkflow}));
  assert.equal(toWorkflow.active,true);
  assert.equal(SpeechStub.instances[0].aborted,true);
  assert.equal(status.dataset.state,'','workflow handoff must clear stale listening status');
  assert.equal(mic['aria-pressed'],'false');
  assert.ok(toWorkflow.readyAt>clock,'native release lease must be respected');

  workflowActive=true;workflowLease=clock+2200;
  win.addEventListener('lourex-ai-composer-voice-request',event=>{
    if(workflowActive){workflowActive=false;event.detail.active=true;}
    event.detail.readyAt=workflowLease;
  });
  win.__voiceProbe.toggleVoice(panel);
  assert.equal(status.dataset.state,'starting');
  assert.equal(SpeechStub.instances.length,1,'composer cannot reclaim the native microphone early');
  for(let attempts=0;timers.size&&attempts<20&&SpeechStub.instances.length<2;attempts++){
    const [id,row]=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];
    timers.delete(id);clock=row.at;row.fn();
  }
  assert.equal(SpeechStub.instances.length,2,'composer must restart once workflow releases native microphone');
  assert.ok(clock>=workflowLease,'restarted before workflow lease expiry');
  assert.equal(status.dataset.state,'listening');
  assert.equal(mic['aria-pressed'],'true');
  win.__voiceProbe.abortVoice();
  assert.equal(SpeechStub.instances[1].aborted,true,'close/unmount must release the active recognition');
  assert.equal(status.dataset.state,'','close/unmount must clear the listening UI');
  assert.equal(mic['aria-pressed'],'false');
});
