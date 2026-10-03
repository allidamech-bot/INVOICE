import type { Customer, DocumentEventRecord, ExpenseRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier } from '../types.js';
import { decimalToScaled } from './money.js';
import { purchaseAccountingIsValid, purchaseTotals } from './operations.js';
import { receivablesByCurrency, type CurrencyReceivableSummary } from './receivables.js';

export interface Relationship360Activity {
  id:string;
  at:string;
  kind:'document'|'payment'|'document-event'|'purchase'|'expense';
  reference:string;
  detail:string;
}

export interface Customer360DocumentRow {
  id:string;
  number:string;
  kind:LourexDocument['kind'];
  role:LourexDocument['role'];
  status:LourexDocument['status'];
  lifecycleStatus:LourexDocument['lifecycleStatus'];
  issueDate:string;
  dueDate:string;
  currency:string;
  updatedAt:string;
}

export interface Customer360ProductMention {
  key:string;
  label:string;
  unit:string;
  appearances:number;
  lastSeenAt:string;
}

export interface Customer360Snapshot {
  customerId:string;
  documentCount:number;
  quotationCount:number;
  invoiceCount:number;
  paymentCount:number;
  activeDocumentCount:number;
  financialPosition:CurrencyReceivableSummary[];
  recentDocuments:Customer360DocumentRow[];
  latestQuotation:Customer360DocumentRow|null;
  recentActivity:Relationship360Activity[];
  productMentions:Customer360ProductMention[];
  lastActivityAt:string;
}

export interface Supplier360SpendRow {currency:string;landedSpend:string;purchaseCount:number;}
export interface Supplier360PurchaseRow {
  id:string;
  number:string;
  date:string;
  currency:string;
  status:PurchaseRecord['status'];
  landedTotal:string;
  updatedAt:string;
}
export interface Supplier360ProductRow {
  savedItemId:string;
  sku:string;
  label:string;
  purchaseCount:number;
  lastUnitCost:string;
  lastCurrency:string;
  lastPurchaseDate:string;
}
export interface Supplier360Snapshot {
  supplierId:string;
  purchaseCount:number;
  postedPurchaseCount:number;
  draftPurchaseCount:number;
  reversedPurchaseCount:number;
  linkedExpenseCount:number;
  spendByCurrency:Supplier360SpendRow[];
  recentPurchases:Supplier360PurchaseRow[];
  recentActivity:Relationship360Activity[];
  products:Supplier360ProductRow[];
  lastActivityAt:string;
}

function centsString(cents:bigint):string{
  const sign=cents<0n?'-':'';
  const abs=cents<0n?-cents:cents;
  return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}
function stableCustomerDocument(doc:LourexDocument,customerId:string):boolean{return doc.customerSnapshot?.sourceCustomerId===customerId;}
function stableSupplierPurchase(purchase:PurchaseRecord,supplierId:string):boolean{return purchase.supplierSnapshot?.sourceSupplierId===supplierId;}
function newest(values:string[]):string{return values.filter(Boolean).sort((a,b)=>b.localeCompare(a))[0]??'';}
function activitySort(a:Relationship360Activity,b:Relationship360Activity):number{return b.at.localeCompare(a.at)||a.id.localeCompare(b.id);}
function documentDetail(doc:LourexDocument):string{return [doc.kind,doc.status,doc.lifecycleStatus,doc.currency].filter(Boolean).join(' · ');}
function itemLabel(item:LourexDocument['items'][number]):string{return (item.descriptionEn||item.descriptionAr||item.hsCode||'').trim();}

