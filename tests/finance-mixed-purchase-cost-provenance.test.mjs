import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,inventoryBalances} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {calculateProfitability} from '../dist/src/lib/profitability.js';

/** Synthetic, read-only characterization of historical unit-cost provenance.
 * This test does NOT authorize FIFO, weighted average, specific identification,
 * cross-currency valuation or an accounting policy change. */
function seed(){
 const vault=emptyVault(),now='2026-10-24T00:00:00.000Z';
 const supplier={...createSupplier(),id:'supplier-mixed-cost-qa',nameEn:'Synthetic Cost Vendor'};
 const item={
  id:'item-mixed-cost-qa',sku:'COST-QA-100',descriptionEn:'Industrial carton',descriptionAr:'كرتون اختبار',
  createdAt:now,updatedAt:now,unit:'Carton',inventoryTracking:'tracked',
  workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId,
  lastUnitCost:'',lastCostCurrency:'',lastUnitPrice:'20.00',lastCurrency:'USD'
 };
 vault.savedItems=[item];vault.suppliers=[supplier];
 return{vault,item,supplier};
}
function buy(source,item,supplier,id,quantity,price,freight,currency='USD'){
 const p=createPurchase(source.purchases,[supplier],currency);
 p.id=id;p.number='PUR-'+id;p.date='2026-10-20';p.dueDate='2026-10-30';p.currency=currency;
 p.items=[{...createPurchaseItem(item),id:id+'-line',quantity,unitCost:price,landedUnitCost:''}];
 p.freight=freight;p.duty='0.00';p.otherCosts='0.00';
 const prior=JSON.stringify(source);
 const result=postPurchase(p,source.savedItems,source.inventoryMovements);
 assert.equal(JSON.stringify(source),prior,'posting helper cannot mutate its input');
 assert.equal(result.purchase.status,'posted');
 assert.equal(result.purchase.currency,currency,'synthetic purchase explicitly uses requested currency');
 assert.equal(result.movements.length,1,'one physical incoming movement per single purchase line');
 return {vault:{...source,purchases:[...source.purchases,result.purchase],
   inventoryMovements:[...source.inventoryMovements,...result.movements],savedItems:result.savedItems},result};
}
function issue(vault,item,quantity='3'){
 const document=createBlankDocument('invoice','INV-MIXED-COST-001',vault.company);
 document.id='invoice-mixed-cost-qa';document.issueDate='2026-10-22';
 document.dueDate='2026-10-30';document.status='final';document.role='standard';
 document.currency='USD';
 document.customerSnapshot={
  sourceCustomerId:'synthetic-buyer',companyNameEn:'Synthetic Buyer',companyNameAr:'عميل اختبار',
  contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
  vatTaxNumber:'',commercialRegistration:''
 };
 document.items=[{...document.items[0],id:'invoice-line-mixed-cost',savedItemId:item.id,
  skuSnapshot:item.sku,stockTreatment:'tracked',descriptionEn:item.descriptionEn,
  descriptionAr:item.descriptionAr,unit:item.unit,quantity,unitPrice:'20.00',
  unitCost:'10.00'}];
 return document;
}
const quantity=v=>inventoryBalances(v.savedItems,v.inventoryMovements).find(x=>x.item.id==='item-mixed-cost-qa').quantity;

test('distinct sequential landed purchase costs keep individual immutable receipt valuations',()=>{
 const {vault,item,supplier}=seed();
 const first=buy(vault,item,supplier,'mixed-01','4','5.00','4.00');
 assert.equal(first.result.purchase.items[0].landedUnitCost,'6.0000');
 assert.equal(first.result.movements[0].unitCost,'6.0000');
 assert.equal(first.result.movements[0].currency,'USD');
 const second=buy(first.vault,item,supplier,'mixed-02','2','9.00','2.00');
 assert.equal(second.result.purchase.items[0].landedUnitCost,'10.0000');
 assert.equal(second.result.movements[0].unitCost,'10.0000');
 assert.equal(second.vault.inventoryMovements[0].unitCost,'6.0000','new purchase must not revalue first receipt');
 assert.equal(second.vault.savedItems[0].lastUnitCost,'10.0000','current catalog cost is most recently posted receipt');
 assert.equal(quantity(second.vault),'6','stock combines physical quantities without collapsing historical costs');
});

test('sale issues only on final invoice, uses current cost snapshot once, and later purchases do not rewrite it',()=>{
 const {vault,item,supplier}=seed();
 const first=buy(vault,item,supplier,'mixed-01','4','5.00','4.00');
 const second=buy(first.vault,item,supplier,'mixed-02','2','9.00','2.00');
 const final=issue(second.vault,item);
 const draft={...final,status:'draft'};
 assert.equal(postIssuedInvoiceStock(second.vault,draft).created,false);
 assert.equal(quantity(second.vault),'6');
 const before=JSON.stringify(second.vault);
 const sold=postIssuedInvoiceStock(second.vault,final);
 assert.equal(sold.created,true);
 assert.equal(JSON.stringify(second.vault),before,'issue must not mutate source data');
 const debit=sold.vault.inventoryMovements.find(m=>m.sourceId===final.id);
 assert.ok(debit);
 assert.equal(debit.quantity,'-3.0000');
 assert.equal(debit.unitCost,'10.0000');
 assert.equal(debit.currency,'USD');
 assert.equal(quantity(sold.vault),'3');
 assert.equal(postIssuedInvoiceStock(sold.vault,final).created,false,'replay cannot double-debit stock');
 assert.equal(calculateProfitability(final).grossProfit,'30.00','profitability uses frozen invoice line unit cost');
 const third=buy(sold.vault,second.vault.savedItems[0],supplier,'mixed-03','1','15.00','0.00','EUR');
 assert.equal(third.vault.savedItems[0].lastUnitCost,'15.0000');
 assert.equal(third.vault.savedItems[0].lastCostCurrency,'EUR');
 assert.equal(third.vault.inventoryMovements.find(m=>m.sourceId===final.id).unitCost,'10.0000');
 assert.equal(third.vault.inventoryMovements.find(m=>m.sourceId===final.id).currency,'USD');
 assert.equal(third.vault.inventoryMovements.at(-1).currency,'EUR','purchase provenance retains its own currency without implicit FX');
 assert.equal(calculateProfitability(final).grossProfit,'30.00','later purchase must not retroactively alter issued document');
 assert.equal(quantity(third.vault),'4');
});

test('overselling mixed-price stock is blocked without a side effect or partial movement',()=>{
 const {vault,item,supplier}=seed();
 const first=buy(vault,item,supplier,'mixed-01','4','5.00','4.00');
 const second=buy(first.vault,item,supplier,'mixed-02','2','9.00','2.00');
 const final=issue(second.vault,item,'7');
 const before=JSON.stringify(second.vault);
 assert.throws(()=>postIssuedInvoiceStock(second.vault,final),/Insufficient stock/);
 assert.equal(JSON.stringify(second.vault),before,'oversell rejection must leave original ledger unchanged');
 assert.equal(quantity(second.vault),'6');
});
