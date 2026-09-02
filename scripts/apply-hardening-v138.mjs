import { readFile, writeFile, unlink } from 'node:fs/promises';

async function load(path){return readFile(path,'utf8');}
async function save(path,content){await writeFile(path,content);}
function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(from,to);
}

// 1) Preserve 4-decimal unit-cost precision through quantity multiplication.
{
  const path='src/lib/profitability.ts';
  let s=await load(path);
  s=replaceOnce(s,
`function nonNegativeMoney(value:unknown):bigint|null{\n  if(typeof value!=='string'||!value.trim()||!isDecimalInput(value))return null;\n  const cents=decimalToScaled(value,2);\n  return cents<0n?null:cents;\n}`,
`function nonNegativeScaled(value:unknown,decimals=2):bigint|null{\n  if(typeof value!=='string'||!value.trim()||!isDecimalInput(value))return null;\n  const scaled=decimalToScaled(value,decimals);\n  return scaled<0n?null:scaled;\n}`,'profit helper');
  s=replaceOnce(s,
`    const unitCost=nonNegativeMoney(item.unitCost);\n    if(unitCost===null){missingCostItems+=1;continue;}\n    itemCost+=decimalToScaled(lineTotal(item.quantity,centsString(unitCost)),2);\n    costedItems+=1;`,
`    const unitCost=nonNegativeScaled(item.unitCost,4);\n    if(unitCost===null){missingCostItems+=1;continue;}\n    // Keep the full 4-decimal unit cost until quantity multiplication; only the line total rounds to cents.\n    itemCost+=decimalToScaled(lineTotal(item.quantity,item.unitCost),2);\n    costedItems+=1;`,'profit item precision');
  s=replaceOnce(s,
`  const shippingCost=nonNegativeMoney(document.internalCosts?.shippingCost??'0.00')??0n;\n  const otherCost=nonNegativeMoney(document.internalCosts?.otherCost??'0.00')??0n;`,
`  const shippingCost=nonNegativeScaled(document.internalCosts?.shippingCost??'0.00',2)??0n;\n  const otherCost=nonNegativeScaled(document.internalCosts?.otherCost??'0.00',2)??0n;`,'profit overhead precision');
  await save(path,s);
}

// 2) Make receivables/payment summaries truly as-of-date aware.
{
  const path='src/lib/payments.ts';
  let s=await load(path);
  s=replaceOnce(s,
`export function invoicePayments(invoiceId:string,payments:PaymentRecord[]):PaymentRecord[]{return payments.filter(payment=>payment.invoiceId===invoiceId);}\nexport function paidAmount(invoiceId:string,payments:PaymentRecord[]):string{let cents=0n;for(const payment of invoicePayments(invoiceId,payments))cents+=decimalToScaled(payment.amount,2);return centsString(cents);}\nexport function invoiceCreditAmount(invoiceId:string,documents:LourexDocument[]):string{`,
`export function invoicePayments(invoiceId:string,payments:PaymentRecord[],asOf=''):PaymentRecord[]{return payments.filter(payment=>payment.invoiceId===invoiceId&&(!asOf||(isIsoDate(payment.date)&&payment.date<=asOf)));}\nexport function paidAmount(invoiceId:string,payments:PaymentRecord[],asOf=''):string{let cents=0n;for(const payment of invoicePayments(invoiceId,payments,asOf))cents+=decimalToScaled(payment.amount,2);return centsString(cents);}\nexport function invoiceCreditAmount(invoiceId:string,documents:LourexDocument[],asOf=''):string{`,'payment as-of signatures');
  s=replaceOnce(s,
`    if(document.role!=='credit-note'||document.creditForId!==invoiceId||document.status!=='final'||document.lifecycleStatus==='voided')continue;`,
`    if(document.role!=='credit-note'||document.creditForId!==invoiceId||document.status!=='final'||document.lifecycleStatus==='voided')continue;\n    if(asOf&&(!isIsoDate(document.issueDate)||document.issueDate>asOf))continue;`,'credit as-of filter');
  s=replaceOnce(s,
`  const credits=invoiceCreditAmount(invoice.id,documents);`,
`  const credits=invoiceCreditAmount(invoice.id,documents,today);`,'summary credit as-of');
  s=replaceOnce(s,
`  const paid=paidAmount(invoice.id,payments);`,
`  const paid=paidAmount(invoice.id,payments,today);`,'summary payment as-of');
  await save(path,s);
}

