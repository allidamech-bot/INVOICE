import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {requestedRecordList,stageScopedRecordList,setExactRecordSelection,exactNamedRecordSelection} from '../dist/src/lib/ai-record-selection.js';

function fixture(){
 const vault=emptyVault();
 const make=(id,name,workspaceId='default')=>({id,workspaceId,companyNameAr:name,companyNameEn:name,contactPerson:''});
 vault.customers=[make('c-a','أحمد'),make('c-m','محمد'),make('c-k','خالد'),make('c-other','ممنوع','foreign')];
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'selection-qa',accountId:'qa'};
 return {vault,kernel:newConversationKernel(scope)};
}
test('natural all-record commands choose exact list kind; questions are not list requests',()=>{
 for(const [message,kind] of [
  ['اعرض جميع العملاء','customer'],['اعرض كل الموردين','supplier'],
  ['show all products','product'],['list documents','document'],
 ])assert.equal(requestedRecordList(message),kind,message);
 for(const message of ['احذف جميع العملاء','اعرض التقرير','كيف حال العملاء؟','اعرض فاتورة INV-2026-0001'])
  assert.equal(requestedRecordList(message),null,message);
});
test('in-chat customer list uses real scoped IDs and natural Arabic multi-select without vault writes',()=>{
 const {vault,kernel}=fixture(),before=structuredClone(vault);
 const selection=stageScopedRecordList(kernel,vault,'customer');
 assert.deepEqual(selection.items.map(row=>row.entityId),['c-a','c-m','c-k']);
 assert.deepEqual(selection.selectedIds,[]);
 exactNamedRecordSelection(kernel,vault,'حدد أحمد ومحمد وخالد');
 assert.deepEqual(selection.selectedIds,['c-a','c-m','c-k']);
 exactNamedRecordSelection(kernel,vault,'إلغاء التحديد');
 assert.deepEqual(selection.selectedIds,[]);
 exactNamedRecordSelection(kernel,vault,'حدد الكل');
 assert.equal(selection.selectedIds.length,3);
 assert.deepEqual(vault,before);
});
test('UI selection validates list scope, exact identities, duplicates and current records',()=>{
 const {vault,kernel}=fixture();
 const list=stageScopedRecordList(kernel,vault,'customer');
 assert.throws(()=>setExactRecordSelection(kernel,vault,'other',['c-a']),/list changed/);
 assert.throws(()=>setExactRecordSelection(kernel,vault,list.id,['c-other']),/displayed list/);
 assert.throws(()=>setExactRecordSelection(kernel,vault,list.id,['c-a','c-a']),/duplicate/);
 assert.throws(()=>exactNamedRecordSelection(kernel,vault,'حدد يوسف'),/not found/);
 vault.customers.push({...vault.customers[0],id:'c-duplicate'});
 assert.throws(()=>exactNamedRecordSelection(kernel,vault,'حدد أحمد'),/Duplicate record name/);
 vault.customers=vault.customers.filter(row=>row.id!=='c-m');
 assert.throws(()=>setExactRecordSelection(kernel,vault,list.id,['c-m']),/missing/);
 kernel.scope.branchId='other';
 assert.throws(()=>setExactRecordSelection(kernel,vault,list.id,[]),/Company or branch changed/);
});
test('the in-chat checkbox widget and safe Controller intercept are wired to actual commands',async()=>{
 const [ui,runtime,workspace]=await Promise.all([
  readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/ai-workspace-model.ts',import.meta.url),'utf8')
 ]);
 assert.match(ui,/ConversationRecordList/);
 assert.match(ui,/data-record-selection-id/);
 assert.match(ui,/kind:'selection-set'/);
 assert.match(runtime,/stageScopedRecordList\(kernel,resumed\.vault,listKind\)/);
 assert.match(runtime,/graphKindAllowed\(strictAiActor\(resumed\.vault\)\.role,listKind\)/);
 assert.match(workspace,/setExactRecordSelection\(kernel,vault,command\.selectionId,command\.entityIds\)/);
});
