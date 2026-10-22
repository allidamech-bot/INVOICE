import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/theme-bootstrap-v347.js','utf8');
function boot(initial='loading'){
  let surface=initial,domReady=null;const observers=[];
  const styles=new Map(),metadata={};
  const documentElement={
    dataset:{},
    style:{
      setProperty:(key,value)=>styles.set(key,value),
      removeProperty:(key)=>styles.delete(key),
      colorScheme:'',backgroundColor:''
    }
  };
  const mount={
    querySelector(selector){
      if(selector===':scope > .loading-screen')return surface==='loading'?{className:'loading-screen'}:null;
      const live=['workspace-shell','ta-shell','ta-auth-page','auth-page','auth-recovery-state','app-recovery','app-recovery-screen','app-ui'];
      return live.some(name=>selector.includes('.'+name)&&surface===name)?{className:surface}:null;
    }
  };
  const document={
    documentElement,head:{},
    querySelector(selector){
      if(selector==='meta[name="theme-color"]')return{setAttribute:(key,value)=>metadata[key]=value};
      if(selector==='link[data-lourex-deferred-fonts="true"]')return{sheet:{},addEventListener(){},media:'all'};
      return null;
    },
    getElementById:id=>id==='root'?mount:null,
    addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')domReady=fn;}
  };
  class MutationObserver{
    constructor(callback){this.callback=callback;this.connected=false;observers.push(this);}
    observe(target,options){this.connected=true;this.target=target;this.options=options;}
    disconnect(){this.connected=false;}
    fire(){if(this.connected)this.callback();}
  }
  vm.runInNewContext(source,{document,localStorage:{getItem:()=> 'dark'},MutationObserver},{timeout:1500});
  assert.equal(typeof domReady,'function','must install DOMContentLoaded listener');
  domReady();
  return{
    set(next){surface=next;for(const o of [...observers])o.fire();},
    get booting(){return documentElement.dataset.lourexBooting;},
    get bootStyle(){return styles.get('--boot-bg');},
    get observers(){return observers;},
    get theme(){return metadata.content;}
  };
}
test('React first paint gap does not release startup lock or disconnect its observer',()=>{
  const page=boot('loading');
  assert.equal(page.booting,'true');
  assert.ok(page.bootStyle);
  page.set('empty');
  assert.equal(page.booting,'true','an empty React #root is not an authenticated app');
  assert.ok(page.bootStyle,'preserve boot background while first paint is absent');
  assert.equal(page.observers.at(-1).connected,true,'remain subscribed until real surface mounts');
  page.set('workspace-shell');
  assert.equal(page.booting,undefined,'real workspace releases boot lock');
  assert.equal(page.bootStyle,undefined);
  assert.equal(page.observers.at(-1).connected,false);
});
test('sign-in screen and signed-out account recovery each release the boot lock',()=>{
  for(const surface of ['ta-auth-page','auth-recovery-state','app-recovery']){
    const page=boot('loading');
    page.set('empty');assert.equal(page.booting,'true');
    page.set(surface);
    assert.equal(page.booting,undefined,surface+' must release lock');
    assert.equal(page.theme,'#0a1826');
  }
});
test('loading transitions and unrelated root children never impersonate mounted workspace',()=>{
  const page=boot('loading');
  page.set('loading');assert.equal(page.booting,'true');
  page.set('unknown');assert.equal(page.booting,'true');
  page.set('loading');assert.equal(page.booting,'true');
  page.set('ta-shell');assert.equal(page.booting,undefined);
});
