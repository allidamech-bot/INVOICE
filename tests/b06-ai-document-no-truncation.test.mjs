import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';

const item=(index)=>({descriptionEn:'Product '+index,descriptionAr:'',quantity:'2',unit:'carton',unitPrice:'12.50'});
function runtime(){
  const vault=emptyVault();
  vault.documents=[{id:'doc-a',number:'PI-2026-0001',kind:'proforma',status:'draft',lifecycleStatus:'active',items:[{id:'line-a',quantity:'2',unitPrice:'12.50'}],currency:'USD'}];
  return createAiToolRuntime(vault,{assistantRuntime:{scope:'business',workspaceId:'default',branchId:'default'}});
}
function execute(tool,args){
  return executeAiToolPlan(runtime(),{version:1,goal:'Prepare complete trade document',calls:[{id:'a',tool,args,reason:'Full user request'}]});
}
test('B06: 20-item quote remains complete with no silent truncation',()=>{
  const result=execute('document.createDraft',{kind:'proforma',items:Array.from({length:20},(_,index)=>item(index))});
  assert.equal(result.results[0].ok,true);
  assert.equal(result.proposal.items.length,20);
  assert.equal(result.proposal.items[19].descriptionEn,'Product 19');
});
test('B06: 21-item invoice fails closed rather than silently creating 20 rows',()=>{
  const result=execute('document.createDraft',{kind:'invoice',items:Array.from({length:21},(_,index)=>item(index))});
  assert.equal(result.proposal,null);
  assert.equal(result.results[0].ok,false);
  assert.match(result.results[0].summary,/over 20 rows/);
});
test('B06: source-less and malformed rows are rejected, never filtered away',()=>{
  for(const rows of [[item(1),{quantity:'4',unitPrice:'10'}],[item(1),null],[item(1),'unexpected']]){
    const result=execute('document.createDraft',{kind:'invoice',items:rows});
    assert.equal(result.proposal,null);
    assert.equal(result.results[0].ok,false);
    assert.match(result.results[0].summary,/row|identity|dropped/i);
  }
});
test('B06: a 21-line update and a 31-edit update do not trim the proposed changes',()=>{
  for(const args of [
    {documentId:'doc-a',addItems:Array.from({length:21},(_,index)=>item(index)),itemEdits:[]},
    {documentId:'doc-a',addItems:[],itemEdits:Array.from({length:31},()=>({itemId:'line-a',quantity:'1'}))}
  ]){
    const result=execute('document.updateDraft',args);
    assert.equal(result.proposal,null);
    assert.equal(result.results[0].ok,false);
    assert.match(result.results[0].summary,/limits/);
  }
});
test('B06: updates reject unknown, repeated and malformed item edit IDs',()=>{
  for(const itemEdits of [
    [{itemId:'missing-line',quantity:'2'}],
    [{itemId:'line-a',quantity:'1'},{itemId:'line-a',quantity:'3'}],
    [null]
  ]){
    const result=execute('document.updateDraft',{documentId:'doc-a',addItems:[],itemEdits});
    assert.equal(result.proposal,null);
    assert.equal(result.results[0].ok,false);
  }
});
test('B06: valid update retains exact added rows and edits',()=>{
  const result=execute('document.updateDraft',{documentId:'doc-a',addItems:[item(1),item(2)],itemEdits:[{itemId:'line-a',quantity:'4'}],termsPatch:{paymentTerms:'Net 30'}});
  assert.equal(result.results[0].ok,true);
  assert.deepEqual(result.proposal.addItems.map(item=>item.descriptionEn),['Product 1','Product 2']);
  assert.deepEqual(result.proposal.itemEdits,[{itemId:'line-a',quantity:'4'}]);
});
