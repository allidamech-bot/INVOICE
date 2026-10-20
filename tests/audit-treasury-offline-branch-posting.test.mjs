import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
 const invoice=createBlankDocument('invoice','INV-REGIONAL-SYNC',defaultCompany());
 invoice.status='final';invoice.lifecycleStatus='active';invoice.role='standard';
 invoice.issueDate='2026-09-01';invoice.dueDate='2026-12-01';invoice.currency='USD';
 invoice.customerSnapshot={sourceCustomerId:'regional-buyer',companyNameEn:'Regional Buyer',
   companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
   phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 invoice.items[0].descriptionEn='Contract consulting';
 invoice.items[0].quantity='1';invoice.items[0].unitPrice='100.00';
 const payment={id:'regional-payment',invoiceId:invoice.id,invoiceNumber:invoice.number,
   customerId:'regional-buyer',customerNameEn:'Regional Buyer',customerNameAr:'',
   currency:'USD',amount:'100.00',date:'2026-09-05',method:'bank-transfer',
   reference:'REG-COL-100',notes:'',createdAt:'2026-09-05T10:00:00.000Z',
   updatedAt:'2026-09-05T10:00:00.000Z',workspaceId:'default',branchId:'main'};
 const bank={...createTreasuryAccount({label:'Main USD Bank',kind:'bank',currency:'USD',
   workspaceId:'default',branchId:'main'}),id:'bank-main-region-switch'};
 const cash={...createTreasuryAccount({label:'Main Cash',kind:'cash',currency:'USD',
   workspaceId:'default',branchId:'main'}),id:'cash-main-region-switch'};
 const initial=emptyVault();
 const base={...initial,documents:[invoice],payments:[payment],treasuryAccounts:[bank,cash],
   branches:[...initial.branches,{...initial.branches[0],id:'regional',name:'Regional Branch',
     code:'REG',active:true}]};
 const collection={...createTreasuryEntry('collection','USD'),id:'bank-collection-main',
   workspaceId:'default',branchId:'main',date:'2026-09-05',amount:'100.00',
   sourceType:'customer-payment',sourceId:payment.id,toAccountId:bank.id};
 const deposit={...createTreasuryEntry('deposit','USD'),id:'bank-deposit-main',
   workspaceId:'default',branchId:'main',date:'2026-09-05',amount:'75.00',
   toAccountId:bank.id};
 const changedBranch=baseVault=>({...baseVault,appSettings:{
   ...baseVault.appSettings,activeBranchId:'regional'}});
 const unrelated=baseVault=>({...baseVault,appSettings:{
   ...baseVault.appSettings,uiLanguage:'ar'}});
 return{base,bank,cash,collection,deposit,changedBranch,unrelated};
}
test('remote bank collection retains the original branch when another device selected Regional',()=>{
 const {base,bank,collection,changedBranch,unrelated}=fixture();
 const remote={...changedBranch(base),treasuryEntries:[collection]};
 const merged=mergeVaultIntent(base,unrelated(base),remote);
 assert.equal(merged.treasuryEntries.length,1);
 assert.equal(merged.treasuryEntries[0].branchId,'main');
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'100.00');
});

test('local bank deposit can merge while cloud active branch differs from its verified account',()=>{
 const {base,bank,deposit,changedBranch}=fixture();
 const merged=mergeVaultIntent(base,{...base,treasuryEntries:[deposit]},changedBranch(base));
 assert.equal(merged.treasuryEntries.length,1);
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'75.00');
});

test('same-branch bank-to-cash transfer still nets to zero under a remote branch UI switch',()=>{
 const {base,bank,cash,deposit,changedBranch}=fixture();
 const transfer={...createTreasuryEntry('transfer','USD'),id:'bank-cash-transfer',
   workspaceId:'default',branchId:'main',date:'2026-09-05',amount:'30.00',
   fromAccountId:bank.id,toAccountId:cash.id};
 const merged=mergeVaultIntent(base,{...base,treasuryEntries:[deposit,transfer]},changedBranch(base));
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'45.00');
 assert.equal(treasuryAccountBalance(cash.id,merged.treasuryEntries),'30.00');
});

test('remote UI branch switch cannot authorize a treasury entry using another branch account',()=>{
 const {base,deposit,changedBranch}=fixture();
 const wrong={...deposit,branchId:'regional'};
 assert.throws(()=>mergeVaultIntent(base,{...base,treasuryEntries:[wrong]},changedBranch(base)),
   /Treasury destination account scope does not match|Treasury account changed/i);
});

test('interactive posting still rejects stale form whose selected branch has changed',()=>{
 const {base,deposit,changedBranch}=fixture();
 assert.throws(()=>appendTreasuryEntry(changedBranch(base),deposit),/Workspace changed/i);
});

test('historical bank records keep their original branch and amount after another device switches branch',()=>{
 const {base,bank,deposit,changedBranch,unrelated}=fixture();
 const historical={...base,treasuryEntries:[deposit]};
 const before=JSON.stringify(historical);
 const merged=mergeVaultIntent(historical,unrelated(historical),changedBranch(historical));
 assert.equal(merged.treasuryEntries[0].branchId,'main');
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'75.00');
 assert.equal(JSON.stringify(historical),before);
});
