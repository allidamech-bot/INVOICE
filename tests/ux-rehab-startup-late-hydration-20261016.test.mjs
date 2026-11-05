import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/startup-watchdog-v321.js','utf8');

function fixture(){
  let ready=false,dirty=false,timeout;
  const events=[];
  class Element{
    constructor(){this.children=[];}
    appendChild(node){this.children.push(node);node.parent=this;}
    removeChild(node){const i=this.children.indexOf(node);if(i<0)throw new Error('NotFoundError');this.children.splice(i,1);}
    querySelector(){return null;}
  }
  const root=new Element(),screen=new Element(),reactLogo=new Element(),body=new Element();
  root.querySelector=()=>ready?null:screen;
  screen.appendChild(reactLogo);root.appendChild(screen);body.appendChild(root);
  const document={
    body,visibilityState:'visible',
    documentElement:{hasAttribute:()=>dirty},
    getElementById:id=>id==='root'?root:null,
    querySelector:selector=>selector.startsWith('.app-ui')?(ready?new Element():null):null
  };
  vm.runInNewContext(source,{
    document,HTMLElement:Element,navigator:{onLine:true},
    window:{setTimeout:fn=>{timeout=fn;},__LOUREX_DIAGNOSTICS__:{mark:(kind,detail)=>events.push({kind,detail})}}
  });
  return {
    root,screen,reactLogo,body,events,
    timeout:()=>timeout(),
    finish(){screen.removeChild(reactLogo);root.removeChild(screen);ready=true;},
    dirty(){dirty=true;}
  };
}

test('slow startup telemetry preserves React host nodes without an overlay',()=>{
  const f=fixture();f.timeout();
  assert.deepEqual(f.screen.children,[f.reactLogo],'watchdog cannot touch React-owned children');
  assert.deepEqual(f.body.children,[f.root],'no customer-facing sibling overlay');
  assert.equal(f.events.length,1,'timeout remains recorded privately');
  assert.doesNotThrow(()=>f.finish(),'late React host removal must not throw NotFoundError');
  assert.deepEqual(f.body.children,[f.root]);
});

test('startup telemetry never masks an editable workspace or navigates',()=>{
  const f=fixture();f.dirty();f.timeout();
  assert.deepEqual(f.events,[]);
  assert.deepEqual(f.body.children,[f.root]);
});
