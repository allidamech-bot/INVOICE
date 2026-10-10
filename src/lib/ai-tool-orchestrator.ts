import type { VaultPayload } from '../types.js';
import { calculateTotals, decimalToScaled, lineTotal, normalizeDecimalInput } from './money.js';
import { customerReceivables, customerStatement, receivableCustomerId } from './receivables.js';
import { inventoryBalances, purchaseTotals } from './operations.js';
import { supplierPayablesByCurrency } from './payables.js';
import { treasuryAccountBalance, treasuryProjection, treasuryTotals } from './treasury-ledger.js';
import { fxRateMatchForDate, convertWithFxMatch } from './fx-rates.js';
import { todayIso } from './id.js';
import { prepareAiBulkProductUpdate } from './ai-product-bulk-update.js';
import {prepareAiProductSourceImport} from './ai-product-source-import.js';
import {parseAiBulkProductTransformIntent,prepareAiBulkProductTransform} from './ai-product-bulk-transforms.js';
import {parseAiProductGroupPriceIntent,prepareAiProductGroupPrice} from './ai-product-group-price.js';
import {parseAiPartyMasterIntent,prepareAiPartyMaster} from './ai-party-master.js';
import {prepareApprovedPartyPatch} from './ai-approved-party-patch.js';

export type AiToolClass='read'|'calculate'|'prepare'|'execute'|'high-impact';
export type AiToolId=
  |'customer.getSummary'|'customer.getReceivables'|'customer.getHistory'
  |'supplier.getSummary'|'product.getSummary'|'product.getCostHistory'
  |'document.get'|'purchase.get'|'finance.getSummary'|'treasury.getSnapshot'|'reports.getMetrics'|'inventory.getStatus'|'search.records'
  |'pricing.margin'|'pricing.markup'|'pricing.targetPrice'|'landedCost.calculate'|'scenario.calculate'|'fx.convertUsingRecordedRate'|'receivables.aging'|'breakEven.calculate'|'inventory.coverage'
  |'quotation.prepare'|'invoice.prepare'|'customer.prepare'|'supplier.prepare'|'purchase.prepare'|'reminder.prepare'|'message.prepare'|'report.prepare'
  |'document.createDraft'|'document.updateDraft'|'customer.update'|'supplier.update'|'customer.master'|'supplier.master'|'product.updateMetadata'|'product.bulkUpdate'|'product.importSource'|'navigation.open'|'task.create'
  |'document.finalize'|'payment.record'|'inventory.adjust'|'financial.delete'|'accounting.post';

export interface AiToolDefinition{id:AiToolId;class:AiToolClass;description:string;approval:boolean;mutation:boolean;maxResultChars:number;}
export interface AiToolCall{id:string;tool:AiToolId;args:Record<string,unknown>;reason:string;}
export interface AiToolResult{id:string;tool:AiToolId;ok:boolean;class:AiToolClass;data:unknown;summary:string;source:string;}
export interface AiToolPlan{version:1;calls:AiToolCall[];goal:string;}
export interface AiToolExecutionProposal{capability:'tool.execute';tool:Extract<AiToolId,'customer.update'|'supplier.update'|'customer.master'|'supplier.master'|'product.updateMetadata'|'product.bulkUpdate'|'product.importSource'|'task.create'>;args:Record<string,unknown>;label:string;rationale:string;}
export interface AiToolRuntime{vault:VaultPayload;context:any;scope:'business'|'personal'|'temporary';workspaceId:string;branchId:string;}

