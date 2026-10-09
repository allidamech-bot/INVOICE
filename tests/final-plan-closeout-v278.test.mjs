import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');

const globalSearch=read('src/components/GlobalSearch.tsx');
const products=read('src/components/ProductsInventoryWorkspace.tsx');
const productLibrary=read('src/components/ProductLibraryWorkspace.tsx');
const operations=read('src/components/OperationsPage.tsx');
const finance=read('src/components/FinanceWorkspace.tsx');
const receivables=read('src/components/ReceivablesPage.tsx');
const customers=read('src/components/CustomersPage.tsx');
const documents=read('src/components/DocumentsPage.tsx');
const app=read('src/app/App.tsx');

test('v278 global command palette owns the complete quick-create surface',()=>{
  for(const event of ['lourex-create-customer','lourex-create-product','lourex-create-purchase','lourex-create-expense','lourex-finance-payment'])assert.match(globalSearch,new RegExp(event));
  for(const label of ['New quotation','New invoice','New customer','New product','New purchase','New expense','Record payment'])assert.match(globalSearch,new RegExp(label,'i'));
  assert.match(globalSearch,/onNavigate\('receivables'\)/,'payments must route to Finance instead of duplicating payment logic');
});

test('v278 Products & Inventory has explicit ownership for products, balances and movements',()=>{
  assert.match(products,/type Tab='products'\|'prices'\|'inventory'\|'planning'\|'locations'\|'movements'/,'price lists and warehouse planning belong alongside products and movements');
  assert.match(products,/Inventory Movements/);
  assert.match(products,/inventoryView="balances"/);
  assert.match(products,/inventoryView="movements"/);
  assert.match(products,/onInspectInventory/);
  assert.match(products,/onInspectPurchases/);
  assert.match(productLibrary,/Stock & adjustments/,'product details must retain a direct stock-ledger inspection action');
  assert.match(productLibrary,/Purchase History/);
  assert.match(productLibrary,/ta-product-more/);
  assert.match(productLibrary,/Catalog details/);
});

test('v278 Purchasing reuses canonical supplier, purchase and inventory engines',()=>{
  assert.match(operations,/inventoryView\?:'all'\|'balances'\|'movements'/);
  assert.match(operations,/lourex-create-purchase/);
  assert.match(operations,/newPurchaseForSupplier/);
  assert.match(operations,/showSupplierPurchaseHistory/);
  assert.match(operations,/New Purchase/);
  assert.match(operations,/Historical purchases keep their own supplier snapshot/,'supplier history must retain saved purchase identities');
  assert.match(operations,/search:supplierLabel\(supplier\)/,'supplier purchase history must filter the canonical purchase ledger');
  assert.match(operations,/createPurchase\(/);
  assert.match(operations,/inventoryBalances\(/);
});

test('v278 Finance is the single owner for receivables, collections, statements and expenses',()=>{
  assert.match(finance,/Customer balances, collections & statements/);
  assert.match(finance,/tab==='receivables'/,'Finance must include a real receivables panel');
  assert.match(finance,/lourex-create-expense/);
  assert.match(finance,/lourex-finance-payment/);
  assert.match(finance,/lourex-finance-statement/);
  assert.match(receivables,/InvoicePaymentsPanel/,'Finance must reuse the canonical payment panel');
  assert.match(receivables,/onSavePayment/);
  assert.match(receivables,/onDeletePayment/);
  assert.match(receivables,/Record Payment/);
  assert.match(receivables,/CustomerStatementModal/);
});

test('v278 Customers and Documents expose contextual references without duplicating ownership',()=>{
  assert.match(customers,/lourex-create-customer/);
  assert.match(customers,/onViewStatement/);
  assert.match(customers,/View Statement/);
  assert.match(documents,/onRecordPayment/);
  assert.match(documents,/onCreateCreditNote/);
  assert.match(documents,/Record Payment/);
  assert.match(documents,/Create Credit Note/);
});

test('v278 App routes contextual actions to canonical domains and existing mutation boundaries',()=>{
  assert.match(app,/onSavePayment=\{this\.savePayment\}/);
  assert.match(app,/onDeletePayment=\{this\.deletePayment\}/);
  assert.match(app,/lourex-finance-payment/);
  assert.match(app,/lourex-finance-statement/);
  assert.match(app,/onCreateCreditNote=\{this\.launchCreditNote\}/,'document context must dispatch through the guarded credit-note mutation');
  assert.match(app,/private launchCreditNote=\(source:LourexDocument\)=>\{void this\.createCreditNote\(source\)/);
  assert.doesNotMatch(app,/screen:'finance'/,'internal compatibility ids remain stable until a separately validated migration');
});