{
  const path='src/lib/receivables.ts';
  let s=await load(path);
  s=replaceOnce(s,
`function activeInvoices(documents:LourexDocument[]):LourexDocument[]{return documents.filter(doc=>doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided');}`,
`function activeInvoices(documents:LourexDocument[],asOf=''):LourexDocument[]{return documents.filter(doc=>doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&(!asOf||(/^\\d{4}-\\d{2}-\\d{2}$/.test(doc.issueDate)&&doc.issueDate<=asOf)));}`,'active invoices as-of');
  s=s.replaceAll('for(const invoice of activeInvoices(documents)){','for(const invoice of activeInvoices(documents,today)){');
  s=replaceOnce(s,
`  for(const invoice of activeInvoices(documents)){const id=customerIdFor(invoice);if(id)ids.add(id);}`,
`  for(const invoice of activeInvoices(documents,today)){const id=customerIdFor(invoice);if(id)ids.add(id);}`,'customer ids as-of');
  s=replaceOnce(s,
`  const invoices=activeInvoices(documents).filter(invoice=>customerIdFor(invoice)===customerId);`,
`  const invoices=activeInvoices(documents,today).filter(invoice=>customerIdFor(invoice)===customerId);`,'statement invoices as-of');
  s=replaceOnce(s,
`    for(const credit of documents.filter(doc=>doc.role==='credit-note'&&doc.creditForId===invoice.id&&doc.status==='final'&&doc.lifecycleStatus!=='voided')){`,
`    for(const credit of documents.filter(doc=>doc.role==='credit-note'&&doc.creditForId===invoice.id&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(doc.issueDate)&&doc.issueDate<=today)){`,'statement credits as-of');
  s=replaceOnce(s,
`    for(const payment of invoicePayments(invoice.id,payments))push(invoice.currency,{date:payment.date,reference:payment.reference||payment.id,type:'payment',description:payment.reference||invoice.number,debit:0n,credit:decimalToScaled(payment.amount,2),relatedInvoiceNumber:invoice.number,order:3});`,
`    for(const payment of invoicePayments(invoice.id,payments,today))push(invoice.currency,{date:payment.date,reference:payment.reference||payment.id,type:'payment',description:payment.reference||invoice.number,debit:0n,credit:decimalToScaled(payment.amount,2),relatedInvoiceNumber:invoice.number,order:3});`,'statement payments as-of');
  await save(path,s);
}

// 3) Partial credit notes must never inherit full internal overhead costs.
{
  const path='src/lib/document-lifecycle.ts';
  let s=await load(path);
  s=replaceOnce(s,
`const reference=source.language==='ar'?\`مرجع الفاتورة: \${source.number}\`:source.language==='bilingual'?\`Credit against \${source.number} / مرجع الفاتورة: \${source.number}\`:\`Credit against \${source.number}\`;const remarks=[reference,copy.terms.remarks.trim()].filter(Boolean).join('\\n');return{...copy,kind:'invoice',role:'credit-note',status:'draft',lifecycleStatus:'active',revision:1,creditForId:source.id,creditForNumber:source.number,voidedAt:'',voidReason:'',convertedFromId:'',dueDate:'',items,adjustments,appearance:{...copy.appearance,showBank:false},terms:{...copy.terms,remarks}};}`,
`const reference=source.language==='ar'?\`مرجع الفاتورة: \${source.number}\`:source.language==='bilingual'?\`Credit against \${source.number} / مرجع الفاتورة: \${source.number}\`:\`Credit against \${source.number}\`;const remarks=[reference,copy.terms.remarks.trim()].filter(Boolean).join('\\n');const internalCosts=fullCredit?{...copy.internalCosts}:{shippingCost:'0.00',otherCost:'0.00'};return{...copy,kind:'invoice',role:'credit-note',status:'draft',lifecycleStatus:'active',revision:1,creditForId:source.id,creditForNumber:source.number,voidedAt:'',voidReason:'',convertedFromId:'',dueDate:'',items,adjustments,internalCosts,appearance:{...copy.appearance,showBank:false},terms:{...copy.terms,remarks}};}`,'partial credit internal costs');
  await save(path,s);
}

