import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {convertPack,convertNestedPack} from '../dist/src/lib/ai-commercial-intelligence.js';
import {newConversationKernel,normalizeConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {applyWorkspaceCommand} from '../dist/src/lib/ai-workspace-model.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'nested-pack-review',accountId:''};

test('nested packaging keeps three explicit factors and a provable count, without rounding',()=>{
 const result=convertNestedPack('12','6','3');
 assert.deepEqual(result,{cartons:'12',boxesPerCarton:'6',unitsPerBox:'3',boxes:'72',unitsPerCarton:'18',units:'216'});
 assert.deepEqual(convertNestedPack('١٢','٦','٣'),result);
 assert.deepEqual(convertNestedPack('1','1','1').units,'1');
 assert.deepEqual(convertPack('12','18'),{cartons:'12',unitsPerCarton:'18',units:'216'},'legacy direct cartons remain unchanged');
});

test('nested packaging fails closed on missing, fractional, zero, negative and ambiguous numbers',()=>{
 const invalid=[
  ['0','6','3'],['12','0','3'],['12','6','0'],
  ['12','6.5','3'],['1.5','6','3'],['12','6','3.0'],
  ['12','','3'],['12','6',''],['-1','6','3'],
  ['12','6','1e3'],['10 cartons','6','3'],['1000000000000','2','2']
 ];
 for(const args of invalid)assert.throws(()=>convertNestedPack(...args),undefined,args.join(' / '));
});

test('review command only changes scoped AI working memory, never the business vault or quote',()=>{
 const vault=emptyVault(),before=structuredClone(vault),kernel=newConversationKernel(scope);
 applyWorkspaceCommand(kernel,vault,{kind:'pack',cartons:'3',unitsPerCarton:'',boxesPerCarton:'6',unitsPerBox:'2'});
 assert.deepEqual(kernel.commercial.pack,{
  cartons:'3',boxesPerCarton:'6',unitsPerBox:'2',boxes:'18',unitsPerCarton:'12',units:'36'
 });
 assert.deepEqual(vault,before);
 assert.equal(kernel.artifact,undefined,'cannot create or modify a quote automatically');
 assert.deepEqual(normalizeConversationKernel(kernel,scope).commercial.pack,kernel.commercial.pack);
 applyWorkspaceCommand(kernel,vault,{kind:'pack',cartons:'3',unitsPerCarton:'12'});
 assert.deepEqual(kernel.commercial.pack,{cartons:'3',unitsPerCarton:'12',units:'36'});
 assert.deepEqual(vault,before);
});

test('contradictory packing inputs fail atomically, leaving previous reviewed preview unchanged',()=>{
 const vault=emptyVault(),kernel=newConversationKernel(scope);
 applyWorkspaceCommand(kernel,vault,{kind:'pack',cartons:'2',unitsPerCarton:'12'});
 const previous=structuredClone(kernel.commercial.pack);
 for(const command of [
  {kind:'pack',cartons:'3',unitsPerCarton:'18',boxesPerCarton:'6',unitsPerBox:'3'},
  {kind:'pack',cartons:'3',unitsPerCarton:'',boxesPerCarton:'6',unitsPerBox:''},
  {kind:'pack',cartons:'3',unitsPerCarton:'',boxesPerCarton:'',unitsPerBox:'3'}
 ]){
  assert.throws(()=>applyWorkspaceCommand(kernel,vault,command));
  assert.deepEqual(kernel.commercial.pack,previous);
 }
});

test('account/workspace boundaries still guard nested pack commands',()=>{
 const vault=emptyVault(),kernel=newConversationKernel(scope),command={kind:'pack',cartons:'3',unitsPerCarton:'',boxesPerCarton:'6',unitsPerBox:'3'};
 const foreign=structuredClone(kernel);foreign.scope.workspaceId='other-company';
 assert.throws(()=>applyWorkspaceCommand(foreign,vault,command));
 const personal=structuredClone(kernel);personal.scope={scope:'personal',workspaceId:'',branchId:'',threadId:'personal'};
 assert.throws(()=>applyWorkspaceCommand(personal,vault,command));
});

test('commercial workspace displays bilingual fields and a clear preview-only disclaimer',()=>{
 const ui=readFileSync(new URL('../src/components/AiCommercialWorkspace.tsx',import.meta.url),'utf8');
 assert.match(ui,/Inner boxes per outer carton/);
 assert.match(ui,/Units per inner box/);
 assert.match(ui,/العلب الداخلية في كل كرتون/);
 assert.match(ui,/No price, quotation line or stock is changed/);
 assert.match(ui,/commercial\.pack\.boxesPerCarton/);
});