export function buildCustomer360(
  customer:Customer,
  documents:LourexDocument[],
  payments:PaymentRecord[],
  documentEvents:DocumentEventRecord[]
):Customer360Snapshot{
  const linkedDocuments=documents.filter(doc=>stableCustomerDocument(doc,customer.id));
  const linkedIds=new Set(linkedDocuments.map(doc=>doc.id));
  const linkedPayments=payments.filter(payment=>payment.customerId===customer.id||linkedIds.has(payment.invoiceId));
  const financialPosition=receivablesByCurrency(documents,payments,undefined,customer.id);
  const quotationCount=linkedDocuments.filter(doc=>doc.kind==='proforma'||doc.kind==='proforma-invoice').length;
  const invoiceCount=linkedDocuments.filter(doc=>doc.kind==='invoice'&&doc.role==='standard').length;
  const activeDocumentCount=linkedDocuments.filter(doc=>doc.lifecycleStatus!=='voided').length;
  const sortedDocuments=[...linkedDocuments].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.issueDate.localeCompare(a.issueDate));
  const documentRow=(doc:LourexDocument):Customer360DocumentRow=>({id:doc.id,number:doc.number,kind:doc.kind,role:doc.role,status:doc.status,lifecycleStatus:doc.lifecycleStatus,issueDate:doc.issueDate,dueDate:doc.dueDate,currency:doc.currency,updatedAt:doc.updatedAt});
  const recentDocuments=sortedDocuments.slice(0,12).map(documentRow);
  const latestQuote=sortedDocuments.find(doc=>doc.role==='standard'&&(doc.kind==='proforma'||doc.kind==='proforma-invoice')&&doc.lifecycleStatus!=='voided');
  const latestQuotation=latestQuote?documentRow(latestQuote):null;

  const productMap=new Map<string,Customer360ProductMention>();
  for(const doc of linkedDocuments.filter(row=>row.lifecycleStatus!=='voided')){
    for(const line of doc.items){
      const label=itemLabel(line);if(!label)continue;
      const unit=(line.unit||'').trim();const key=`${label.normalize('NFKC').toLowerCase()}|${unit.toLowerCase()}`;
      const current=productMap.get(key)??{key,label,unit,appearances:0,lastSeenAt:''};
      current.appearances+=1;current.lastSeenAt=newest([current.lastSeenAt,doc.updatedAt,doc.issueDate]);productMap.set(key,current);
    }
  }
  const productMentions=[...productMap.values()].sort((a,b)=>b.appearances-a.appearances||b.lastSeenAt.localeCompare(a.lastSeenAt)||a.label.localeCompare(b.label)).slice(0,12);

  const recentActivity:Relationship360Activity[]=[];
  for(const doc of linkedDocuments)recentActivity.push({id:`doc:${doc.id}`,at:doc.updatedAt||doc.issueDate,kind:'document',reference:doc.number,detail:documentDetail(doc)});
  for(const payment of linkedPayments)recentActivity.push({id:`payment:${payment.id}`,at:payment.updatedAt||payment.createdAt||payment.date,kind:'payment',reference:payment.reference||payment.invoiceNumber||payment.id,detail:[payment.invoiceNumber,payment.amount,payment.currency,payment.method].filter(Boolean).join(' · ')});
  for(const event of documentEvents)if(linkedIds.has(event.documentId))recentActivity.push({id:`event:${event.id}`,at:event.at,kind:'document-event',reference:event.documentNumber||event.relatedDocumentNumber||event.id,detail:[event.type,event.note].filter(Boolean).join(' · ')});
  recentActivity.sort(activitySort);

  return{
    customerId:customer.id,
    documentCount:linkedDocuments.length,
    quotationCount,
    invoiceCount,
    paymentCount:linkedPayments.length,
    activeDocumentCount,
    financialPosition,
    recentDocuments,
    latestQuotation,
    recentActivity:recentActivity.slice(0,20),
    productMentions,
    lastActivityAt:newest([customer.updatedAt,...recentActivity.map(row=>row.at)])
  };
}