const DEFS:AiToolDefinition[]=[
  ['customer.getSummary','read','Customer identity, receivables and recent commercial activity.',false,false,5000],
  ['customer.getReceivables','read','Customer receivables by currency.',false,false,4000],
  ['customer.getHistory','read','Recent customer documents and payments.',false,false,5000],
  ['supplier.getSummary','read','Supplier identity, purchases and payable exposure.',false,false,5000],
  ['product.getSummary','read','Product master, current stock and observed cost/price context.',false,false,5000],
  ['product.getCostHistory','read','Observed posted purchase cost history for one product.',false,false,5000],
  ['document.get','read','One LOUREX document by ID or number.',false,false,5000],
  ['purchase.get','read','One purchase record by ID or number.',false,false,5000],
  ['finance.getSummary','read','Deterministic Advisor V2 financial summary.',false,false,6000],
  ['treasury.getSnapshot','read','Cash/bank balances and treasury activity by currency.',false,false,5000],
  ['reports.getMetrics','read','Current deterministic finance/business report metrics.',false,false,6000],
  ['inventory.getStatus','read','Current recorded inventory quantities.',false,false,5000],
  ['search.records','read','Natural business search across scoped LOUREX records.',false,false,5000],
  ['pricing.margin','calculate','Calculate gross margin from deterministic numeric inputs.',false,false,1500],
  ['pricing.markup','calculate','Calculate markup on cost from deterministic numeric inputs.',false,false,1500],
  ['pricing.targetPrice','calculate','Calculate selling price required for a target gross margin.',false,false,1500],
  ['landedCost.calculate','calculate','Calculate landed total and landed unit cost.',false,false,1800],
  ['scenario.calculate','calculate','Apply an explicit percentage scenario to one stated numeric base.',false,false,1800],
  ['fx.convertUsingRecordedRate','calculate','Convert using an exact recorded LOUREX FX rate and date.',false,false,1800],
  ['receivables.aging','calculate','Return deterministic aging buckets for a customer.',false,false,3500],
  ['breakEven.calculate','calculate','Calculate break-even units/revenue from explicit costs and price.',false,false,1800],
  ['inventory.coverage','calculate','Calculate stock coverage from stock and average daily usage.',false,false,1800],
  ['quotation.prepare','prepare','Prepare a review-only quotation draft payload.',true,false,3500],
  ['invoice.prepare','prepare','Prepare a review-only invoice draft payload.',true,false,3500],
  ['customer.prepare','prepare','Prepare customer details for review.',true,false,3000],
  ['supplier.prepare','prepare','Prepare supplier details for review.',true,false,3000],
  ['purchase.prepare','prepare','Prepare a purchase draft payload for review.',true,false,3500],
  ['reminder.prepare','prepare','Prepare a reminder without scheduling or sending it.',true,false,2500],
  ['message.prepare','prepare','Prepare external communication without sending it.',true,false,2500],
  ['report.prepare','prepare','Prepare a report specification without changing records.',true,false,2500],
  ['document.createDraft','execute','Create a LOUREX draft only after visible approval.',true,true,3000],
  ['document.updateDraft','execute','Update an existing LOUREX draft only after visible approval.',true,true,3000],
  ['customer.update','execute','Update customer master data after visible approval.',true,true,2500],
  ['customer.master','execute','Review an exact new or existing customer master record before one guarded save.',true,true,3000],
  ['supplier.update','execute','Update supplier master data after visible approval.',true,true,2500],
  ['supplier.master','execute','Review an exact new or existing supplier master record before one guarded save.',true,true,3000],
  ['product.updateMetadata','execute','Update product metadata after visible approval.',true,true,2500],
  ['product.bulkUpdate','execute','Stage bounded exact matched product SKU, price or category edits for one reviewable approval.',true,true,3200],
  ['product.importSource','execute','Stage all verified rows from attached product catalogs for explicit review and atomic registration.',true,true,3200],
  ['navigation.open','execute','Navigate to a LOUREX workspace after approval.',true,false,1000],
  ['task.create','execute','Create an encrypted assistant task after visible approval.',true,true,2500],
  ['document.finalize','high-impact','Finalize a business document.',true,true,800],
  ['payment.record','high-impact','Record a financial payment.',true,true,800],
  ['inventory.adjust','high-impact','Adjust stock.',true,true,800],
  ['financial.delete','high-impact','Delete a financial record.',true,true,800],
  ['accounting.post','high-impact','Post an accounting entry.',true,true,800]
].map(([id,cls,description,approval,mutation,maxResultChars])=>({id:id as AiToolId,class:cls as AiToolClass,description:String(description),approval:Boolean(approval),mutation:Boolean(mutation),maxResultChars:Number(maxResultChars)}));
export const AI_TOOL_REGISTRY:ReadonlyArray<AiToolDefinition>=Object.freeze(DEFS);
const DEF_BY_ID=new Map(AI_TOOL_REGISTRY.map(row=>[row.id,row]));
const HIGH_IMPACT=new Set(AI_TOOL_REGISTRY.filter(row=>row.class==='high-impact').map(row=>row.id));
const EXECUTE=new Set(AI_TOOL_REGISTRY.filter(row=>row.class==='execute').map(row=>row.id));
const PREPARE=new Set(AI_TOOL_REGISTRY.filter(row=>row.class==='prepare').map(row=>row.id));
const MONEY=/^\d{1,15}(?:\.\d{1,8})?$/;

