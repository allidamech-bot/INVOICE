import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {migrateVault} from '../dist/src/storage/vault.js';
import {newConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {stageScopedRecordList,exactNamedRecordSelection,setExactRecordSelection} from '../dist/src/lib/ai-record-selection.js';
import {requestedPartyHighlight,prepareSelectedPartyHighlight,applySelectedPartyHighlight} from '../dist/src/lib/ai-party-highlights.js';

const stamp='2026-10-01T00:00:00.000Z';
function customer(id,arabic,workspaceId='default'){
 return{id,workspaceId,createdAt:stamp,updatedAt:stamp,companyNameEn:'',companyNameAr:arabic,contactPerson:'',
   addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',
   preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',
   creditCurrency:'USD',notes:''};
}
function supplier(id,arabic,workspaceId='default'){
 return{id,workspaceId,createdAt:stamp,updatedAt:stamp,nameEn:'',nameAr:arabic,contactPerson:'',address:'',
   city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',
   paymentTerms:'',notes:''};
}
function fixture(){
 const vault=emptyVault();
 vault.customers=[customer('ahmed','أحمد'),customer('mohamed','محمد'),customer('khaled','خالد'),customer('out','خارج','foreign')];
 vault.suppliers=[supplier('sup-one','المورد الأول'),supplier('sup-out','مورد آخر','foreign')];
 const kernel=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'red-qa'});
 return{vault,kernel};
}
test('red mark request must be explicit, never natural discussion or deletion',()=>{
 assert.equal(requestedPartyHighlight('حط لهم علامة حمراء'),'red');
 assert.equal(requestedPartyHighlight('ضع لهم علامة حمراء'),'red');
 assert.equal(requestedPartyHighlight('mark them red'),'red');
 assert.equal(requestedPartyHighlight('هل نضع لهم علامة حمراء؟'),null);
 assert.equal(requestedPartyHighlight('احذف أحمد'),null);
});
test('three exact selected customers receive a complete before/after preview and one atomic save',()=>{
 const {vault,kernel}=fixture(),original=structuredClone(vault);
 stageScopedRecordList(kernel,vault,'customer');
 exactNamedRecordSelection(kernel,vault,'حدد أحمد ومحمد وخالد');
 const batch=prepareSelectedPartyHighlight(kernel,vault);
 assert.equal(batch.party,'customer');
 assert.deepEqual(batch.rows.map(r=>r.id),['ahmed','mohamed','khaled']);
 assert.ok(batch.preview.every(p=>p.before==='No mark'&&p.after==='Red mark'));
 assert.deepEqual(vault,original,'prepare must never save master data');
 const next=applySelectedPartyHighlight(vault,batch,'2026-10-13T21:00:00.000Z');
 assert.deepEqual(next.customers.map(r=>r.highlightColor||''),['red','red','red','']);
 assert.equal(next.customers[3].workspaceId,'foreign');
 assert.deepEqual(vault,original,'pure approval must not mutate original records');
 assert.deepEqual(migrateVault(next).customers.slice(0,3).map(r=>r.highlightColor),['red','red','red'],
   'structured marks survive canonical vault normalization');
});
test('supplier marking requires exact selection, not fuzzy matching or unsanctioned records',()=>{
 const {vault,kernel}=fixture();
 const list=stageScopedRecordList(kernel,vault,'supplier');
 setExactRecordSelection(kernel,vault,list.id,['sup-one']);
 const batch=prepareSelectedPartyHighlight(kernel,vault);
 assert.equal(batch.party,'supplier');
 const next=applySelectedPartyHighlight(vault,batch);
 assert.equal(next.suppliers[0].highlightColor,'red');
 assert.equal(next.suppliers[1].highlightColor,undefined);
 assert.equal(migrateVault(next).suppliers[0].highlightColor,'red');
});
test('stale timestamp, wrong workspace, changed color, and duplicate IDs fail atomically',()=>{
 const {vault,kernel}=fixture();
 const selection=stageScopedRecordList(kernel,vault,'customer');
 setExactRecordSelection(kernel,vault,selection.id,['ahmed','mohamed']);
 const batch=prepareSelectedPartyHighlight(kernel,vault);
 const changed=structuredClone(vault);
 changed.customers[1].updatedAt='2026-10-12T10:00:00.000Z';
 const untouched=structuredClone(changed);
 assert.throws(()=>applySelectedPartyHighlight(changed,batch),/changed after review/);
 assert.deepEqual(changed,untouched);
 const wrong=structuredClone(vault);wrong.appSettings.activeWorkspaceId='foreign';
 assert.throws(()=>applySelectedPartyHighlight(wrong,batch),/Invalid or stale/);
 const duplicate=structuredClone(batch);duplicate.rows.push({...duplicate.rows[0]});
 assert.throws(()=>applySelectedPartyHighlight(vault,duplicate),/duplicate/);
 const already=structuredClone(vault);already.customers[0].highlightColor='red';
 assert.throws(()=>applySelectedPartyHighlight(already,batch),/changed after review/);
 assert.deepEqual(vault.customers.map(r=>r.highlightColor||''),['','','','']);
});
test('Controller requires signed generic action, Advisor cannot write',async()=>{
 const [runtime,actions,types]=await Promise.all([
  readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/types.ts',import.meta.url),'utf8')
 ]);
 assert.match(runtime,/prepareSelectedPartyHighlight\(kernel,resumed\.vault\)/);
 assert.match(runtime,/stampProposal\(host,p,resumed\.vault\);stageReviewedMission\(kernel,p\)/);
 assert.match(actions,/assertFoundationApproval\(vault,proposal\)/);
 assert.match(actions,/applySelectedPartyHighlight\(vault,batch\)/);
 assert.match(types,/highlightColor\?:'red'/);
});
