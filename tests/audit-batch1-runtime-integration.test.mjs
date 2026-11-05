import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const watchdog=read('public/startup-watchdog-v321.js');

// The watchdog retains private metadata but never inserts customer-facing UI.
function startupFixture({editor=false,ready=false}={}){
  const attrs=new Set(),navigation=[],timers=[],events=[],bodyChildren=[];
  if(editor)attrs.add('data-lourex-document-editor');
  class Element {
    querySelector(){return null;}
  }
  const loading=new Element();
  const document={
    body:{appendChild:node=>bodyChildren.push(node)},
    documentElement:{hasAttribute:key=>attrs.has(key)},
    getElementById:id=>id==='root'?{querySelector:()=>ready?null:loading}:null,
    querySelector:selector=>selector==='.app-ui,.auth-page,.ta-auth-page,.app-recovery,.app-recovery-screen'&&ready?{}:null
  };
  const window={
    addEventListener(){},
    setTimeout:fn=>timers.push(fn),
    location:{href:'https://example.test/',replace:url=>navigation.push(url)},
    __LOUREX_DIAGNOSTICS__:{mark:(kind,detail)=>events.push({kind,detail})}
  };
  vm.runInNewContext(watchdog,{window,document,HTMLElement:Element,navigator:{onLine:true}});
  assert.equal(timers.length,2,'watchdog installs telemetry and a static retry fallback');
  timers[0]();
  return {navigation,events,bodyChildren};
}

test('stalled startup emits internal telemetry without covering customers or navigating',()=>{
  const f=startupFixture();
  assert.deepEqual(f.navigation,[]);
  assert.deepEqual(f.bodyChildren,[]);
  assert.equal(f.events.length,1);
  assert.equal(f.events[0].kind,'startup-watchdog-timeout');
  assert.equal(f.events[0].detail,'automaticReload=no customerOverlay=no');
});
test('active editor bypasses the startup timeout without disturbing work',()=>{
  const f=startupFixture({editor:true});
  assert.deepEqual(f.events,[]);
  assert.deepEqual(f.navigation,[]);
  assert.deepEqual(f.bodyChildren,[]);
});
test('completed startup never displays timeout recovery',()=>{
  const f=startupFixture({ready:true});
  assert.deepEqual(f.events,[]);
  assert.deepEqual(f.navigation,[]);
  assert.deepEqual(f.bodyChildren,[]);
});

const safety=read('public/runtime-safety-v334.js');
// Run the existing first runtime-safety IIFE; the second IIFE is diagnostics.
const boundary=safety.indexOf('})();');
assert.ok(boundary>0);
function signoutFixture(){
  const attrs=new Set(),listeners=[];
  class Element{closest(){return null;}}
  class Button extends Element{disabled=false;closest(selector){return selector.includes('.settings-direct-signout-button')?this:null;}}
  const button=new Button();
  const document={documentElement:{hasAttribute:key=>attrs.has(key),dataset:{}},querySelector:()=>null,
    addEventListener:(name,fn)=>{if(name==='click')listeners.push(fn);}};
  const window={addEventListener(){},setTimeout(){},clearTimeout(){}};
  const storage={getItem:()=>null,removeItem(){},setItem(){}};
  vm.runInNewContext(safety.slice(0,boundary+5),{document,window,Element,HTMLElement:Element,HTMLButtonElement:Button,sessionStorage:storage,localStorage:storage});
  return {attrs,button,click(){const event={target:button,blocked:false,stopped:false,preventDefault(){this.blocked=true;},stopImmediatePropagation(){this.stopped=true;}};for(const listener of listeners)listener(event);return event;}};
}
test('runtime sign-out remains available when account dialog has no editable work',()=>{
  const f=signoutFixture();assert.equal(f.click().blocked,false);
});
for(const attribute of ['data-lourex-document-editor','data-lourex-workspace-dirty']){
  test('runtime sign-out blocks '+attribute+' before downstream account handlers',()=>{
    const f=signoutFixture();f.attrs.add(attribute);const result=f.click();
    assert.equal(result.blocked,true);assert.equal(result.stopped,true);
  });
}

function methodFixture(path,start,end,globals){
  const source=read(path),from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,'actual component method must be present');
  const compiled=ts.transpileModule('class Harness {'+source.slice(from,to)+'}\nexports.Harness=Harness;',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const context={exports:{},...globals};vm.runInNewContext(compiled,context);
  const harness=new context.exports.Harness();
  harness.setState=update=>{harness.state={...harness.state,...(typeof update==='function'?update(harness.state):update)};};
  return harness;
}
test('auth mode change cannot clear pending linking or passwords during a busy request',()=>{
  let clears=0;
  const h=methodFixture('src/components/AccountEntryScreen.tsx','  private setMode=','  private modeKeyDown=',{
    clearPendingGoogleLink:()=>{clears++;},window:{requestAnimationFrame(){}},document:{}
  });
  h.state={busy:true,mode:'signin',password:'synthetic-password',googleLinkPending:true};
  h.setMode('create');assert.equal(h.state.mode,'signin');assert.equal(h.state.password,'synthetic-password');assert.equal(clears,0);
  h.state.busy=false;h.setMode('create');assert.equal(h.state.mode,'create');assert.equal(h.state.password,'');assert.equal(clears,1);
});
function logoFixture(){
  let resolve;
  const result=new Promise(done=>{resolve=done;});
  const h=methodFixture('src/components/SettingsModal.tsx','  private editLogoManually=','  private rebuildLogo=',{
    openManualBackgroundEditor:()=>result,t:english=>english
  });
  h.assetPreparationId=0;h.props={open:true};h.state={busy:false,cleaningAssets:false,logoOriginalDataUrl:'data:image/png;base64,original',company:{logoDataUrl:'data:image/png;base64,original'}};
  return {h,resolve};
}
test('cancelled manual logo cleanup preserves the original artwork',async()=>{
  const f=logoFixture(),task=f.h.editLogoManually();f.resolve('data:image/png;base64,original');await task;
  assert.equal(f.h.state.company.logoDataUrl,'data:image/png;base64,original');assert.equal(f.h.state.cleaningAssets,false);
});
test('a late manual editor result cannot change a closed settings surface',async()=>{
  const f=logoFixture(),task=f.h.editLogoManually();f.h.props.open=false;f.resolve('data:image/png;base64,edited');await task;
  assert.equal(f.h.state.company.logoDataUrl,'data:image/png;base64,original');
});
test('manual cleanup creates a reviewable draft without calling persistence',async()=>{
  const f=logoFixture();let saves=0;f.h.props.onSave=()=>{saves++;};
  const task=f.h.editLogoManually();f.resolve('data:image/png;base64,edited');await task;
  assert.equal(f.h.state.company.logoDataUrl,'data:image/png;base64,edited');assert.equal(f.h.state.logoMode,'rebuild');assert.equal(f.h.state.savedSection,null);assert.equal(saves,0);
});
