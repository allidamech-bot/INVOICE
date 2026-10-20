import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock,isIssuedInvoiceStockIssue} from '../dist/src/lib/invoice-stock.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault();
  const date=new Date().toISOString().slice(0,10),at=new Date().toISOString();
  const item={id:'new-issued-stock-scope-item',sku:'SCOPE-ISSUE-2026',
    descriptionEn:'Stock carton',descriptionAr:'',unit:'Carton',createdAt:at,
    updatedAt:at,lastUnitPrice:'12.00',lastCurrency:'USD',
    lastUnitCost:'5.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:at,
    workspaceId:'default',branchId:'main'};
  vault.savedItems=[item];
  vault.inventoryMovements=[createManualInventoryMovement(item,'opening','8',date,'Documented opening inventory')];
  const invoice=createBlankDocument('invoice','INV-STOCK-SCOPE-001',vault.company);
  invoice.status='final';invoice.lifecycleStatus='active';invoice.role='standard';
  invoice.issueDate=date;invoice.dueDate=date;
  invoice.workspaceId='default';invoice.branchId='main';
  invoice.customerSnapshot=customerSnapshotFrom({
    id:'buyer-new-stock-scope',companyNameEn:'Stock Scope Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',
    city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  });
  invoice.items=[{...invoice.items[0],id:'stock-scope-invoice-line',
    descriptionEn:item.descriptionEn,unit:item.unit,
    quantity:'2',unitPrice:'12.00',
    savedItemId:item.id,stockTreatment:'tracked',skuSnapshot:item.sku}];
  vault.documents=[invoice];
  const posted=postIssuedInvoiceStock(vault,invoice).vault;
  const issue=posted.inventoryMovements.find(isIssuedInvoiceStockIssue);
  assert.ok(issue,'stock issue fixture is a real canonical posted movement');
  return{base:vault,invoice,issue};
}
const localSave=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});
const withIssue=(base,issue)=>({...base,inventoryMovements:[...base.inventoryMovements,issue]});

test('new direct invoice stock debit cannot be filed under a different company',()=>{
  const {base,issue}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,withIssue(base,{...issue,workspaceId:'other-company'}),base),
    /invoice stock.*company|invoice stock.*workspace/i);
  assert.equal(JSON.stringify(base),before,'rejected issue must not change opening stock');
});

test('remote stock debit with a foreign company cannot be accepted by an unrelated local edit',()=>{
  const {base,issue}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,localSave(base),
      withIssue(base,{...issue,workspaceId:'other-company'})),
    /invoice stock.*company|invoice stock.*workspace/i);
  assert.equal(JSON.stringify(base),before);
});

test('ordinary same-company invoice issue and exact remote replay stay idempotent',()=>{
  const {base,issue}=fixture();
  const merged=mergeVaultIntent(base,withIssue(base,issue),
    withIssue(base,structuredClone(issue)));
  assert.equal(merged.inventoryMovements.filter(isIssuedInvoiceStockIssue).length,1);
  assert.equal(merged.inventoryMovements.find(isIssuedInvoiceStockIssue).workspaceId,'default');
});

test('prior valid invoice stock issue survives an unrelated save without rewriting historical values',()=>{
  const {base,issue}=fixture();
  const existing=withIssue(base,issue),before=JSON.stringify(existing);
  const result=mergeVaultIntent(existing,localSave(existing),structuredClone(existing));
  assert.equal(result.inventoryMovements.find(isIssuedInvoiceStockIssue).id,issue.id);
  assert.equal(JSON.stringify(existing),before);
});