function clean(value:unknown,max=160):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function lower(value:unknown):string{return clean(value,500).toLowerCase();}
function currency(value:unknown):string{const result=clean(value,8).toUpperCase();return /^[A-Z]{3}$/.test(result)?result:'';}
function money(value:unknown):string{const result=normalizeDecimalInput(clean(value,40));return MONEY.test(result)?result:'';}
function int(value:unknown,min=0,max=100):number{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):min;}
function safeObject(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function fit(value:unknown,max:number):unknown{const text=JSON.stringify(value);if(text.length<=max)return value;return{truncated:true,preview:text.slice(0,max)};}
function cents(value:string):bigint{return decimalToScaled(value||'0',2);}
function formatScaled(value:bigint,decimals=2):string{const scale=10n**BigInt(decimals),sign=value<0n?'-':'',abs=value<0n?-value:value;return`${sign}${abs/scale}.${(abs%scale).toString().padStart(decimals,'0')}`;}
function roundDiv(a:bigint,b:bigint):bigint{if(b===0n)throw new Error('Division by zero.');const sign=(a<0n)!==(b<0n)?-1n:1n,x=a<0n?-a:a,y=b<0n?-b:b;return((x+y/2n)/y)*sign;}
function matches(haystack:string,query:string):boolean{const q=lower(query);return!q||lower(haystack).includes(q);}
function itemName(item:any):string{return clean(item.descriptionEn||item.descriptionAr||item.sku||'Product',140);}
function customerName(customer:any):string{return clean(customer?.companyNameEn||customer?.companyNameAr||customer?.contactPerson||'Customer',140);}
function supplierName(supplier:any):string{return clean(supplier?.nameEn||supplier?.nameAr||supplier?.contactPerson||'Supplier',140);}
function relevantEntity(runtime:AiToolRuntime,type:string):string{const entity=runtime.context?.assistantRuntime?.entity;return entity?.type===type?clean(entity.id,120):'';}
function findCustomer(runtime:AiToolRuntime,args:Record<string,unknown>):any|null{const id=clean(args.customerId,120)||relevantEntity(runtime,'customer');if(id)return runtime.vault.customers.find(row=>row.id===id)??null;const q=clean(args.query||args.name,160);if(!q)return null;const found=runtime.vault.customers.filter(row=>matches([row.companyNameEn,row.companyNameAr,row.contactPerson,row.phone,row.email].join(' '),q));if(found.length>1)throw new Error('Multiple records match. Search and select an exact record ID.');return found[0]??null;}
function findSupplier(runtime:AiToolRuntime,args:Record<string,unknown>):any|null{const id=clean(args.supplierId,120)||relevantEntity(runtime,'supplier');if(id)return runtime.vault.suppliers.find(row=>row.id===id)??null;const q=clean(args.query||args.name,160);if(!q)return null;const found=runtime.vault.suppliers.filter(row=>matches([row.nameEn,row.nameAr,row.contactPerson,row.phone,row.email].join(' '),q));if(found.length>1)throw new Error('Multiple records match. Search and select an exact record ID.');return found[0]??null;}
function findProduct(runtime:AiToolRuntime,args:Record<string,unknown>):any|null{const id=clean(args.itemId||args.productId,120)||relevantEntity(runtime,'product');if(id)return runtime.vault.savedItems.find(row=>row.id===id)??null;const q=clean(args.query||args.sku||args.name,160);if(!q)return null;const found=runtime.vault.savedItems.filter(row=>matches([row.sku,row.descriptionEn,row.descriptionAr,row.hsCode,row.category].join(' '),q));if(found.length>1)throw new Error('Multiple records match. Search and select an exact record ID.');return found[0]??null;}
function documentCustomerDraft(args:Record<string,unknown>):Record<string,string>|null{
  const row=safeObject(args.customer),companyNameEn=clean(row.companyNameEn||row.nameEn||args.customerName,160),companyNameAr=clean(row.companyNameAr||row.nameAr,160),fallback=clean(row.name||args.name,160);
  const result={companyNameEn:companyNameEn||(!/[\u0600-\u06ff]/.test(fallback)?fallback:''),companyNameAr:companyNameAr||(/[\u0600-\u06ff]/.test(fallback)?fallback:''),contactPerson:clean(row.contactPerson,120),addressEn:clean(row.addressEn||row.address,220),addressAr:clean(row.addressAr,220),city:clean(row.city,100),country:clean(row.country,100),phone:clean(row.phone,80),email:clean(row.email,160),vatTaxNumber:clean(row.vatTaxNumber,100),commercialRegistration:clean(row.commercialRegistration,100)};
  return result.companyNameEn||result.companyNameAr?result:null;
}
function documentCustomerMatch(runtime:AiToolRuntime,args:Record<string,unknown>):any|null{
  const direct=findCustomer(runtime,args);if(direct)return direct;const draft=documentCustomerDraft(args);if(!draft)return null;
  const exact=(value:unknown)=>lower(value).replace(/[^\p{L}\p{N}@+.]/gu,'');
  const email=exact(draft.email),phone=clean(draft.phone,80).replace(/\D/g,''),nameEn=exact(draft.companyNameEn),nameAr=exact(draft.companyNameAr);
  const rows=runtime.vault.customers.filter(row=>(email&&exact(row.email)===email)||(phone&&row.phone.replace(/\D/g,'')===phone)||(nameEn&&exact(row.companyNameEn)===nameEn)||(nameAr&&exact(row.companyNameAr)===nameAr));
  return rows.length===1?rows[0]:null;
}
function documentDraftItems(args:Record<string,unknown>):Record<string,string>[]{
  if(!Array.isArray(args.items))return[];
  if(args.items.length>20)throw new Error('Document has over 20 rows. No rows were omitted; split or review the complete source first.');
  const rows=args.items.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid document row. No rows were silently dropped.');
    const row=safeObject(value);
    const savedItemId=clean(row.savedItemId,120);
    const descriptionEn=clean(row.descriptionEn||row.description||row.name,160);
    const descriptionAr=clean(row.descriptionAr,160);
    if(!savedItemId&&!descriptionEn&&!descriptionAr)throw new Error('An item lacks its source-supported identity. No rows were silently dropped.');
    return{savedItemId,descriptionEn,descriptionAr,quantity:clean(row.quantity,24),unit:clean(row.unit,40),unitPrice:clean(row.unitPrice??row.price,24)};
  });
  return rows;
}
function findDocument(runtime:AiToolRuntime,args:Record<string,unknown>):any|null{const id=clean(args.documentId,120)||relevantEntity(runtime,'document');const number=clean(args.number||args.query||args.documentId,100);return runtime.vault.documents.find(row=>(id&&(row.id===id||lower(row.number)===lower(id)))||(number&&lower(row.number)===lower(number)))??null;}
function findPurchase(runtime:AiToolRuntime,args:Record<string,unknown>):any|null{const id=clean(args.purchaseId,120)||relevantEntity(runtime,'purchase');const number=clean(args.number||args.query,100);return runtime.vault.purchases.find(row=>(id&&row.id===id)||(number&&lower(row.number)===lower(number)))??null;}

export function aiToolPlannerCatalog(scope:'business'|'personal'|'temporary'='business'):Array<{id:AiToolId;class:AiToolClass;description:string;approval:boolean}>{
  if(scope==='personal')return AI_TOOL_REGISTRY.filter(row=>['message.prepare','reminder.prepare','task.create'].includes(row.id)).map(({id,class:cls,description,approval})=>({id,class:cls,description,approval}));
  return AI_TOOL_REGISTRY.map(({id,class:cls,description,approval})=>({id,class:cls,description,approval}));
}
export function createAiToolRuntime(vault:VaultPayload,context:any):AiToolRuntime{
  const scope=(context?.assistantRuntime?.scope==='personal'?'personal':context?.assistantRuntime?.scope==='temporary'?'temporary':'business') as AiToolRuntime['scope'];
  return{vault,context,scope,workspaceId:clean(context?.assistantRuntime?.workspaceId,120),branchId:clean(context?.assistantRuntime?.branchId,120)};
}
export function validateAiToolPlan(value:unknown,scope:'business'|'personal'|'temporary'='business'):AiToolPlan|null{
  if(!value||typeof value!=='object')return null;const raw=value as any;if(raw.version!==1||!Array.isArray(raw.calls)||raw.calls.length>5)return null;const allowed=new Set(aiToolPlannerCatalog(scope).map(row=>row.id));const calls:AiToolCall[]=[];
  for(const entry of raw.calls){if(!entry||typeof entry!=='object')return null;const tool=clean(entry.tool,80) as AiToolId;if(!allowed.has(tool)||!DEF_BY_ID.has(tool))return null;calls.push({id:clean(entry.id,80)||`tool-${calls.length+1}`,tool,args:safeObject(entry.args),reason:clean(entry.reason,220)});}
  return{version:1,calls,goal:clean(raw.goal,260)};
}