export function buildSupplier360(
  supplier:Supplier,
  purchases:PurchaseRecord[],
  expenses:ExpenseRecord[],
  savedItems:SavedItem[]
):Supplier360Snapshot{
  const linkedPurchases=purchases.filter(purchase=>stableSupplierPurchase(purchase,supplier.id));
  const linkedExpenses=expenses.filter(expense=>expense.supplierId===supplier.id);
  const spendMap=new Map<string,{cents:bigint;purchaseCount:number}>();
  for(const purchase of linkedPurchases){
    if(purchase.status!=='posted'||!purchaseAccountingIsValid(purchase))continue;
    const currency=purchase.currency.trim().toUpperCase();const current=spendMap.get(currency)??{cents:0n,purchaseCount:0};
    current.cents+=decimalToScaled(purchaseTotals(purchase).landedTotal,2);current.purchaseCount+=1;spendMap.set(currency,current);
  }
  const spendByCurrency=[...spendMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>({currency,landedSpend:centsString(row.cents),purchaseCount:row.purchaseCount}));
  const recentPurchases=[...linkedPurchases].sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt)).slice(0,12).map(purchase=>({id:purchase.id,number:purchase.number,date:purchase.date,currency:purchase.currency,status:purchase.status,landedTotal:purchaseTotals(purchase).landedTotal,updatedAt:purchase.updatedAt}));

  const itemMap=new Map(savedItems.map(item=>[item.id,item]));
  const productMap=new Map<string,Supplier360ProductRow>();
  for(const purchase of linkedPurchases.filter(row=>row.status==='posted'&&purchaseAccountingIsValid(row)).sort((a,b)=>a.date.localeCompare(b.date)||a.updatedAt.localeCompare(b.updatedAt))){
    for(const line of purchase.items){
      if(!line.savedItemId)continue;
      const saved=itemMap.get(line.savedItemId);const label=(saved?.descriptionEn||saved?.descriptionAr||line.descriptionEn||line.descriptionAr||line.sku||'').trim();
      const current=productMap.get(line.savedItemId)??{savedItemId:line.savedItemId,sku:saved?.sku||line.sku||'',label,purchaseCount:0,lastUnitCost:'',lastCurrency:'',lastPurchaseDate:''};
      current.purchaseCount+=1;
      if(purchase.date>=current.lastPurchaseDate){current.lastUnitCost=line.landedUnitCost||line.unitCost||'';current.lastCurrency=purchase.currency;current.lastPurchaseDate=purchase.date;}
      productMap.set(line.savedItemId,current);
    }
  }
  const products=[...productMap.values()].sort((a,b)=>b.purchaseCount-a.purchaseCount||b.lastPurchaseDate.localeCompare(a.lastPurchaseDate)||a.label.localeCompare(b.label)).slice(0,12);

  const recentActivity:Relationship360Activity[]=[];
  for(const purchase of linkedPurchases)recentActivity.push({id:`purchase:${purchase.id}`,at:purchase.updatedAt||purchase.date,kind:'purchase',reference:purchase.number,detail:[purchase.status,purchase.currency,purchaseTotals(purchase).landedTotal].filter(Boolean).join(' · ')});
  for(const expense of linkedExpenses)recentActivity.push({id:`expense:${expense.id}`,at:expense.updatedAt||expense.createdAt||expense.date,kind:'expense',reference:expense.reference||expense.id,detail:[expense.category,expense.amount,expense.currency].filter(Boolean).join(' · ')});
  recentActivity.sort(activitySort);

  return{
    supplierId:supplier.id,
    purchaseCount:linkedPurchases.length,
    postedPurchaseCount:linkedPurchases.filter(row=>row.status==='posted').length,
    draftPurchaseCount:linkedPurchases.filter(row=>row.status==='draft').length,
    reversedPurchaseCount:linkedPurchases.filter(row=>row.status==='reversed').length,
    linkedExpenseCount:linkedExpenses.length,
    spendByCurrency,
    recentPurchases,
    recentActivity:recentActivity.slice(0,20),
    products,
    lastActivityAt:newest([supplier.updatedAt,...recentActivity.map(row=>row.at)])
  };
}