// 4) Inventory audit trail: reversal date is the actual reversal date; manual movements reverse instead of delete.
{
  const path='src/lib/operations.ts';
  let s=await load(path);
  s=replaceOnce(s,
`function purchaseMovement(purchase:PurchaseRecord,item:PurchaseRecord['items'][number],type:'purchase'|'purchase-reversal',quantity:string,note=''):InventoryMovementRecord{\n  return {\n    id:makeId('stock'),itemId:item.savedItemId,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku,date:purchase.date,type,`,
`function purchaseMovement(purchase:PurchaseRecord,item:PurchaseRecord['items'][number],type:'purchase'|'purchase-reversal',quantity:string,note='',movementDate=purchase.date):InventoryMovementRecord{\n  return {\n    id:makeId('stock'),itemId:item.savedItemId,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku,date:movementDate,type,`,'purchase movement date');
  s=replaceOnce(s,
`  const movements=purchase.items.filter(item=>item.savedItemId).map(item=>purchaseMovement(purchase,item,'purchase-reversal',trimFixed(fixed(-decimalToScaled(item.quantity,4),4)),reason.trim()));`,
`  const reversalDate=todayIso();\n  const movements=purchase.items.filter(item=>item.savedItemId).map(item=>purchaseMovement(purchase,item,'purchase-reversal',trimFixed(fixed(-decimalToScaled(item.quantity,4),4)),reason.trim(),reversalDate));`,'purchase reversal date');
  s=replaceOnce(s,
`export interface InventoryBalance { item:SavedItem; quantity:string; quantityScaled:bigint; }`,
`export function reverseManualInventoryMovement(movement:InventoryMovementRecord,date=todayIso()):InventoryMovementRecord{\n  if(!inventoryMovementIsManual(movement))throw new Error('Only manual inventory movements can be reversed here.');\n  if(!isIsoDate(date))throw new Error('Movement date is invalid.');\n  const quantity=decimalToScaled(movement.quantity,4);\n  if(quantity===0n)throw new Error('Movement quantity cannot be zero.');\n  return {\n    ...movement,id:makeId('stock'),date,type:'adjustment',quantity:trimFixed(fixed(-quantity,4)),sourceId:movement.id,sourceNumber:movement.sourceNumber||movement.id,\n    note:[\`Reversal of \${movement.type}\`,movement.note].filter(Boolean).join(' — '),createdAt:nowIso()\n  };\n}\n\nexport interface InventoryBalance { item:SavedItem; quantity:string; quantityScaled:bigint; }`,'manual movement reversal');
  await save(path,s);
}