function readCustomerSummary(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const customer=findCustomer(runtime,args);if(!customer)throw new Error('Customer was not found in the active workspace.');const account=customerReceivables(runtime.vault.customers,runtime.vault.documents,runtime.vault.payments).find(row=>row.customerId===customer.id);const docs=runtime.vault.documents.filter(row=>receivableCustomerId(row)===customer.id).sort((a,b)=>b.issueDate.localeCompare(a.issueDate)).slice(0,8).map(row=>({id:row.id,number:row.number,kind:row.kind,status:row.status,date:row.issueDate,currency:row.currency,total:calculateTotals(row.items,row.adjustments).grandTotal}));return{id:customer.id,name:customerName(customer),city:customer.city,country:customer.country,preferredCurrency:customer.preferredCurrency,paymentTerms:customer.paymentTerms,creditLimit:customer.creditLimit,creditCurrency:customer.creditCurrency,receivables:account?.currencies??[],recentDocuments:docs};}
function readCustomerReceivables(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const customer=findCustomer(runtime,args);if(!customer)throw new Error('Customer was not found in the active workspace.');const account=customerReceivables(runtime.vault.customers,runtime.vault.documents,runtime.vault.payments).find(row=>row.customerId===customer.id);return{customerId:customer.id,name:customerName(customer),currencies:account?.currencies??[],hasOverdue:account?.hasOverdue??false,openInvoices:account?.openInvoices??0};}
function readCustomerHistory(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const customer=findCustomer(runtime,args);if(!customer)throw new Error('Customer was not found in the active workspace.');const statements=customerStatement(customer.id,runtime.vault.documents,runtime.vault.payments);return{customerId:customer.id,name:customerName(customer),statements:statements.map(row=>({...row,entries:row.entries.slice(-12)}))};}
function readSupplierSummary(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const supplier=findSupplier(runtime,args);if(!supplier)throw new Error('Supplier was not found in the active workspace.');const purchases=runtime.vault.purchases.filter(row=>row.supplierSnapshot?.sourceSupplierId===supplier.id).sort((a,b)=>b.date.localeCompare(a.date));const payables=supplierPayablesByCurrency(purchases,runtime.vault.supplierPayments,todayIso());return{id:supplier.id,name:supplierName(supplier),city:supplier.city,country:supplier.country,defaultCurrency:supplier.defaultCurrency,paymentTerms:supplier.paymentTerms,payables,recentPurchases:purchases.slice(0,8).map(row=>({id:row.id,number:row.number,date:row.date,status:row.status,currency:row.currency,total:purchaseTotals(row).landedTotal,subtotal:purchaseTotals(row).subtotal,landedTotal:purchaseTotals(row).landedTotal}))};}
function costHistory(runtime:AiToolRuntime,item:any):unknown[]{const rows:any[]=[];for(const purchase of runtime.vault.purchases){if(purchase.status!=='posted')continue;for(const line of purchase.items){if(line.savedItemId!==item.id)continue;rows.push({purchaseId:purchase.id,purchaseNumber:purchase.number,date:purchase.date,supplierId:purchase.supplierSnapshot?.sourceSupplierId||'',supplierName:purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||'',currency:purchase.currency,unitCost:line.unitCost,landedUnitCost:line.landedUnitCost||''});}}return rows.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);}
function readProductSummary(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const item=findProduct(runtime,args);if(!item)throw new Error('Product was not found in the active workspace.');const balance=inventoryBalances(runtime.vault.savedItems,runtime.vault.inventoryMovements).find(row=>row.item.id===item.id);return{id:item.id,sku:item.sku,name:itemName(item),hsCode:item.hsCode,origin:item.origin,unit:item.unit,lastUnitCost:item.lastUnitCost,lastCostCurrency:item.lastCostCurrency,lastUnitPrice:item.lastUnitPrice,lastCurrency:item.lastCurrency,quantity:balance?.quantity??'0',costHistory:costHistory(runtime,item).slice(0,5)};}
function readDocument(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const doc=findDocument(runtime,args);if(!doc)throw new Error('Document was not found in the active branch.');return{id:doc.id,number:doc.number,kind:doc.kind,role:doc.role,status:doc.status,lifecycleStatus:doc.lifecycleStatus,issueDate:doc.issueDate,dueDate:doc.dueDate,currency:doc.currency,customerName:doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'',supplierName:doc.supplierSnapshot?.nameEn||doc.supplierSnapshot?.nameAr||'',itemCount:doc.items.length,itemsTruncated:doc.items.length>20,items:doc.items.slice(0,20).map((row:any)=>({id:row.id,sku:row.sku,descriptionEn:row.descriptionEn,descriptionAr:row.descriptionAr,quantity:row.quantity,unit:row.unit,unitPrice:row.unitPrice,unitCost:row.unitCost})),totals:calculateTotals(doc.items,doc.adjustments),terms:doc.terms};}
function readPurchase(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const row=findPurchase(runtime,args);if(!row)throw new Error('Purchase was not found in the active branch.');return{id:row.id,number:row.number,date:row.date,dueDate:row.dueDate,status:row.status,currency:row.currency,supplierName:row.supplierSnapshot?.nameEn||row.supplierSnapshot?.nameAr||'',items:row.items.slice(0,20).map((item:any)=>({savedItemId:item.savedItemId,sku:item.sku,descriptionEn:item.descriptionEn,quantity:item.quantity,unit:item.unit,unitCost:item.unitCost,landedUnitCost:item.landedUnitCost}))};}
function treasurySnapshot(runtime:AiToolRuntime):unknown{const rows=treasuryProjection(runtime.vault.payments,runtime.vault.supplierPayments,runtime.vault.expenses,runtime.vault.treasuryEntries,runtime.vault.treasuryReconciliations,runtime.vault.company.defaultCurrency||'USD');const currencies=Array.from(new Set([...runtime.vault.treasuryAccounts.map(row=>row.currency),...rows.map(row=>row.currency)])).sort();return{accounts:runtime.vault.treasuryAccounts.filter(row=>row.active).map(row=>({id:row.id,label:row.label,kind:row.kind,currency:row.currency,balance:treasuryAccountBalance(row.id,runtime.vault.treasuryEntries)})),activity:currencies.map(code=>({currency:code,...treasuryTotals(rows,code)}))};}
function inventoryStatus(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const q=clean(args.query,160);return inventoryBalances(runtime.vault.savedItems,runtime.vault.inventoryMovements).filter(row=>!q||matches([row.item.sku,row.item.descriptionEn,row.item.descriptionAr].join(' '),q)).slice(0,30).map(row=>({itemId:row.item.id,sku:row.item.sku,name:itemName(row.item),quantity:row.quantity,state:row.quantityScaled<0n?'negative':row.quantityScaled===0n?'zero':'positive'}));}
function searchRecords(runtime:AiToolRuntime,args:Record<string,unknown>):unknown{const q=clean(args.query,160);if(q.length<2)throw new Error('Search query is too short.');const hits:any[]=[];const add=(type:string,id:string,label:string,meta:any={})=>{if(hits.length<20&&matches(`${label} ${JSON.stringify(meta)}`,q))hits.push({type,id,label,...meta});};for(const row of runtime.vault.customers)add('customer',row.id,customerName(row),{email:row.email,phone:row.phone});for(const row of runtime.vault.suppliers)add('supplier',row.id,supplierName(row),{email:row.email,phone:row.phone});for(const row of runtime.vault.savedItems)add('product',row.id,itemName(row),{sku:row.sku,hsCode:row.hsCode});for(const row of runtime.vault.documents)add('document',row.id,row.number,{kind:row.kind,date:row.issueDate});for(const row of runtime.vault.purchases)add('purchase',row.id,row.number,{date:row.date,supplier:row.supplierSnapshot?.nameEn||row.supplierSnapshot?.nameAr||''});return hits.slice(0,12);}

