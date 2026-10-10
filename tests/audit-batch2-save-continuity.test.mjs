import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function draftFixture({deferredState=false,commercial=false}={}){
  const source=read(commercial?'dist/src/components/EditorPageCore.js':'src/components/DraftDocumentEditor.tsx');
  if(commercial)assert.match(source,/__lourexEditorDepartureSingleOwnerV539=true/);
  const methods=commercial?source.slice(source.indexOf('    handleVisibilityChange ='),source.indexOf('    unlockFinal =')):
    source.slice(source.indexOf('  private handlePreviewMedia='),source.indexOf('  private patchLetter='));
  const compiled=ts.transpileModule('class Harness {'+methods+'}\nexports.Harness=Harness;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const timers=[],updates=[],calls=[],outputs=[];
  const document={visibilityState:'visible'};
  const context={exports:{},Error,document,t:en=>en,IOS_WEBKIT:false,clearTimeout(){},validateDocument:()=>({}),attachmentBytes:()=>0,previewDocument:doc=>doc,
    window:{clearTimeout(){},setTimeout:fn=>{timers.push(fn);return timers.length;}}};
  vm.runInNewContext(compiled,context);
  const h=new context.exports.Harness();let closes=0;
  h.revision=0;h.editRevision=0;h.departureFlushQueued=false;h.saveInFlight=false;
  h.state={doc:{id:'synthetic',number:'DR-TEST',issueDate:'2026-10-10',value:'first',status:'draft'},saveState:'unsaved',saving:false,error:'',errors:{}};
  h.setState=(update,callback)=>{const run=()=>{h.state={...h.state,...(typeof update==='function'?update(h.state):update)};callback?.();};if(deferredState)updates.push(run);else run();};
  h.props={onSave:(doc,auto)=>new Promise((resolve,reject)=>calls.push({doc,auto,resolve,reject})),onClose:()=>{closes++;},onPrint:async(doc,mode)=>outputs.push({doc,mode})};
  return {h,calls,outputs,document,timers,closes:()=>closes,commit:()=>{while(updates.length)updates.shift()();}};
}

test('Draft autosave has a synchronous guard before React commits saving state',async()=>{
  const f=draftFixture({deferredState:true});const first=f.h.save(true),second=f.h.save(true);
  assert.equal(f.calls.length,1);f.commit();f.calls[0].resolve();await Promise.all([first,second]);f.commit();
  assert.equal(f.h.state.saveState,'saved');
});
test('Draft pagehide shares the active save instead of writing the same snapshot twice',async()=>{
  const f=draftFixture();const saving=f.h.save(true);f.h.handlePageHide();f.h.handlePageHide();
  assert.equal(f.calls.length,1);f.calls[0].resolve();await saving;
});
test('Draft hidden-page departure immediately persists changes made during a delayed save',async()=>{
  const f=draftFixture();const saving=f.h.save(true);
  f.h.state.doc={...f.h.state.doc,value:'latest'};f.h.revision++;f.h.state.saveState='unsaved';
  f.document.visibilityState='hidden';f.h.handleVisibilityChange();f.h.handlePageHide();
  f.calls[0].resolve();await saving;await tick();
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].doc.value,'latest');
  f.calls[1].resolve();await tick();assert.equal(f.h.state.saveState,'saved');
});
test('Draft failed save stays editable and departure can retry',async()=>{
  const f=draftFixture();const saving=f.h.save(true);f.h.handlePageHide();
  f.calls[0].reject(new Error('Synthetic storage failure'));await saving;
  assert.equal(f.h.state.saveState,'unsaved');assert.match(f.h.state.error,/storage failure/);
  f.h.handlePageHide();assert.equal(f.calls.length,2);f.calls[1].resolve();await tick();
  assert.equal(f.h.state.saveState,'saved');assert.equal(f.h.state.error,'');
});
for(const mode of ['pdf','share'])test('Draft '+mode+' never exports after persistence rejects',async()=>{
  const f=draftFixture();const output=f.h.output(mode);f.calls[0].reject(new Error('Synthetic save rejected'));await output;
  assert.equal(f.outputs.length,0);assert.equal(f.h.state.outputBusy,false);assert.equal(f.h.state.saveState,'unsaved');
});
test('Draft close persists the newer revision before closing',async()=>{
  const f=draftFixture();const closing=f.h.saveAndClose();
  f.h.state.doc={...f.h.state.doc,value:'latest'};f.h.revision++;
  f.calls[0].resolve();await tick();assert.equal(f.closes(),0);assert.equal(f.calls[1].doc.value,'latest');
  f.calls[1].resolve();await closing;assert.equal(f.closes(),1);
});
test('Draft close remains open after storage failure',async()=>{
  const f=draftFixture();const closing=f.h.saveAndClose();f.calls[0].reject(new Error('Synthetic close failure'));await closing;
  assert.equal(f.closes(),0);assert.equal(f.h.state.saveState,'unsaved');
});
test('compiled commercial editor serializes autosave and repeated departure events',async()=>{
  const f=draftFixture({commercial:true,deferredState:true});const saving=f.h.save(true);f.h.handlePageHide();f.h.handlePageHide();
  assert.equal(f.calls.length,1);f.commit();f.calls[0].resolve();await saving;f.commit();assert.equal(f.h.state.saveState,'saved');
});
test('compiled commercial editor flushes the latest edit immediately on hidden-page departure',async()=>{
  const f=draftFixture({commercial:true});const saving=f.h.save(true);
  f.h.state.doc={...f.h.state.doc,value:'latest'};f.h.editRevision++;f.h.state.saveState='unsaved';
  f.document.visibilityState='hidden';f.h.handleVisibilityChange();f.h.handlePageHide();
  f.calls[0].resolve();await saving;assert.equal(f.calls.length,2);assert.equal(f.calls[1].doc.value,'latest');
  f.calls[1].resolve();await tick();assert.equal(f.h.state.saveState,'saved');
});
test('compiled commercial editor stays open and dirty after close-save failure',async()=>{
  const f=draftFixture({commercial:true});const closing=f.h.saveAndClose();f.calls[0].reject(new Error('Synthetic close failure'));await closing;
  assert.equal(f.closes(),0);assert.equal(f.h.state.saveState,'unsaved');assert.match(f.h.state.errors.global,/close failure/);
});
test('compiled commercial issuance cannot output a PDF after final-save failure',async()=>{
  const f=draftFixture({commercial:true});f.h.state.reviewMode='pdf';const issuing=f.h.issueAndContinue();
  f.calls[0].reject(new Error('Synthetic issuance failure'));await issuing;
  assert.equal(f.outputs.length,0);assert.equal(f.h.state.doc.status,'draft');assert.equal(f.h.state.issuing,false);
});

