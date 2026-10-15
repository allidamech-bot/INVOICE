import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock,assertInvoiceStockLedgerContinuity} from '../dist/src/lib/invoice-stock.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {inventoryBalances} from '../dist/src/lib/operations.js';

function fixture(stock='100'){
 const vault=emptyVault(),now=new Date().toISOString();
 const item={id:'stable-catalog-product',sku:'SKU-100',descriptionEn:'Cartons',descriptionAr:'كراتين',
  createdAt:now,updatedAt:now,hsCode:'',origin:'',packing:'',unit:'Carton',
  lastUnitPrice:'10.00',lastCurrency:'USD',lastUnitCost:'5.00',lastCostCurrency:'USD',
  usageCount:0,lastUsedAt:now,workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId};
 vault.savedItems=[item];
 vault.inventoryMovements=[createManualInventoryMovement(item,'opening',stock,undefined,'Initial documented legacy balance')];
 const document=createBlankDocument('invoice','INV-STOCK-1',vault.company);
 document.items=[{...document.items[0],id:'invoice-line-1',descriptionEn:item.descriptionEn,
  unit:item.unit,quantity:'2',unitPrice:'10.00',savedItemId:item.id,stockTreatment:'tracked',skuSnapshot:item.sku}];
 document.status='draft';
 vault.documents=[document];
 return {vault,item,document};
}
const balance=(v)=>inventoryBalances(v.savedItems,v.inventoryMovements).find(r=>r.item.id==='stable-catalog-product').quantity;
test('quote, proforma and draft cannot issue inventory; final invoice posts once independently of payment',()=>{
 const {vault,document}=fixture();
 assert.equal(balance(vault),'100');
 assert.equal(postIssuedInvoiceStock(vault,{...document,kind:'proforma',status:'final'}).created,false);
 assert.equal(postIssuedInvoiceStock(vault,document).created,false);
 const final={...document,status:'final'};
 const issued=postIssuedInvoiceStock(vault,final);
 assert.equal(issued.created,true);
 assert.equal(balance(issued.vault),'98');
 assert.equal(issued.vault.inventoryMovements.filter(m=>m.sourceId===document.id).length,1);
 const paid={...issued.vault,payments:[{invoiceId:document.id,amount:'20.00'}]};
 assert.equal(balance(paid),'98');
 const repeated=postIssuedInvoiceStock(issued.vault,final);
 assert.equal(repeated.created,false);
 assert.equal(balance(repeated.vault),'98');
});
test('fail closed for ambiguous lines, missing SKU, unit mismatch, insufficient stock and invalid invoice scope',()=>{
 const {vault,document}=fixture('5');
 const final={...document,status:'final'};
 const attempt=(patch,changes={})=>postIssuedInvoiceStock({...vault,...changes},{...final,items:[{...final.items[0],...patch}]});
 assert.throws(()=>attempt({savedItemId:'',stockTreatment:undefined}),/catalog stock item/);
 assert.throws(()=>attempt({savedItemId:'nonexistent'}),/missing, archived/);
 assert.throws(()=>attempt({skuSnapshot:'different'}),/SKU link/);
 assert.throws(()=>attempt({unit:'Piece'}),/Invoice unit differs/);
 assert.throws(()=>attempt({quantity:'8'}),/Insufficient stock/);
 assert.throws(()=>attempt({quantity:'0.00001'}),/quantity must be positive and precise/);
 assert.throws(()=>attempt({}, {appSettings:{...vault.appSettings,activeWorkspaceId:'other'}}),/another workspace/);
 assert.equal(balance(vault),'5','rejected issuance never mutates source vault');
});
test('explicit non-stock services do not debit stock and repeated printing remains financially independent',()=>{
 const {vault,document}=fixture();
 const final={...document,status:'final',items:[{...document.items[0],stockTreatment:'non-stock',savedItemId:'',skuSnapshot:''}]};
 const posted=postIssuedInvoiceStock(vault,final);
 assert.equal(posted.created,false);
 assert.equal(balance(posted.vault),'100');
 assert.throws(()=>postIssuedInvoiceStock(vault,{...final,items:[{...final.items[0],savedItemId:'stable-catalog-product'}]}),/Non-stock lines/);
});
test('merge refuses a final invoice without its stock issue but accepts one atomic posting',()=>{
 const {vault,document}=fixture(),final={...document,status:'final'};
 const without={...vault,documents:[final]};
 assert.throws(()=>mergeVaultIntent(vault,without,vault),/atomically/);
 const posted=postIssuedInvoiceStock(without,final).vault;
 const committed=mergeVaultIntent(vault,posted,vault);
 assert.equal(balance(committed),'98');
 assert.equal(committed.documents.find(d=>d.id===document.id).status,'final');
});
test('concurrent invoice issues cannot draw more stock than available',()=>{
 const {vault,document}=fixture('5');
 const first={...document,status:'final',items:[{...document.items[0],quantity:'3'}]};
 const posted=postIssuedInvoiceStock({...vault,documents:[first]},first).vault;
 const second={...document,id:'second-invoice',number:'INV-STOCK-2',items:[{...document.items[0],id:'second-line',quantity:'3'}],status:'final'};
 const secondIntent=postIssuedInvoiceStock({...vault,documents:[...vault.documents,second]},second).vault;
 assert.throws(()=>mergeVaultIntent(vault,secondIntent,posted),/Inventory cannot fall below zero|Insufficient stock|concurrent/i);
});
test('source-proof IDs are immutable, duplicate issue IDs and altered quantities are rejected',()=>{
 const {vault,document}=fixture(),final={...document,status:'final'};
 const posted=postIssuedInvoiceStock(vault,final).vault;
 const broken={...posted,inventoryMovements:posted.inventoryMovements.map(m=>m.sourceId===document.id?{...m,quantity:'-9.0000'}:m)};
 assert.throws(()=>postIssuedInvoiceStock(broken,final),/immutable stock history/);
 assert.throws(()=>assertInvoiceStockLedgerContinuity(vault.inventoryMovements,
  [...posted.inventoryMovements,...posted.inventoryMovements.filter(m=>m.sourceId===document.id)],
  vault.inventoryMovements),/Duplicate invoice stock/);
 assert.throws(()=>assertInvoiceStockLedgerContinuity(posted.inventoryMovements,
  posted.inventoryMovements.filter(m=>m.sourceId!==document.id),
  posted.inventoryMovements),/immutable/);
});
