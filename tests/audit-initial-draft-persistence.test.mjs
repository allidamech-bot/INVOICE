import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

async function createHarness(){
  const app=await read('src/app/App.tsx');
  const start=app.indexOf('private newDocument=async(');
  const end=app.indexOf('private saveDocument=async(',start);
  assert.ok(start>=0&&end>start,'exercise the real creation methods without replacing unrelated app logic');
  const program='class DraftHarness {\n'+app.slice(start,end)+'\n}';
  const js=ts.transpileModule(program,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText;
  const markers=[];
  const context={exports:{},document:{documentElement:{
    setAttribute:(key,value)=>markers.push({action:'set',key,value}),
    removeAttribute:key=>markers.push({action:'remove',key})
  }},confirmWorkspaceDeparture:()=>true,t:(en)=>en,
    customerSnapshotFrom:customer=>({sourceCustomerId:customer.id}),
    applyCustomerCommercialDefaults:(doc,customer)=>({...doc,customerSnapshot:{sourceCustomerId:customer.id}})
  };
  vm.runInNewContext(js+'\nexports.DraftHarness=DraftHarness;',context);
  const h=new context.exports.DraftHarness();
  h.documentCreateBusy=false;
  h.state={screen:'home',newMenu:false};
  const events=[],toasts=[];
  let stored=null;
  h.setState=(patch,callback)=>{
    if(patch.screen==='editor'){
      assert.ok(stored,'the new draft must be encrypted and saved before editor opens');
      events.push('opened');
    }
    Object.assign(h.state,patch);
    callback?.();
  };
  h.persist=async vault=>{
    events.push('persisted');
    stored=vault;
  };
  h.showToast=(value,tone)=>toasts.push({value,tone});
  return {h,events,toasts,markers,getStored:()=>stored,app};
}

test('blank invoices are committed to the local vault before the editor can open',async()=>{
  const {h,events,getStored,markers,app}=await createHarness();
  let release;
  const reservation=new Promise(resolve=>{release=resolve;});
  const draft={id:'draft-001',kind:'invoice',status:'draft',number:'INV-2026-0001'};
  h.reserveDocument=async()=>({doc:draft,vault:{company:{},documents:[]},reservation});
  const op=h.newDocument('invoice');
  await Promise.resolve();
  assert.equal(getStored(),null,'number reservation must settle before document persistence');
  assert.equal(h.state.screen,'home','the unsaved draft must not be shown as saved');
  release();
  await op;
  assert.deepEqual(events,['persisted','opened']);
  assert.equal(getStored().documents.length,1);
  assert.equal(getStored().documents[0].id,draft.id);
  assert.equal(h.state.editorDoc.id,draft.id);
  assert.equal(h.documentCreateBusy,false);
  assert.equal(markers.at(-1)?.action,'set');
  const editor=await read('src/components/EditorPage.tsx');
  assert.doesNotMatch(editor,/ensureInitialDraftPersisted|initialDraftPersistIds/,'editor mount must remain read-only');
  assert.match(app,/await reservation;await this\.persist\(\{\.\.\.vault,documents:\[\.\.\.vault\.documents,doc\]\}\)/);
});

test('customer-specific drafts persist customer defaults first and reject duplicate creation',async()=>{
  const {h,events,getStored}=await createHarness();
  const customer={id:'customer-A'};
  const draft={id:'draft-customer',kind:'proforma',status:'draft'};
  h.reserveDocument=async()=>({doc:draft,vault:{company:{},documents:[]},reservation:Promise.resolve()});
  await h.newDocumentForCustomer('proforma',customer);
  assert.deepEqual(events,['persisted','opened']);
  assert.equal(getStored().documents.length,1);
  assert.equal(getStored().documents[0].customerSnapshot.sourceCustomerId,customer.id);
  assert.equal(h.state.editorDoc.customerSnapshot.sourceCustomerId,customer.id);
  assert.equal(h.documentCreateBusy,false);

  const second=await createHarness();
  second.h.documentCreateBusy=true;
  second.h.reserveDocument=async()=>{throw new Error('must never reserve twice');};
  await second.h.newDocumentForCustomer('proforma',customer);
  assert.equal(second.getStored(),null);
});

test('failed local vault commit keeps the editor closed and releases creation guard',async()=>{
  const {h,toasts,markers}=await createHarness();
  h.reserveDocument=async()=>({doc:{id:'draft-fail',status:'draft'},vault:{documents:[]},reservation:Promise.resolve()});
  h.persist=async()=>{throw new Error('disk full');};
  await h.newDocument('invoice');
  assert.equal(h.state.screen,'home');
  assert.equal(h.documentCreateBusy,false);
  assert.equal(markers.at(-1)?.action,'remove','failure must not keep the editor-open marker');
  assert.equal(toasts.length,1);
  assert.equal(toasts[0].tone,'error');
});