// 5) App-level referential integrity and one canonical issue path for save/print/PDF/share.
{
  const path='src/app/App.tsx';
  let s=await load(path);
  s=replaceOnce(s,
`import { inventoryMovementIsManual, postPurchase, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';`,
`import { inventoryMovementIsManual, postPurchase, reverseManualInventoryMovement, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';`,'app operations import');
  s=replaceOnce(s,
`  private deleteSavedItem=async(item:SavedItem)=>{const vault=this.requireVault();await this.persist({...vault,savedItems:vault.savedItems.filter(x=>x.id!==item.id)});this.showToast(t('Saved item deleted.','تم حذف الصنف المحفوظ.'),'success');};`,
`  private deleteSavedItem=async(item:SavedItem)=>{const vault=this.requireVault();if(vault.inventoryMovements.some(movement=>movement.itemId===item.id)||vault.purchases.some(purchase=>purchase.items.some(line=>line.savedItemId===item.id)))throw new Error(t('This item has purchase or inventory history and cannot be deleted. Keep it for audit continuity.','لهذا الصنف سجل مشتريات أو مخزون ولا يمكن حذفه. احتفظ به لاستمرارية سجل التدقيق.'));await this.persist({...vault,savedItems:vault.savedItems.filter(x=>x.id!==item.id)});this.showToast(t('Saved item deleted.','تم حذف الصنف المحفوظ.'),'success');};`,'saved item referential integrity');
  s=replaceOnce(s,
`  private deleteSupplier=async(supplier:Supplier)=>{const vault=this.requireVault();await this.persist({...vault,suppliers:vault.suppliers.filter(item=>item.id!==supplier.id)});this.showToast(t('Supplier deleted. Historical purchase snapshots were preserved.','تم حذف المورد مع الاحتفاظ بنسخ بياناته داخل المشتريات التاريخية.'),'success');};`,
`  private deleteSupplier=async(supplier:Supplier)=>{const vault=this.requireVault();if(vault.expenses.some(expense=>expense.supplierId===supplier.id))throw new Error(t('This supplier is referenced by historical expenses and cannot be deleted.','هذا المورد مرتبط بمصروفات تاريخية ولا يمكن حذفه.'));await this.persist({...vault,suppliers:vault.suppliers.filter(item=>item.id!==supplier.id)});this.showToast(t('Supplier deleted. Historical purchase snapshots were preserved.','تم حذف المورد مع الاحتفاظ بنسخ بياناته داخل المشتريات التاريخية.'),'success');};`,'supplier referential integrity');
  s=replaceOnce(s,
`  private deleteInventoryMovement=async(movement:InventoryMovementRecord)=>{if(!inventoryMovementIsManual(movement))throw new Error(t('Purchase inventory history must be reversed through the purchase.','يجب عكس سجل مخزون الشراء من عملية الشراء نفسها.'));const vault=this.requireVault();await this.persist({...vault,inventoryMovements:vault.inventoryMovements.filter(item=>item.id!==movement.id)});this.showToast(t('Manual inventory movement deleted.','تم حذف حركة المخزون اليدوية.'),'success');};`,
`  private deleteInventoryMovement=async(movement:InventoryMovementRecord)=>{if(!inventoryMovementIsManual(movement))throw new Error(t('Purchase inventory history must be reversed through the purchase.','يجب عكس سجل مخزون الشراء من عملية الشراء نفسها.'));const vault=this.requireVault();if(vault.inventoryMovements.some(item=>item.sourceId===movement.id&&item.type==='adjustment'))throw new Error(t('This manual movement has already been reversed.','تم عكس هذه الحركة اليدوية مسبقًا.'));const reversal=reverseManualInventoryMovement(movement);await this.persist({...vault,inventoryMovements:[...vault.inventoryMovements,reversal]});this.showToast(t('Manual inventory movement reversed with audit history preserved.','تم عكس حركة المخزون اليدوية مع الاحتفاظ بسجل التدقيق.'),'success');};`,'manual movement app reversal');
  const oldPrint=`  private requestPrint=async(doc:LourexDocument,mode:'print'|'pdf'|'share')=>{try{const errors=validateDocument(doc);if(Object.keys(errors).length)throw new Error(t('Complete the required document fields before printing or sharing.','أكمل الحقول المطلوبة قبل الطباعة أو المشاركة.'));const vault=this.requireVault();if(vault.documents.some(d=>d.id!==doc.id&&d.number.trim().toLowerCase()===doc.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));let target:LourexDocument;const existing=vault.documents.find(d=>d.id===doc.id);if(doc.status==='final'&&existing?.status==='final')target=structuredClone(doc);else{target={...structuredClone(doc),status:'final',updatedAt:new Date().toISOString()};assertCustomerCreditLimit(target,vault.customers,vault.documents,vault.payments);const idx=vault.documents.findIndex(d=>d.id===target.id);const documents=[...vault.documents];if(idx>=0)documents[idx]=target;else documents.push(target);await this.persist({...vault,documents});}const customer=target.customerSnapshot?.companyNameEn||target.customerSnapshot?.companyNameAr||'Customer';`;
  const newPrint=`  private requestPrint=async(doc:LourexDocument,mode:'print'|'pdf'|'share')=>{try{const errors=validateDocument(doc);if(Object.keys(errors).length)throw new Error(t('Complete the required document fields before printing or sharing.','أكمل الحقول المطلوبة قبل الطباعة أو المشاركة.'));const vault=this.requireVault();if(vault.documents.some(d=>d.id!==doc.id&&d.number.trim().toLowerCase()===doc.number.trim().toLowerCase()))throw new Error(t('Document number already exists.','رقم المستند مستخدم بالفعل.'));let target:LourexDocument;const existing=vault.documents.find(d=>d.id===doc.id);if(doc.status==='final'&&existing?.status==='final')target=structuredClone(doc);else{target={...structuredClone(doc),status:'final',updatedAt:new Date().toISOString()};await this.saveDocument(target,false);target=structuredClone(this.requireVault().documents.find(saved=>saved.id===target.id)??target);}const customer=target.customerSnapshot?.companyNameEn||target.customerSnapshot?.companyNameAr||'Customer';`;
  s=replaceOnce(s,oldPrint,newPrint,'canonical print issue path');
  await save(path,s);
}