function requireMoney(args:Record<string,unknown>,key:string):string{const value=money(args[key]);if(!value)throw new Error(`${key} must be a non-negative decimal.`);return value;}
function calculation(tool:AiToolId,runtime:AiToolRuntime,args:Record<string,unknown>):unknown{
  if(tool==='pricing.margin'||tool==='pricing.markup'){const cost=requireMoney(args,'cost'),price=requireMoney(args,'price'),c=cents(cost),p=cents(price);if(p<=0n||c<0n)throw new Error('Price must be greater than zero.');const numerator=tool==='pricing.margin'?(p-c)*10_000n:(p-c)*10_000n,denominator=tool==='pricing.margin'?p:c;if(denominator<=0n)throw new Error('Cost must be greater than zero for markup.');return{cost,price,percent:formatScaled(roundDiv(numerator,denominator),2),basis:tool==='pricing.margin'?'gross-margin-on-sales':'markup-on-cost'};}
  if(tool==='pricing.targetPrice'){const cost=requireMoney(args,'cost'),target=requireMoney(args,'targetMarginPercent'),basis=decimalToScaled(target,2);if(basis>=10_000n)throw new Error('Target margin must be below 100%.');const result=roundDiv(decimalToScaled(cost,2)*10_000n,10_000n-basis);return{cost,targetMarginPercent:target,targetPrice:formatScaled(result,2)};}
  if(tool==='landedCost.calculate'){const quantity=requireMoney(args,'quantity'),unitCost=requireMoney(args,'unitCost'),freight=money(args.freight)||'0',duty=money(args.duty)||'0',otherCosts=money(args.otherCosts)||'0',goods=cents(lineTotal(quantity,unitCost)),total=goods+cents(freight)+cents(duty)+cents(otherCosts),qty=decimalToScaled(quantity,4);if(qty<=0n)throw new Error('Quantity must be greater than zero.');return{quantity,unitCost,goodsSubtotal:formatScaled(goods,2),freight,duty,otherCosts,landedTotal:formatScaled(total,2),landedUnitCost:formatScaled(roundDiv(total*10_000n,qty),2)};}
  if(tool==='scenario.calculate'){const base=requireMoney(args,'base'),percent=requireMoney(args,'percent'),direction=clean(args.direction,16)==='decrease'?'decrease':'increase',b=decimalToScaled(base,4),pct=decimalToScaled(percent,2),delta=roundDiv(b*pct,10_000n),result=direction==='decrease'?b-delta:b+delta;return{base,percent,direction,result:formatScaled(result,4)};}
  if(tool==='fx.convertUsingRecordedRate'){const amount=requireMoney(args,'amount'),from=currency(args.fromCurrency),to=currency(args.toCurrency),date=clean(args.date,10)||todayIso();if(!from||!to)throw new Error('Three-letter currencies are required.');const match=fxRateMatchForDate(runtime.vault.fxRates,from,to,date);if(!match)throw new Error(`No recorded LOUREX FX rate is available for ${from}/${to} on or before ${date}.`);return{amount,fromCurrency:from,toCurrency:to,date,converted:convertWithFxMatch(amount,match),rate:match.rate.rate,rateDate:match.rate.date,source:match.rate.sourceLabel,inverse:match.inverse};}
  if(tool==='receivables.aging')return readCustomerReceivables(runtime,args);
  if(tool==='breakEven.calculate'){const fixed=requireMoney(args,'fixedCosts'),price=requireMoney(args,'unitPrice'),variable=requireMoney(args,'unitVariableCost'),contribution=cents(price)-cents(variable);if(contribution<=0n)throw new Error('Unit price must exceed unit variable cost.');const units=(cents(fixed)+contribution-1n)/contribution;return{fixedCosts:fixed,unitPrice:price,unitVariableCost:variable,contributionPerUnit:formatScaled(contribution,2),breakEvenUnits:units.toString(),breakEvenRevenue:formatScaled(units*cents(price),2)};}
  if(tool==='inventory.coverage'){const stock=requireMoney(args,'stock'),usage=requireMoney(args,'averageDailyUsage'),u=decimalToScaled(usage,4);if(u<=0n)throw new Error('Average daily usage must be greater than zero.');return{stock,averageDailyUsage:usage,coverageDays:formatScaled(roundDiv(decimalToScaled(stock,4)*100n,u),2)};}
  throw new Error('Unsupported deterministic calculation.');
}