const workspaceKey='lourex-last-stable-workspace-v340';
const editorKey='lourex-active-editor-v486';
const accountKey='lourex-invoice-active-account-v1';
function continuityFixture(target,{editorResume=false}={}){
  const frames=[],timers=[],listeners={},clicks=[],session=new Map([[workspaceKey,target]]),local=new Map([[accountKey,'account-A']]);
  let current='home',auth=false,observer;
  if(editorResume)session.set(editorKey,JSON.stringify({id:'synthetic-doc',number:'DR-TEST',accountUid:'account-A',savedAt:Date.now()}));
  class Element{}
  class HTMLElement extends Element{}
  class Button extends HTMLElement{
    disabled=false;
    constructor(screen){super();this.screen=screen;}
    click(){if(this.disabled)return;clicks.push(this.screen);current=this.screen;}
  }
  const buttons=['reports','receivables','home','operations','customers','documents','items'].map(screen=>new Button(screen));
  const root={dataset:{},hasAttribute:()=>false,getAttribute:()=>null};
  const shell=new HTMLElement();shell.classList={contains:name=>name==='screen-'+current};
  const document={documentElement:root,addEventListener(){},querySelectorAll:()=>buttons,
    querySelector:selector=>{
      if(selector==='.ta-shell')return current?shell:null;
      if(selector==='.auth-page')return auth?{}:null;
      const match=selector.match(/data-lourex-workspace="([a-z]+)"/);
      return match?buttons.find(button=>button.screen===match[1]):null;
    }};
  const window={addEventListener:(name,fn)=>{listeners[name]=fn;},setTimeout:fn=>{timers.push(fn);return timers.length;}};
  const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
  vm.runInNewContext(read('public/editor-stability-v338.js'),{document,window,navigator:{},Element,HTMLElement,HTMLButtonElement:Button,
    sessionStorage:storage(session),localStorage:storage(local),requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}}});
  const flush=()=>{let budget=50;while(frames.length&&budget-->0)frames.shift()();assert.ok(budget>0,'continuity must settle without an endless click loop');};
  return {clicks,session,local,root,buttons,flush,change(screen){current=screen;auth=!screen;observer();flush();},resume(){listeners.pageshow();flush();},current:()=>current};
}
for(const target of ['documents','customers','items','operations','receivables','reports'])test('workspace '+target+' restores by identity after sidebar reorder',()=>{
  const f=continuityFixture(target);f.flush();assert.equal(f.current(),target);assert.deepEqual(f.clicks,[target]);
});
test('disabled recovery destination waits without clicking a different workspace',()=>{
  const f=continuityFixture('operations');const button=f.buttons.find(item=>item.screen==='operations');button.disabled=true;
  f.flush();assert.equal(f.clicks.length,0);button.disabled=false;f.change('home');assert.equal(f.current(),'operations');
});
test('PIN shell replacement restores the last workspace, and sign-out clears continuity',()=>{
  const f=continuityFixture('receivables');f.flush();f.change(null);f.change('home');assert.equal(f.current(),'receivables');
  f.root.dataset.lourexSigningOut='true';f.change('home');assert.equal(f.session.has(workspaceKey),false);assert.equal(f.session.has(editorKey),false);
});
test('editor recovery revalidates account after asynchronous sign-in changes identity',()=>{
  const f=continuityFixture('home',{editorResume:true});f.local.set(accountKey,'account-B');f.flush();
  assert.equal(f.clicks.length,0);assert.equal(f.session.has(editorKey),false);
});
test('both continuity owners resolve the same stable identity and ignore disabled or unknown destinations',()=>{
  const source=read('public/runtime-safety-v334.js');
  const start=source.indexOf('  function navigationButtonFor('),end=source.indexOf('  function installWorkspaceContinuity(',start);
  const requests=[];class Button{disabled=false;}
  const button=new Button();
  const context={WORKSPACE_ORDER:['home','documents','customers','items','operations','receivables','reports'],HTMLButtonElement:Button,
    document:{querySelector:selector=>{requests.push(selector);return button;}}};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(context.navigationButtonFor('operations'),button);
  assert.equal(requests[0],'.ta-sidebar-nav .ta-nav-item[data-lourex-workspace="operations"]');
  button.disabled=true;assert.equal(context.navigationButtonFor('operations'),null);
  assert.equal(context.navigationButtonFor('unknown'),null);assert.equal(requests.length,2);
});
test('AppShell renders the actual destination identity independently of labels and order',()=>{
  const source=read('src/components/AppShell.tsx');
  const start=source.indexOf('  private navItem='),end=source.indexOf('  private ',start+20);
  const compiled=ts.transpileModule('class Harness {'+source.slice(start,end)+'}\nexports.Harness=Harness;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}
  }).outputText;
  const context={exports:{},React:{createElement:(type,props,...children)=>({type,props,children})},Icon:()=>null};
  vm.runInNewContext(compiled,context);const h=new context.exports.Harness();h.props={screen:'operations'};
  const destinations=[];h.navigate=screen=>destinations.push(screen);
  const rendered=h.navItem('operations','backup','المشتريات');
  assert.equal(rendered.props['data-lourex-workspace'],'operations');rendered.props.onClick();assert.deepEqual(destinations,['operations']);
});