// 6) UI wording: manual stock rows are reversed, not deleted.
{
  const path='src/components/OperationsPage.tsx';
  let s=await load(path);
  s=replaceOnce(s,
`  private deleteMovement=async(movement:InventoryMovementRecord)=>{if(!inventoryMovementIsManual(movement)){this.setState({error:t('Purchase-generated inventory movements cannot be deleted. Reverse the purchase instead.','لا يمكن حذف حركات المخزون الناتجة عن شراء. اعكس الشراء بدلًا من ذلك.')});return;}if(!window.confirm(t('Delete this inventory movement?','حذف حركة المخزون؟')))return;try{await this.props.onDeleteInventoryMovement(movement);}catch(e){this.fail(e);}};`,
`  private deleteMovement=async(movement:InventoryMovementRecord)=>{if(!inventoryMovementIsManual(movement)){this.setState({error:t('Purchase-generated inventory movements cannot be deleted. Reverse the purchase instead.','لا يمكن حذف حركات المخزون الناتجة عن شراء. اعكس الشراء بدلًا من ذلك.')});return;}if(!window.confirm(t('Reverse this manual inventory movement? The original record will stay in history.','عكس حركة المخزون اليدوية؟ سيبقى السجل الأصلي محفوظًا في التاريخ.')))return;try{await this.props.onDeleteInventoryMovement(movement);}catch(e){this.fail(e);}};`,'movement confirmation');
  s=s.replaceAll(`>{t('Delete','حذف')}</button>`,`>{t('Delete','حذف')}</button>`);
  await save(path,s);
}