function prepare(tool:AiToolId,runtime:AiToolRuntime,args:Record<string,unknown>):unknown{
  const boundedArgs=Object.fromEntries(Object.entries(args).slice(0,24).map(([key,value])=>[clean(key,60),typeof value==='string'?clean(value,500):Array.isArray(value)?value.slice(0,20):value]));
  if(tool==='quotation.prepare'||tool==='invoice.prepare'){const customer=documentCustomerMatch(runtime,args);return{status:'preview-only',kind:tool==='quotation.prepare'?'proforma':'invoice',customer:customer?{id:customer.id,name:customerName(customer)}:documentCustomerDraft(args),currency:currency(args.currency)||runtime.vault.company.defaultCurrency||'',items:documentDraftItems(args),notes:clean(args.notes,800),approvalRequired:false,nextAction:'Create a LOUREX draft when the user confirms.'};}
  if(tool==='customer.prepare')return{status:'preview-only',entity:'customer',fields:boundedArgs,approvalRequired:true};
  if(tool==='supplier.prepare')return{status:'preview-only',entity:'supplier',fields:boundedArgs,approvalRequired:true};
  if(tool==='purchase.prepare')return{status:'preview-only',entity:'purchase',fields:boundedArgs,approvalRequired:true};
  if(tool==='reminder.prepare')return{status:'preview-only',entity:'reminder',title:clean(args.title,160),dueAt:clean(args.dueAt,40),relatedEntityId:clean(args.relatedEntityId,120),approvalRequired:true};
  if(tool==='message.prepare')return{status:'preview-only',entity:'message',recipient:clean(args.recipient,160),channel:clean(args.channel,40),body:clean(args.body,2000),approvalRequired:true};
  if(tool==='report.prepare')return{status:'preview-only',entity:'report',title:clean(args.title,160),periodFrom:clean(args.periodFrom,10),periodTo:clean(args.periodTo,10),sections:Array.isArray(args.sections)?args.sections.slice(0,12).map(item=>clean(item,80)):[],approvalRequired:true};
  throw new Error('Unsupported prepare tool.');
}

