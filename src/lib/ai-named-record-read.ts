import type {VaultPayload} from '../types.js';
import type {AiToolPlan,AiToolRuntime,AiToolId} from './ai-tool-orchestrator.js';
import {scopeVault} from './workspaces.js';
import {aiProductArchived} from './ai-business.js';
import {receivableCustomerId} from './receivables.js';
import {graphKindAllowed} from './ai-business-memory-graph.js';
import {strictAiActor} from './ai-foundation-approval.js';

const normalized=(value:unknown)=>String(value??'').normalize('NFKC')
 .replace(/[\u064b-\u065f\u0670\u0640]/gu,'').replace(/[إأٱآ]/gu,'ا')
 .toLocaleLowerCase().replace(/\s+/gu,' ').trim();
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function mentioned(message:string,value:unknown):boolean{
 const name=normalized(value);
 return name.length>=3&&new RegExp('(?<![\\p{L}\\p{N}_-])'+escape(name)+'(?![\\p{L}\\p{N}_-])','u').test(message);
}
/** Negative safety instructions are not requests to write. This only enables
 * exact local READS; it never changes Controller's action/approval parser. */
function readRequest(message:string):boolean{
 const text=normalized(message)
  .replace(/\b(?:do not|don't|never|without)\s+(?:modify|change|edit|update|save|delete|mutate|modifying|changing|editing|saving|deleting)\b/gu,' ')
  .replace(/(?:لا|ولا|دون|بدون)\s+(?:اي\s+)?(?:تعديل|تعدل|تغير|تغيير|حفظ|تحفظ|حذف|تحذف|تحديث|تحدث)(?![\p{L}])/gu,' ');
 // Arabic commands need a word ending: "سجلات" (records), "حدثت" (happened)
 // and "اعتمادًا" (based on) are NOT instructions to record, update or approve.
 if(/\b(?:create|make|generate|build|save|add|update|edit|change|remove|archive|restore|record|register|set|prepare|open|navigate|delete|post|pay|send)\b|(?:انشئ|سوي|اعمل|جهز|اضف|عدل|غير|احفظ|خزن|حدث|افتح|احذف|امسح|اعتمد|اصدر|رحل|ادفع|ارسل)(?![\p{L}])/iu.test(text))return false;
 // "سجل" may mean the noun ledger, not the imperative "record".
 if(/(?:^|[\s،,;])سجل\s+(?:دفعة|دفع|تحصيل|سداد|فاتورة|مبلغ|حركة|قيد|قبض)(?![\p{L}])/iu.test(text))return false;
 return /\b(?:show|read|review|explain|balance|receivables?|outstanding|history|stock|inventory|price|cost|summary)\b|(?:اعرض|اقرا|راجع|اشرح|رصيد|مستحق|ذمم|تاريخ|سجل|فواتير|مخزون|سعر|تكلفة|ملخص)/iu.test(text);
}
type Row={id:string};
function named<T extends Row>(rows:T[],text:string,aliases:(row:T)=>unknown[]):T[]{
 return rows.filter(row=>aliases(row).some(alias=>mentioned(text,alias)));
}
/** Resolve only explicit current-message identities from the active company.
 * No provider IDs, old dialogue, fuzzy matches or cross-company fallback. */
export function namedRecordReadPlan(message:string,runtime:AiToolRuntime):AiToolPlan|null{
 if(runtime.scope!=='business'||!readRequest(message))return null;
 const vault:VaultPayload=scopeVault(runtime.vault),text=normalized(message);
 if(!runtime.workspaceId||!runtime.branchId||
    runtime.workspaceId!==vault.appSettings.activeWorkspaceId||
    runtime.branchId!==vault.appSettings.activeBranchId)return null;
 const customers=named(vault.customers,text,row=>[row.companyNameEn,row.companyNameAr]);
 const products=named(vault.savedItems.filter(row=>!aiProductArchived(row)),text,row=>[row.sku,row.descriptionEn,row.descriptionAr]);
 // Exact numbered invoice + details questions must reach the saved document
 // and its linked customer ledger, rather than the generic document-status reply.
 // Resolve against scoped documents; never trust a model-proposed customer ID.
 const numbers=[...new Set([...text.matchAll(/\binv-[a-z0-9]+(?:-[a-z0-9]+)+\b/giu)].map(match=>match[0]))];
 const invoiceDetail=/\b(?:details?|total|amount|tax|payments?|collections?|balance|outstanding|customer|history|review|read|show)\b|(?:تفاصيل|الاجمالي|اجمالي|المبلغ|قيمه|قيمة|الضريب|العميل|الدفع|الدفعات|المدفوع|التحصيل|المستحق|الرصيد|التاريخ|تاريخ|ابحث|اعرض)/iu.test(text);
 if(numbers.length===1&&invoiceDetail){
  const invoices=vault.documents.filter(doc=>doc.kind==='invoice'&&mentioned(text,doc.number));
  if(invoices.length>1)return{version:1,goal:message.slice(0,240),calls:[
   {id:'invoice-selection',tool:'search.records',args:{query:numbers[0]},reason:'Multiple documents match this exact scoped number; require selection.'}]};
  if(invoices.length===0)return{version:1,goal:message.slice(0,240),calls:[
   {id:'numbered-invoice-read',tool:'document.get',args:{number:numbers[0]},reason:'Check the exact invoice number in the current company and branch.'}]};
  const invoice=invoices[0]!;
  const linkedId=receivableCustomerId(invoice);
  // If two incompatible identities are explicitly named, do not silently
  // present one customer's statement as proof for another.
  if(customers.length&&(!linkedId||customers.some(row=>row.id!==linkedId)))return null;
  const calls:AiToolPlan['calls']=[
   {id:'numbered-invoice-read',tool:'document.get',args:{documentId:invoice.id},reason:'Read the uniquely matched saved invoice.'}
  ];
  const wantsAccount=/\b(?:payments?|collections?|balance|outstanding|receivables?|statement|history)\b|(?:المدفوع|الدفعات|التحصيل|مستحق|رصيد|كشف\s+حساب|حركات)/iu.test(text);
  if(wantsAccount&&linkedId&&vault.customers.some(row=>row.id===linkedId)){
   let role:ReturnType<typeof strictAiActor>['role'];
   try{role=strictAiActor(vault).role;}catch{return{version:1,goal:message.slice(0,240),calls};}
   if(graphKindAllowed(role,'customer')){
    calls.push({id:'invoice-customer-summary',tool:'customer.getSummary',
     args:{customerId:linkedId},reason:'Read receivables of the customer linked to this invoice.'});
    calls.push({id:'invoice-customer-history',tool:'customer.getHistory',
     args:{customerId:linkedId},reason:'Read posted invoice payments in the linked customer ledger.'});
   }
  }
  return{version:1,goal:message.slice(0,240),calls};
 }
 if(!customers.length&&!products.length)return null;
 // Ambiguous/multiple identities become the existing scoped selection list,
 // never an arbitrary customer's balance or a partial mixed answer.
 for(const [rows,aliases] of [
  [customers,(row:any)=>[row.companyNameEn,row.companyNameAr]],
  [products,(row:any)=>[row.sku,row.descriptionEn,row.descriptionAr]]
 ] as const){
  if(rows.length>1){
   const query=aliases(rows[0]).find((value:unknown)=>mentioned(text,value));
   return{version:1,goal:message.slice(0,240),calls:[{id:'named-selection',tool:'search.records',args:{query},reason:'Select an exact scoped record before reading an ambiguous identity.'}]};
  }
 }
 const calls:AiToolPlan['calls']=[];
 const add=(tool:AiToolId,args:Record<string,unknown>)=>calls.push({id:'named-'+(calls.length+1),tool,args,reason:'Read the exact record named in the current message from the active company/branch.'});
 if(customers[0]){
  add('customer.getSummary',{customerId:customers[0].id});
  if(/\b(?:history|invoices?|payments?|statement)\b|(?:تاريخ|سجل|فواتير|مدفوعات|كشف)/iu.test(text))
   add('customer.getHistory',{customerId:customers[0].id});
 }
 if(products[0])add('product.getSummary',{itemId:products[0].id});
 return{version:1,goal:message.slice(0,240),calls};
}
