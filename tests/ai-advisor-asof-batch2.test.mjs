import test from 'node:test';
import assert from 'node:assert/strict';

const AS_OF='2026-10-04';
const at=date=>`${date}T12:00:00.000Z`;

function savedItem(){return{id:'item-1',workspaceId:'default',createdAt:at('2026-01-01'),updatedAt:at('2026-01-01'),sku:'SKU-1',descriptionEn:'Widget',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:'',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:'',category:'',tags:[]};}
function purchase(date,status='posted'){return{id:`purchase-${date}`,workspaceId:'default',branchId:'main',number:`PUR-${date}`,date,dueDate:date,supplierSnapshot:null,currency:'USD',items:[{id:`line-${date}`,savedItemId:'item-1',sku:'SKU-1',descriptionEn:'Widget',descriptionAr:'',quantity:'1',unit:'PCS',unitCost:'10',landedUnitCost:'10',previousUnitCost:'',previousCostCurrency:''}],freight:'0',duty:'0',otherCosts:'0',notes:'',status,postedAt:status==='posted'?at(date):'',reversedAt:'',reverseReason:'',createdAt:at(date),updatedAt:at(date)};}
function expense(date,amount){return{id:`expense-${date}`,workspaceId:'default',branchId:'main',date,category:'General',description:'Expense',amount,currency:'EUR',supplierId:'',reference:'',notes:'',createdAt:at(date),updatedAt:at(date)};}
function movement(date,quantity){return{id:`movement-${date}`,workspaceId:'default',branchId:'main',itemId:'item-1',itemNameEn:'Widget',itemNameAr:'',sku:'SKU-1',date,type:quantity.startsWith('-')?'issue':'opening',quantity,unitCost:'',currency:'',sourceId:'',sourceNumber:'',note:'',createdAt:at(date)};}

async function build(vault){const [{buildAiFinanceContext},{buildAiBusinessContext},{buildAdvisorDataV2}]=await Promise.all([import('../dist/src/lib/ai-finance.js'),import('../dist/src/lib/ai-business.js'),import('../dist/src/lib/ai-advisor-v2.js')]);const finance=buildAiFinanceContext({documents:vault.documents,payments:vault.payments,customers:vault.customers,activeDocument:null},'health');const business=buildAiBusinessContext(vault,AS_OF);return buildAdvisorDataV2(vault,finance,business,'business');}

test('Advisor V2 excludes future operational and treasury records from an as-of snapshot',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');const vault=emptyVault();vault.savedItems=[savedItem()];
  vault.purchases=[purchase('2026-10-01'),purchase('2026-10-10')];
  vault.expenses=[expense('2026-10-02','20'),expense('2026-10-11','999')];
  vault.inventoryMovements=[movement('2026-10-01','5'),movement('2026-10-12','-9')];
  vault.treasuryAccounts=[{id:'bank',workspaceId:'default',branchId:'main',label:'Bank',kind:'bank',currency:'USD',bankAccountId:'',active:true,createdAt:at('2026-01-01'),updatedAt:at('2026-01-01')}];
  vault.treasuryEntries=[{id:'opening',workspaceId:'default',branchId:'main',type:'opening-balance',date:'2026-10-01',currency:'USD',amount:'100',fromAccountId:'',toAccountId:'bank',sourceType:'manual',sourceId:'',reference:'',notes:'',reconciledAt:'',voidedAt:'',voidReason:'',createdAt:at('2026-10-01'),updatedAt:at('2026-10-01')},{id:'future-withdrawal',workspaceId:'default',branchId:'main',type:'withdrawal',date:'2026-10-20',currency:'USD',amount:'80',fromAccountId:'bank',toAccountId:'',sourceType:'manual',sourceId:'',reference:'',notes:'',reconciledAt:'',voidedAt:'',voidReason:'',createdAt:at('2026-10-20'),updatedAt:at('2026-10-20')}];
  const advisor=await build(vault);
  assert.equal(advisor.purchasing.postedPurchases,1);
  assert.deepEqual(advisor.purchasing.byCurrency.map(row=>[row.currency,row.purchases,row.expenses]),[['EUR','0.00','20.00'],['USD','10.00','0.00']]);
  assert.equal(advisor.expenses.count,1);
  assert.equal(advisor.inventory.rows[0].quantity,'5');
  assert.equal(advisor.inventory.rows[0].state,'positive');
  assert.equal(advisor.treasury.accounts[0].balance,'100.00');
});