export function proposalForExecutableTool(call:AiToolCall,runtime:AiToolRuntime):any|null{
  const args=safeObject(call.args);
  if(call.tool==='navigation.open'){const target=clean(args.target,30);if(!['home','documents','customers','receivables','reports','items','operations'].includes(target))return null;return{capability:'workspace.navigate',target,label:clean(args.label,80)||`Open ${target}`,rationale:call.reason||'Requested navigation.'};}
  if(call.tool==='product.updateMetadata'){const item=findProduct(runtime,args);if(!item)return null;const patch=safeObject(args.patch);return{capability:'item.updateMetadata',itemId:item.id,relatedItemId:'',patch,label:clean(args.label,80)||'Update product',rationale:call.reason||'Prepared product metadata update.'};}
  if(call.tool==='customer.master'||call.tool==='supplier.master'){
    if(runtime.scope!=='business')throw new Error('Party changes require Business scope.');
    const intent=args.intent as any;
    if(!intent||intent.party!==(call.tool==='customer.master'?'customer':'supplier'))throw new Error('Invalid party action type.');
    const batch=prepareAiPartyMaster(runtime.vault,intent);
    return{capability:'tool.execute',tool:call.tool,args:batch,preview:[batch.preview],label:(batch.mode==='create'?'Create ':'Update ')+batch.party, rationale:'Review the exact customer/supplier contact information before one approved local save.'};
  }
  if(call.tool==='product.importSource'){if(runtime.scope!=='business')throw new Error('Product registration requires Business scope.');const batch=prepareAiProductSourceImport(runtime.vault,args.sources,{generateMissingSku:args.generateMissingSku===true});return{capability:'tool.execute',tool:'product.importSource',args:batch,preview:batch.rows.map(row=>({...row.preview,fileName:row.fileName})),label:'Review '+batch.rows.length+' extracted products',rationale:'These rows were extracted from your attachments. Verify every description, price, currency and SKU before approving creation.'};}
  if(call.tool==='product.bulkUpdate'){if(runtime.scope!=='business')throw new Error('Bulk product edits require Business scope.');const batch=Object.hasOwn(args,'groupPrice')?prepareAiProductGroupPrice(runtime.vault,args.groupPrice):Object.hasOwn(args,'transform')?prepareAiBulkProductTransform(runtime.vault,args.transform):prepareAiBulkProductUpdate(runtime.vault,args.updates);return{capability:'tool.execute',tool:'product.bulkUpdate',args:batch,preview:batch.rows.map(row=>row.preview),label:'Review '+batch.rows.length+' product changes',rationale:'Review every old and new value before approving one atomic catalog update.'};}
  if(call.tool==='document.createDraft'){const kind=clean(args.kind,30)==='invoice'?'invoice':'proforma',customer=documentCustomerMatch(runtime,args),customerDraft=customer?null:documentCustomerDraft(args);return{capability:'document.createDraft',kind,customerId:customer?.id||'',customerDraft,currency:currency(args.currency)||runtime.vault.company.defaultCurrency||'USD',language:clean(args.language,12)==='ar'?'ar':clean(args.language,12)==='bilingual'?'bilingual':'en',items:documentDraftItems(args),incoterm:clean(args.incoterm,80),paymentTerms:clean(args.paymentTerms,120),deliveryTime:clean(args.deliveryTime,120),validity:clean(args.validity,100),remarks:clean(args.remarks,500),notes:clean(args.notes,500),label:clean(args.label,80)||'Create draft',rationale:call.reason||'Prepared draft creation.'};}
  if(call.tool==='document.updateDraft'){
    if((args.addItems!==undefined&&!Array.isArray(args.addItems))||(args.itemEdits!==undefined&&!Array.isArray(args.itemEdits)))
      throw new Error('Invalid draft edit arrays. No edits were omitted.');
    if((Array.isArray(args.addItems)&&args.addItems.length>20)||(Array.isArray(args.itemEdits)&&args.itemEdits.length>30))
      throw new Error('Document edit exceeds safe review limits. No edits were omitted.');
    const target=findDocument(runtime,args);
    if(!target||target.status!=='draft'||target.lifecycleStatus==='voided')return null;
    const addItems=documentDraftItems({items:args.addItems||[]});
    const itemEdits=Array.isArray(args.itemEdits)?args.itemEdits.map(value=>{
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid draft item edit. No edits were omitted.');
      return value;
    }):[];
    const validIds=new Set(target.items.map((item:{id:string})=>item.id));
    const editedIds=new Set<string>();
    for(const item of itemEdits){
      const edit=safeObject(item),id=clean(edit.itemId,120);
      if(!id||!validIds.has(id)||editedIds.has(id))throw new Error('Missing or duplicated draft line identity. No edits were omitted.');
      editedIds.add(id);
    }
    return{capability:'document.updateDraft',documentId:target.id,language:args.language,addItems,itemEdits,termsPatch:safeObject(args.termsPatch),notes:typeof args.notes==='string'?clean(args.notes,500):undefined,label:clean(args.label,80)||'Update draft',rationale:call.reason||'Prepared draft update.'};
  }
  if(call.tool==='customer.update'||call.tool==='supplier.update'){
    if(runtime.scope!=='business')throw new Error('Customer/supplier changes require Business scope.');
    const active=runtime.vault.appSettings.activeWorkspaceId||'default';
    if(runtime.workspaceId&&runtime.workspaceId!==active)throw new Error('Active company changed. Review the customer/supplier again.');
    const party=call.tool==='customer.update'?'customer':'supplier';
    const id=clean(party==='customer'?args.customerId:args.supplierId,120);
    if(!id)throw new Error('Choose the exact customer/supplier ID before approval.');
    const batch=prepareApprovedPartyPatch(runtime.vault,party,id,args.patch);
    return{capability:'tool.execute',tool:call.tool,args:batch,preview:[batch.preview],
      label:clean(args.label,80)||'Review '+party+' changes',
      rationale:'Recheck exact company, record revision and old/new fields when approval is applied.'};
  }
  if(call.tool==='task.create')return{capability:'tool.execute',tool:call.tool,args,label:clean(args.label,80)||call.tool,rationale:call.reason||'Prepared safe LOUREX action.'} as AiToolExecutionProposal;
  return null;
}
export function executeAiToolCall(runtime:AiToolRuntime,call:AiToolCall):AiToolResult{
  const def=DEF_BY_ID.get(call.tool);if(!def)return{id:call.id,tool:call.tool,ok:false,class:'read',data:null,summary:'Unknown tool.',source:'tool-registry'};
  if(runtime.scope==='personal'&&!['message.prepare','reminder.prepare','task.create'].includes(call.tool))return{id:call.id,tool:call.tool,ok:false,class:def.class,data:null,summary:'Business tools are unavailable in Personal scope.',source:'scope-guard'};
  if(HIGH_IMPACT.has(call.tool))return{id:call.id,tool:call.tool,ok:false,class:def.class,data:null,summary:'High-impact financial actions are never executed by LOUREX AI. Open the relevant workspace and complete the protected workflow manually.',source:'high-impact-guard'};
  if(EXECUTE.has(call.tool)){try{const proposal=proposalForExecutableTool(call,runtime);return{id:call.id,tool:call.tool,ok:Boolean(proposal),class:def.class,data:proposal,summary:proposal?'Approval proposal prepared.':'The requested action could not be safely prepared.',source:'approval-gate'};}catch(error){return{id:call.id,tool:call.tool,ok:false,class:def.class,data:null,summary:error instanceof Error?error.message:String(error),source:'approval-preflight'};}}
  try{let data:unknown;
    if(call.tool==='customer.getSummary')data=readCustomerSummary(runtime,call.args);else if(call.tool==='customer.getReceivables')data=readCustomerReceivables(runtime,call.args);else if(call.tool==='customer.getHistory')data=readCustomerHistory(runtime,call.args);else if(call.tool==='supplier.getSummary')data=readSupplierSummary(runtime,call.args);else if(call.tool==='product.getSummary')data=readProductSummary(runtime,call.args);else if(call.tool==='product.getCostHistory'){const item=findProduct(runtime,call.args);if(!item)throw new Error('Product was not found in the active workspace.');data={itemId:item.id,name:itemName(item),history:costHistory(runtime,item)};}else if(call.tool==='document.get')data=readDocument(runtime,call.args);else if(call.tool==='purchase.get')data=readPurchase(runtime,call.args);else if(call.tool==='finance.getSummary')data=runtime.context?.advisorV2??runtime.context?.finance??{};else if(call.tool==='treasury.getSnapshot')data=treasurySnapshot(runtime);else if(call.tool==='reports.getMetrics')data={finance:runtime.context?.finance??{},business:runtime.context?.business?.daily??{},health:runtime.context?.advisorV2?.health??{},missingData:runtime.context?.advisorV2?.missingData??[]};else if(call.tool==='inventory.getStatus')data=inventoryStatus(runtime,call.args);else if(call.tool==='search.records')data=searchRecords(runtime,call.args);else if(def.class==='calculate')data=calculation(call.tool,runtime,call.args);else if(PREPARE.has(call.tool))data=prepare(call.tool,runtime,call.args);else throw new Error('Tool is not implemented.');
    return{id:call.id,tool:call.tool,ok:true,class:def.class,data:fit(data,def.maxResultChars),summary:`${call.tool} completed deterministically.`,source:'lourex-local-engine'};
  }catch(error){return{id:call.id,tool:call.tool,ok:false,class:def.class,data:null,summary:error instanceof Error?error.message:String(error),source:'lourex-local-engine'};}
}
/** Prepare the whole plan before presenting any approval. If even one
 * prerequisite/read/high-impact step fails, do not offer a subset of actions:
 * those approvals would silently turn a multi-step request into partial work. */
