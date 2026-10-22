import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const bootstrap=readFileSync('public/theme-bootstrap-v347.js','utf8');

function createFixture(){
  let onDomReady,childClass='loading-screen',domObserver=null,disconnected=false,observed=null;
  const props=new Map();
  const root={
    dataset:{},
    style:{
      setProperty:(key,value)=>props.set(key,value),
      removeProperty:key=>props.delete(key)
    }
  };
  const meta={setAttribute:(name,value)=>props.set('meta-'+name,value)};
  const mount={querySelector:selector=>selector===':scope > .loading-screen'?(childClass==='loading-screen'?{}:null):(selector.includes('.'+childClass)?{}:null)};
  const document={
    documentElement:root,
    querySelector:selector=>selector==='meta[name="theme-color"]'?meta:null,
    getElementById:id=>id==='root'?mount:null,
    addEventListener:(type,handler)=>{if(type==='DOMContentLoaded')onDomReady=handler;}
  };
  class MutationObserver{
    constructor(callback){this.callback=callback;}
    observe(target,options){if(target===mount){domObserver=this;observed=options;}}
    disconnect(){disconnected=true;}
  }
  vm.runInNewContext(bootstrap,{
    document,MutationObserver,localStorage:{getItem:()=> 'dark'},
    matchMedia:()=>({matches:true})
  });
  onDomReady();
  return{
    root,props,
    options:()=>observed,
    disconnected:()=>disconnected,
    changeClass:(next)=>{childClass=next;domObserver.callback();}
  };
}

test('boot-state cleanup observes React reusing the loading node via a class-only mutation',()=>{
  const f=createFixture();
  assert.equal(f.root.dataset.lourexBooting,'true');
  assert.equal(f.props.get('--boot-bg'),'#0a1826');
  assert.equal(f.options().childList,true);
  assert.equal(f.options().subtree,true);
  assert.equal(f.options().attributes,true);
  assert.deepEqual(Array.from(f.options().attributeFilter),['class']);
  assert.equal(f.disconnected(),false);
  f.changeClass('app-ui');
  assert.equal(f.root.dataset.lourexBooting,undefined,'the UI may never inherit locked startup overflow');
  assert.equal(f.props.has('--boot-bg'),false);
  assert.equal(f.disconnected(),true);
});

test('unrelated class mutations must not release boot while the real loader remains',()=>{
  const f=createFixture();
  f.changeClass('loading-screen');
  assert.equal(f.root.dataset.lourexBooting,'true');
  assert.equal(f.disconnected(),false);
  f.changeClass('auth-page');
  assert.equal(f.root.dataset.lourexBooting,undefined);
  assert.equal(f.disconnected(),true);
});
