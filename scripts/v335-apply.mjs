import fs from 'node:fs';

function edit(path,fn){const before=fs.readFileSync(path,'utf8');const after=fn(before);if(after===before)throw new Error(`No change made to ${path}`);fs.writeFileSync(path,after);}
function replaceOnce(src,from,to,label){const first=src.indexOf(from);if(first<0)throw new Error(`Missing ${label}`);if(src.indexOf(from,first+1)>=0)throw new Error(`Duplicate match ${label}`);return src.slice(0,first)+to+src.slice(first+from.length);}
function replaceRegexOnce(src,re,to,label){let count=0;const next=src.replace(re,(...args)=>{count+=1;return typeof to==='function'?to(...args):to;});if(count!==1)throw new Error(`${label}: expected 1 match, got ${count}`);return next;}

edit('src/lib/operations.ts',src=>{
  src=replaceRegexOnce(src,/export function validatePurchase\(purchase:PurchaseRecord,savedItems:SavedItem\[\]=\[\]\):string\[\]\{[\s\S]*?\n\}\n\nexport function purchaseAccountingIsValid\(purchase:PurchaseRecord\):boolean\{[\s\S]*?\n\}/,`export function validatePurchase(purchase:PurchaseRecord,savedItems:SavedItem[]=[]):string[]{
  const errors:string[]=[];
  const linkedItems=new Set<string>();
  if(!purchase.number.trim())errors.push('Purchase number is required.');
  if(!isIsoDate(purchase.date))errors.push('Purchase date is invalid.');
  if(!purchase.supplierSnapshot?.sourceSupplierId)errors.push('Supplier is required.');
  if(!purchase.currency.trim())errors.push('Purchase currency is required.');
  if(!purchase.items.length)errors.push('Add at least one purchase item.');
  for(const [index,item] of purchase.items.entries()){
    if(!item.descriptionEn.trim()&&!item.descriptionAr.trim())errors.push(\`Item \${index+1}: description is required.\`);
    if(!positive(item.quantity))errors.push(\`Item \${index+1}: quantity must be greater than zero.\`);
    if(!nonNegativeCost(item.unitCost))errors.push(\`Item \${index+1}: unit cost must be zero or greater.\`);
    if(item.savedItemId){
      if(!savedItems.some(saved=>saved.id===item.savedItemId))errors.push(\`Item \${index+1}: linked saved item no longer exists.\`);
      if(linkedItems.has(item.savedItemId))errors.push(\`Item \${index+1}: the same saved item cannot appear more than once in one purchase.\`);
      linkedItems.add(item.savedItemId);
    }
  }
  for(const [label,value] of [['Freight',purchase.freight],['Duty',purchase.duty],['Other costs',purchase.otherCosts]] as const){if(!nonNegative(value||'0'))errors.push(\`\${label} must be zero or greater.\`);}
  return errors;
}

export function purchaseAccountingIsValid(purchase:PurchaseRecord):boolean{
  if(!purchase.number.trim()||!isIsoDate(purchase.date)||!purchase.supplierSnapshot?.sourceSupplierId||!purchase.currency.trim()||!purchase.items.length)return false;
  const linkedItems=new Set<string>();
  for(const item of purchase.items){
    if(!positive(item.quantity)||!nonNegativeCost(item.unitCost))return false;
    if(item.savedItemId){if(linkedItems.has(item.savedItemId))return false;linkedItems.add(item.savedItemId);}
  }
  return [purchase.freight,purchase.duty,purchase.otherCosts].every(value=>nonNegative(value||'0'));
}`,'purchase validation/accounting');
  return src;
});