// 7) Production source guard must fail closed if Vercel Git metadata is absent or wrong.
{
  const path='scripts/build.mjs';
  let s=await load(path);
  const from=`if(vercelEnvironment==='production'&&sourceRepoSlug&&sourceRepoSlug.toLowerCase()!==EXPECTED_REPO_SLUG.toLowerCase()){\n  throw new Error(\`Refusing production build from \${sourceRepoOwner||'unknown'}/\${sourceRepoSlug}. LOUREX Invoice production source must be \${EXPECTED_REPO_OWNER}/\${EXPECTED_REPO_SLUG}.\`);\n}\nif(vercelEnvironment==='production'&&sourceRepoOwner&&sourceRepoOwner.toLowerCase()!==EXPECTED_REPO_OWNER.toLowerCase()){\n  throw new Error(\`Refusing production build from owner \${sourceRepoOwner}. LOUREX Invoice production source must be \${EXPECTED_REPO_OWNER}/\${EXPECTED_REPO_SLUG}.\`);\n}`;
  const to=`if(vercelEnvironment==='production'){\n  if(!sourceRepoOwner||!sourceRepoSlug)throw new Error(\`Refusing production build without Vercel Git source metadata. LOUREX Invoice production source must be \${EXPECTED_REPO_OWNER}/\${EXPECTED_REPO_SLUG}.\`);\n  if(sourceRepoSlug.toLowerCase()!==EXPECTED_REPO_SLUG.toLowerCase()||sourceRepoOwner.toLowerCase()!==EXPECTED_REPO_OWNER.toLowerCase()){\n    throw new Error(\`Refusing production build from \${sourceRepoOwner}/\${sourceRepoSlug}. LOUREX Invoice production source must be \${EXPECTED_REPO_OWNER}/\${EXPECTED_REPO_SLUG}.\`);\n  }\n}`;
  s=replaceOnce(s,from,to,'fail-closed production source guard');
  await save(path,s);
}

// 8) Reproducible CI install.
{
  const path='.github/workflows/ci.yml';
  let s=await load(path);
  s=replaceOnce(s,'      - run: npm install','      - run: npm ci','CI npm ci');
  await save(path,s);
}

// 9) PWA runtime bump.
{
  const path='public/sw.js';
  let s=await load(path);
  s=s.replace(`// v137 — suppliers, purchases, expenses, landed cost and auditable inventory ledger; retains v136 commercial controls.`,`// v138 — post-batch accounting hardening: as-of receivables, precise costs, canonical issue path and audit-safe inventory reversals.\n// v137 compatibility retained for operations regression coverage.`);
  s=replaceOnce(s,`const CACHE = 'lourex-invoice-v137';`,`const CACHE = 'lourex-invoice-v138';`,'PWA cache bump');
  await save(path,s);
}

