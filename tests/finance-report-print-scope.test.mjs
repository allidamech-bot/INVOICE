import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Exercise actual compiled lifecycle and print methods without a browser,
// workspace, PDF, or any customer data. Imports are intentionally mocked.
function reportHarness(path,componentName,printClass){
  const source=readFileSync(path,'utf8')
    .replace(/^import .*;\s*$/gm,'')
    .replace(new RegExp('export class '+componentName+'\\b'),'class '+componentName);
  const compiled=ts.transpileModule(source,{fileName:path,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React
  }}).outputText;
  const bodyClasses=new Set(),queue=new Map();
  let currentUid='account-one',serial=0,printCalls=0,throwOnPrint=false;
  const sandbox={
    React:{Component:class {
      constructor(props){this.props=props;}
      setState(delta){const previousState=this.state,previousProps=this.props;
        this.state={...this.state,...delta};
        this.componentDidUpdate?.(previousProps,previousState);
      }
    }},
    todayIso:()=> '2026-10-24',
    activeAccountStorageUid:()=>currentUid,
    document:{body:{classList:{
      add:value=>bodyClasses.add(value),remove:value=>bodyClasses.delete(value),
      contains:value=>bodyClasses.has(value)
    }}},
    window:{
      addEventListener:()=>{},removeEventListener:()=>{},
      setTimeout:callback=>{const id=++serial;queue.set(id,callback);return id;},
      clearTimeout:id=>queue.delete(id),
      print:()=>{printCalls++;if(throwOnPrint)throw new Error('print unavailable');}
    }
  };
  const Component=runInNewContext(compiled+'\n'+componentName+';',sandbox,{filename:path});
  const props={company:{nameEn:'Company A'},documents:[],payments:[],customers:[],suppliers:[],purchases:[],items:[]};
  const instance=new Component(props);
  const runQueued=()=>{for(const [id,fn] of [...queue]){queue.delete(id);fn();}};
  return {
    instance,runQueued,
    queueSize:()=>queue.size,
    bodyArmed:()=>bodyClasses.has(printClass),
    printCalls:()=>printCalls,
    setUid:uid=>{currentUid=uid;},
    setThrow:value=>{throwOnPrint=value;},
    replaceProps:change=>{const old=instance.props;
      instance.props={...old,...change};
      instance.componentDidUpdate?.(old,instance.state);
    }
  };
}

for(const [name,path,cls] of [
  ['management','src/components/ReportsPage.tsx','printing-financial-report'],
  ['output VAT','src/components/TaxVatCenter.tsx','printing-tax-vat-report']
]){
  const make=()=>reportHarness(path,name==='management'?'ReportsPage':'TaxVatCenter',cls);

  test(name+': ordinary queued print fires once and afterprint clears mode',()=>{
    const h=make();h.instance.print();h.instance.print();
    assert.equal(h.queueSize(),1);assert.equal(h.bodyArmed(),true);
    h.runQueued();assert.equal(h.printCalls(),1);
    h.instance.afterPrint();assert.equal(h.bodyArmed(),false);
  });

  test(name+': storage account swap before callback never prints other account',()=>{
    const h=make();h.instance.print();h.setUid('account-two');
    h.runQueued();assert.equal(h.printCalls(),0);
    assert.equal(h.bodyArmed(),false);assert.equal(h.queueSize(),0);
  });

  test(name+': replaced financial data cancels outstanding print synchronously',()=>{
    const h=make();h.instance.print();
    h.replaceProps({documents:[{id:'synthetic-new-account'}]});
    assert.equal(h.queueSize(),0);assert.equal(h.bodyArmed(),false);
    h.runQueued();assert.equal(h.printCalls(),0);
  });

  test(name+': changed report filters cancel queued print',()=>{
    const h=make();h.instance.print();
    h.instance.setState({currency:'EUR'});
    assert.equal(h.queueSize(),0);assert.equal(h.bodyArmed(),false);
    h.runQueued();assert.equal(h.printCalls(),0);
  });

  test(name+': print failure cleans body state and permits recovery',()=>{
    const h=make();h.instance.print();h.setThrow(true);
    h.runQueued();assert.equal(h.bodyArmed(),false);
    h.setThrow(false);h.instance.print();h.runQueued();
    assert.equal(h.printCalls(),2);
    h.instance.afterPrint();assert.equal(h.bodyArmed(),false);
  });
}

test('management: changing report tab cancels the old print',()=>{
  const h=reportHarness('src/components/ReportsPage.tsx','ReportsPage','printing-financial-report');
  h.instance.print();h.instance.setState({view:'tax'});
  assert.equal(h.queueSize(),0);assert.equal(h.bodyArmed(),false);
  h.runQueued();assert.equal(h.printCalls(),0);
});

test('both reports: changed props without a lifecycle callback still fail the queued identity snapshot',()=>{
  for(const [path,name,cls] of [
    ['src/components/ReportsPage.tsx','ReportsPage','printing-financial-report'],
    ['src/components/TaxVatCenter.tsx','TaxVatCenter','printing-tax-vat-report']
  ]){
    const h=reportHarness(path,name,cls);
    h.instance.print();h.instance.props={...h.instance.props,company:{nameEn:'Company B'}};
    h.runQueued();assert.equal(h.printCalls(),0,name);
    assert.equal(h.bodyArmed(),false,name);
  }
});