edit('src/components/OperationsPage.tsx',src=>{
  src=replaceRegexOnce(src,/const movementDirty=Boolean\(this\.state\.movementQuantity\.trim\(\)\|\|this\.state\.movementNote\.trim\(\)\|\|this\.state\.movementCost\.trim\(\)\);/,`const movementDirty=Boolean(this.state.movementQuantity.trim()||this.state.movementNote.trim()||this.state.movementCost.trim()||this.state.movementType!=='opening'||this.state.movementDate!==todayIso()||this.state.movementCurrency.trim().toUpperCase()!==(this.props.defaultCurrency||'USD').trim().toUpperCase());`,'movement dirty');
  src=replaceRegexOnce(src,/private newPurchase=\(confirmed=false\)=>\{if\(this\.mutationInFlight\|\|\(!confirmed&&!this\.confirmDiscardCurrent\(\)\)\)return;const purchase=createPurchase\(this\.props\.purchases,this\.props\.suppliers,this\.props\.defaultCurrency\);purchase\.items=\[createPurchaseItem\(\)\];this\.setState\(\{purchaseEdit:purchase,supplierEdit:null,expenseEdit:null,error:''\}\);\};/,`private newPurchase=(confirmed=false)=>{if(this.mutationInFlight||(!confirmed&&!this.confirmDiscardCurrent()))return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,this.props.defaultCurrency);purchase.supplierSnapshot=null;purchase.currency=(this.props.defaultCurrency||'USD').trim().toUpperCase();purchase.items=[createPurchaseItem()];this.setState({purchaseEdit:purchase,supplierEdit:null,expenseEdit:null,error:''});};`,'explicit supplier');
  src=replaceOnce(src,`this.setState({movementQuantity:'',movementNote:'',movementCost:'',error:''});`,`this.setState({movementType:'opening',movementQuantity:'',movementDate:todayIso(),movementNote:'',movementCost:'',movementCurrency:(this.props.defaultCurrency||'USD').trim().toUpperCase(),error:''});`,'movement reset');
  return src;
});

edit('src/app/App.tsx',src=>{
  const identity=`const identityChanged=!current||normalizeSavedItemIdentity(current.descriptionEn)!==normalizeSavedItemIdentity(item.descriptionEn)||normalizeSavedItemIdentity(current.descriptionAr)!==normalizeSavedItemIdentity(item.descriptionAr);`;
  src=replaceOnce(src,identity,identity+`if(current&&current.unit!==item.unit&&vault.inventoryMovements.some(movement=>movement.itemId===item.id))throw new Error(t('Unit cannot be changed after inventory history exists. Create a new item for a different stock unit.','لا يمكن تغيير الوحدة بعد وجود سجل مخزون. أنشئ صنفًا جديدًا عند استخدام وحدة مخزون مختلفة.'));`,'saved item unit guard');
  const del=`private deleteSupplier=async(supplier:Supplier)=>{const vault=this.requireVault();if(vault.expenses.some(expense=>expense.supplierId===supplier.id))throw new Error(t('This supplier is referenced by historical expenses and cannot be deleted.','هذا المورد مرتبط بمصروفات تاريخية ولا يمكن حذفه.'));`;
  src=replaceOnce(src,del,`private deleteSupplier=async(supplier:Supplier)=>{const vault=this.requireVault();if(vault.purchases.some(purchase=>purchase.status==='draft'&&purchase.supplierSnapshot?.sourceSupplierId===supplier.id))throw new Error(t('This supplier is used by a draft purchase. Change or delete the draft first.','هذا المورد مستخدم في مسودة شراء. غيّر المورد أو احذف المسودة أولًا.'));if(vault.expenses.some(expense=>expense.supplierId===supplier.id))throw new Error(t('This supplier is referenced by historical expenses and cannot be deleted.','هذا المورد مرتبط بمصروفات تاريخية ولا يمكن حذفه.'));`,'supplier delete guard');
  return src;
});

edit('src/storage/vault-merge.ts',src=>{
  src=replaceOnce(src,`function guardSavedItemChanges(base:SavedItem[],intended:SavedItem[],merged:SavedItem[]):void{`,`function guardSavedItemChanges(base:SavedItem[],intended:SavedItem[],merged:SavedItem[],movements:InventoryMovementRecord[]):void{`,'saved item signature');
  const cost=`    const costChanged=!before||text(before.lastUnitCost)!==text(item.lastUnitCost)||text(before.lastCostCurrency)!==text(item.lastCostCurrency);`;
  src=replaceOnce(src,cost,cost+`\n    if(before&&text(before.unit)!==text(item.unit)&&movements.some(movement=>movement.itemId===item.id))throw new Error(t('Unit cannot be changed after inventory history exists. Create a new item for a different stock unit.','لا يمكن تغيير الوحدة بعد وجود سجل مخزون. أنشئ صنفًا جديدًا عند استخدام وحدة مخزون مختلفة.'));`,'central unit guard');
  src=replaceOnce(src,`  guardSavedItemChanges(base.savedItems,intended.savedItems,savedItems);`,`  guardSavedItemChanges(base.savedItems,intended.savedItems,savedItems,inventoryMovements);`,'saved item call');
  const draft=`  guardDraftPurchaseConflicts(base.purchases,intended.purchases,latest.purchases);`;
  src=replaceOnce(src,draft,draft+`\n  const intendedSupplierIds=new Set(intended.suppliers.map(supplier=>supplier.id));\n  for(const supplier of base.suppliers){\n    if(intendedSupplierIds.has(supplier.id))continue;\n    if(purchases.some(purchase=>purchase.status==='draft'&&purchase.supplierSnapshot?.sourceSupplierId===supplier.id))throw new Error('Cannot delete a supplier used by a draft purchase. Change or delete the draft first.');\n    if(expenses.some(expense=>expense.supplierId===supplier.id))throw new Error('Cannot delete a supplier referenced by an expense.');\n  }`,'central supplier refs');
  return src;
});