export function executeAiToolPlan(runtime:AiToolRuntime,plan:AiToolPlan):{results:AiToolResult[];proposal:any|null;blockedHighImpact:boolean}{
  if(plan.calls.some(call=>['product.bulkUpdate','product.importSource','customer.master','supplier.master'].includes(call.tool))&&plan.calls.length!==1){return{results:plan.calls.map(call=>({id:call.id,tool:call.tool,ok:false,class:DEF_BY_ID.get(call.tool)?.class||'execute',data:null,summary:'Bulk product changes must be reviewed as one isolated atomic plan. No actions were applied.',source:'bulk-plan-guard'})),proposal:null,blockedHighImpact:plan.calls.some(call=>HIGH_IMPACT.has(call.tool))};}
  const results=plan.calls.map(call=>executeAiToolCall(runtime,call));
  const blockedHighImpact=results.some(row=>row.class==='high-impact');
  const hasExecutable=results.some(row=>row.class==='execute');
  const failures=results.filter(row=>!row.ok);
  if(hasExecutable&&failures.length){
    const blockers=failures.map(row=>row.tool).join(', ').slice(0,250);
    return{results:results.map(row=>row.class==='execute'&&row.ok?{
      ...row,ok:false,data:null,
      summary:`Plan preflight failed (${blockers}). No actions have been approved or applied. Correct the failed steps and retry the complete plan.`,
      source:'plan-preflight-guard'
    }:row),proposal:null,blockedHighImpact};
  }
  const proposals=results.filter(row=>row.class==='execute'&&row.ok).map(row=>row.data).filter(Boolean);
  return{results,proposal:proposals.length===1?proposals[0]:proposals.length?{capability:'tool.plan',steps:proposals,label:'Review action plan',rationale:plan.goal||'Multiple actions require approval.'}:null,blockedHighImpact};
}

export function deterministicAiToolPlan(message:string,runtime:AiToolRuntime):AiToolPlan|null{
  if(runtime.scope==='personal')return null;const q=lower(message),entity=runtime.context?.assistantRuntime?.entity;
  const call=(tool:AiToolId,args:Record<string,unknown>,reason:string):AiToolPlan=>({version:1,goal:clean(message,240),calls:[{id:'local-1',tool,args,reason}]});
  if(runtime.scope==='business'){
    const partyIntent=parseAiPartyMasterIntent(message);
    if(partyIntent)return call(partyIntent.party==='customer'?'customer.master':'supplier.master',{intent:partyIntent},'Explicit user-only party creation/update with full contact preview.');
    const groupPrice=parseAiProductGroupPriceIntent(message);
    if(groupPrice)return call('product.bulkUpdate',{groupPrice},'Review every named weight-specific product price change before one approval.');
    const transform=parseAiBulkProductTransformIntent(message);
    if(transform)return call('product.bulkUpdate',{transform},'Review the selected product SKU or price changes before one approved save.');
  }
  if(/(?:open|go to|navigate|افتح|روح|اذهب)/i.test(q)){if(/(?:invoice|فاتورة|quotation|quote|عرض)/i.test(q))return call('navigation.open',{target:'documents'},'Open the Documents workspace.');if(/(?:customer|عميل)/i.test(q))return call('navigation.open',{target:'customers'},'Open Customers.');if(/(?:receivable|overdue|تحصيل|متأخر)/i.test(q))return call('navigation.open',{target:'receivables'},'Open Receivables.');if(/(?:report|تقرير|تقارير)/i.test(q))return call('navigation.open',{target:'reports'},'Open Reports.');if(/(?:product|inventory|مخزون|منتج)/i.test(q))return call('navigation.open',{target:'items'},'Open Products & Inventory.');if(/(?:supplier|purchase|مورد|شراء|مشتريات)/i.test(q))return call('navigation.open',{target:'operations'},'Open Purchasing/Operations.');}
  if(entity?.type==='customer'&&/(?:overdue|receivable|outstanding|متأخر|مستحق|ذمم)/i.test(q))return call('customer.getReceivables',{customerId:entity.id},'Read the current customer receivables.');
  if(entity?.type==='customer'&&/(?:history|account|summary|وضع|حساب|تاريخ)/i.test(q))return call('customer.getSummary',{customerId:entity.id},'Read the current customer summary.');
  if(entity?.type==='product'&&/(?:cost|price|stock|margin|تكلفة|سعر|مخزون|هامش)/i.test(q))return call('product.getSummary',{itemId:entity.id},'Read the current product summary.');
  if(entity?.type==='supplier'&&/(?:summary|payable|purchase|cost|مورد|مستحق|شراء|تكلفة)/i.test(q))return call('supplier.getSummary',{supplierId:entity.id},'Read the current supplier summary.');
  if(/(?:cash|bank|treasury|liquidity|سيولة|بنك|خزينة|كاش)/i.test(q))return call('treasury.getSnapshot',{},'Read the deterministic treasury snapshot.');
  if(/(?:company health|business health|financial summary|وضع الشركة|الوضع المالي|صحة الشركة)/i.test(q))return call('finance.getSummary',{},'Read deterministic financial and business summary.');
  if(/(?:inventory|stock|المخزون)/i.test(q)&&/(?:status|negative|zero|وضع|سالب|صفر)/i.test(q))return call('inventory.getStatus',{},'Read recorded inventory status.');
  return null;
}

export function compactToolResults(results:AiToolResult[]):Array<{tool:AiToolId;ok:boolean;summary:string;data:unknown;source:string}>{return results.slice(0,5).map(row=>({tool:row.tool,ok:row.ok,summary:clean(row.summary,280),data:row.data,source:row.source}));}