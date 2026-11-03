import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/startup-watchdog-v321.js','utf8');
function fixture(){
  let ready=false,dirty=false,timeout,notify,observed,disconnected=false;
  class Element{
    constructor(){this.style={};this.dataset={};this.children=[];this.listeners={};}
    setAttribute(){}
    addEventListener(k,fn){this.listeners[k]=fn;}
    append(...xs){xs.forEach(x=>this.appendChild(x));}
    appendChild(x){this.children.push(x);x.parent=this;}
    remove(){this.parent?.removeChild(this);}
    removeChild(x){const i=this.children.indexOf(x);if(i<0)throw new Error('NotFoundError');this.children.splice(i,1);}
    replaceChildren(...xs){this.children=[];this.append(...xs);}
  }
  const root=new Element(),screen=new Element(),reactLogo=new Element(),body=new Element();
  root.querySelector=()=>ready?null:screen;
  screen.appendChild(reactLogo);root.appendChild(screen);body.appendChild(root);
  const document={body,visibilityState:'visible',documentElement:{dataset:{},hasAttribute:()=>dirty},
    getElementById:id=>id==='root'?root:body.children.find(x=>x.id===id)||null,createElement:()=>new Element(),
    querySelector:s=>s.startsWith('.app-ui')?(ready?new Element():null):null};
  const context={document,HTMLElement:Element,navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},
    MutationObserver:class{constructor(fn){notify=fn;}observe(_target,options){observed=options;}disconnect(){disconnected=true;}},
    window:{setTimeout:fn=>{timeout=fn;},location:{href:'https://qa.invalid/'}}};
  vm.runInNewContext(source,context);
  return {root,screen,reactLogo,body,timeout,finish(){
    // Model React's retained host references during a loading -> workspace commit.
    screen.removeChild(reactLogo);root.removeChild(screen);ready=true;notify?.();
  },finishByClass(){ready=true;if(observed?.attributes&&observed?.attributeFilter?.includes('class'))notify?.();},dirty(){dirty=true;notify?.();},get disconnected(){return disconnected;}};
}
test('slow startup recovery preserves React host nodes and disappears on late hydration',()=>{
  const f=fixture();f.timeout();
  assert.deepEqual(f.screen.children,[f.reactLogo],'watchdog must preserve React-owned child identity');
  assert.equal(f.body.children.length,2,'recovery is a sibling of the React root');
  assert.doesNotThrow(()=>f.finish(),'late React host removal must not throw NotFoundError');
  assert.deepEqual(f.body.children,[f.root]);assert.equal(f.disconnected,true);
});
test('startup recovery disappears when an editable workspace opens and never navigates automatically',()=>{
  const f=fixture();f.timeout();f.dirty();
  assert.deepEqual(f.body.children,[f.root]);assert.equal(f.disconnected,true);
});
test('recovery overlay releases when React reuses the loading element and changes only its class',()=>{
  const f=fixture();f.timeout();assert.equal(f.body.children.length,2);
  f.finishByClass();
  assert.deepEqual(f.body.children,[f.root],'A ready app must not remain covered by the startup recovery overlay');
  assert.equal(f.disconnected,true);
});