edit('src/styles/tailadmin-operations-v320.css',src=>src+`\n\n/* LOUREX v335 — inventory/purchasing mobile closeout. */\n@media screen and (max-width:1180px){\n  .ta-ops-split>.ta-ops-editor,.ta-ops-split>.ta-ops-editor-card{order:-1}\n}\n@media screen and (max-width:860px){\n  .ta-operations-page{padding-inline:max(10px,env(safe-area-inset-left,0px),env(safe-area-inset-right,0px))}\n  .ta-ops-list-card,:is(.ta-ops-editor,.ta-ops-editor-card){border-radius:12px}\n  .ta-ops-editor-scroll{padding:14px 12px}\n  .ta-inventory-movement-grid{gap:12px}\n}\n`);

fs.writeFileSync('tests/v335-inventory-purchasing-deep-closeout.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createManualInventoryMovement, createPurchase, createPurchaseItem, createSupplier, purchaseAccountingIsValid, validatePurchase } from '../dist/src/lib/operations.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
const root=new URL('../',import.meta.url);const read=path=>readFile(new URL(path,root),'utf8');
function item(id='sku-a'){return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:id.toUpperCase(),descriptionEn:'Item',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',category:'',tags:[],favorite:false};}
function purchaseWith(saved){const supplier=createSupplier();supplier.nameEn='Supplier';const purchase=createPurchase([], [supplier], 'USD');purchase.items=[createPurchaseItem(saved)];purchase.items[0].unitCost='10';return {supplier,purchase};}
test('duplicate saved item is rejected',()=>{const saved=item();const {purchase}=purchaseWith(saved);purchase.items.push({...createPurchaseItem(saved),id:'second',unitCost:'20'});assert.ok(validatePurchase(purchase,[saved]).some(error=>/same saved item/i.test(error)));assert.equal(purchaseAccountingIsValid(purchase),false);});
test('accounting purchase needs supplier',()=>{const saved=item();const {purchase}=purchaseWith(saved);purchase.supplierSnapshot=null;assert.equal(purchaseAccountingIsValid(purchase),false);});
test('inventory history locks stock unit',()=>{const base=emptyVault();const saved=item();base.savedItems=[saved];base.inventoryMovements=[createManualInventoryMovement(saved,'opening','5','2026-09-01','Opening')];const intended=structuredClone(base),latest=structuredClone(base);intended.savedItems[0].unit='KG';assert.throws(()=>mergeVaultIntent(base,intended,latest),/Unit cannot be changed after inventory history exists/i);});
test('supplier used by draft purchase cannot be deleted',()=>{const base=emptyVault();const saved=item();const {supplier,purchase}=purchaseWith(saved);base.savedItems=[saved];base.suppliers=[supplier];base.purchases=[purchase];const intended=structuredClone(base),latest=structuredClone(base);intended.suppliers=[];assert.throws(()=>mergeVaultIntent(base,intended,latest),/supplier used by a draft purchase/i);});
test('generic purchase requires explicit supplier and movement dirty state is complete',async()=>{const page=await read('src/components/OperationsPage.tsx');assert.match(page,/purchase\.supplierSnapshot=null/);assert.match(page,/movementType!=='opening'/);assert.match(page,/movementDate!==todayIso\(\)/);assert.match(page,/movementCurrency\.trim\(\)\.toUpperCase\(\)/);assert.match(page,/movementType:'opening'.*movementDate:todayIso\(\).*movementCurrency:/s);});
test('mobile operations editor opens before long list',async()=>{const css=await read('src/styles/tailadmin-operations-v320.css');assert.match(css,/max-width:1180px[\s\S]*ta-ops-split>\.ta-ops-editor[\s\S]*order:-1/);});
`);