// 10) Regression coverage for the audit findings.
await writeFile('tests/hardening-v138.test.mjs',`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport { defaultCompany, emptyVault } from '../dist/src/lib/defaults.js';\nimport { createBlankDocument } from '../dist/src/lib/documents.js';\nimport { calculateProfitability } from '../dist/src/lib/profitability.js';\nimport { invoicePaymentSummary } from '../dist/src/lib/payments.js';\nimport { customerStatement, receivablesByCurrency } from '../dist/src/lib/receivables.js';\nimport { createCreditNoteDraft } from '../dist/src/lib/document-lifecycle.js';\nimport { createManualInventoryMovement, createPurchase, createPurchaseItem, postPurchase, reverseManualInventoryMovement, reversePurchase } from '../dist/src/lib/operations.js';\n\nfunction finalInvoice(){const doc=createBlankDocument('invoice','INV-2026-9001',defaultCompany());doc.status='final';doc.issueDate='2026-01-01';doc.dueDate='2026-01-31';doc.customerSnapshot={sourceCustomerId:'cust',companyNameEn:'Customer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};doc.items[0].descriptionEn='Bulk';doc.items[0].quantity='10000';doc.items[0].unitPrice='1.00';doc.items[0].unitCost='0.1234';return doc;}\n\ntest('v138 keeps 4-decimal unit cost precision until line-total rounding',()=>{const doc=finalInvoice();const p=calculateProfitability(doc);assert.equal(p.itemCost,'1234.00');assert.equal(p.netRevenue,'10000.00');assert.equal(p.grossProfit,'8766.00');});\n\ntest('v138 excludes future payments and future credit notes from as-of receivables and statements',()=>{const invoice=finalInvoice();invoice.items[0].quantity='1';invoice.items[0].unitPrice='1000.00';invoice.items[0].unitCost='500.00';const futureCredit=createCreditNoteDraft(invoice,'CN-2026-9001','200.00');futureCredit.status='final';futureCredit.issueDate='2026-03-01';const payments=[{id:'p1',invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:'cust',customerNameEn:'Customer',customerNameAr:'',currency:'USD',amount:'300.00',date:'2026-03-10',method:'cash',reference:'',notes:'',createdAt:'2026-03-10T00:00:00.000Z',updatedAt:'2026-03-10T00:00:00.000Z'}];const docs=[invoice,futureCredit];const jan=invoicePaymentSummary(invoice,payments,'2026-01-31',docs);assert.equal(jan.credits,'0.00');assert.equal(jan.paid,'0.00');assert.equal(jan.remaining,'1000.00');const march=invoicePaymentSummary(invoice,payments,'2026-03-31',docs);assert.equal(march.credits,'200.00');assert.equal(march.paid,'300.00');assert.equal(march.remaining,'500.00');assert.equal(receivablesByCurrency(docs,payments,'2026-01-31')[0].outstanding,'1000.00');const statement=customerStatement('cust',docs,payments,'2026-01-31')[0];assert.equal(statement.entries.length,1);assert.equal(statement.outstanding,'1000.00');});\n\ntest('v138 excludes invoices issued after the as-of date',()=>{const invoice=finalInvoice();invoice.issueDate='2026-04-01';assert.equal(receivablesByCurrency([invoice],[],'2026-03-31').length,0);});\n\ntest('v138 partial credit note resets inherited internal overhead and remains cost-incomplete',()=>{const invoice=finalInvoice();invoice.internalCosts={shippingCost:'100.00',otherCost:'50.00'};const credit=createCreditNoteDraft(invoice,'CN-2026-9002','100.00');assert.deepEqual(credit.internalCosts,{shippingCost:'0.00',otherCost:'0.00'});assert.equal(credit.items[0].unitCost,'');assert.equal(calculateProfitability(credit).complete,false);});\n\ntest('v138 purchase reversal uses reversal-day stock date and manual movement reverses instead of deleting history',()=>{const item={id:'item-1',createdAt:'x',updatedAt:'x',descriptionEn:'Item',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'1.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:''};const supplier={id:'s1',createdAt:'x',updatedAt:'x',nameEn:'S',nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',paymentTerms:'',notes:''};let purchase=createPurchase([], [supplier], 'USD');purchase.date='2026-01-01';purchase.items=[createPurchaseItem(item)];purchase.items[0].descriptionEn='Item';purchase.items[0].quantity='2';purchase.items[0].unitCost='1.00';const posted=postPurchase(purchase,[item],[]);const reversed=reversePurchase(posted.purchase,'cancel',posted.movements,posted.savedItems);assert.notEqual(reversed.movements[0].date,'2026-01-01');const manual=createManualInventoryMovement(item,'opening','5','2026-01-01');const undo=reverseManualInventoryMovement(manual,'2026-02-01');assert.equal(undo.quantity,'-5');assert.equal(undo.date,'2026-02-01');assert.equal(undo.sourceId,manual.id);});\n\ntest('v138 source contains referential guards and print uses canonical saveDocument issue path',async()=>{const app=await readFile('src/app/App.tsx','utf8');const build=await readFile('scripts/build.mjs','utf8');const sw=await readFile('public/sw.js','utf8');const ci=await readFile('.github/workflows/ci.yml','utf8');assert.match(app,/purchase or inventory history and cannot be deleted/);assert.match(app,/historical expenses and cannot be deleted/);assert.match(app,/reverseManualInventoryMovement/);assert.match(app,/await this\.saveDocument\(target,false\)/);assert.doesNotMatch(app,/await this\.persist\(\{\.\.\.vault,documents\}\);\}const customer=target/);assert.match(build,/without Vercel Git source metadata/);assert.match(sw,/const CACHE = 'lourex-invoice-v138'/);assert.match(ci,/run: npm ci/);});\n`);

// Temporary hardening tooling must not survive the resulting product commit.
await unlink('scripts/apply-hardening-v138.mjs');
await unlink('.github/workflows/apply-hardening-v138.yml');
console.log('v138 hardening patches applied; temporary tooling removed from working tree.');
