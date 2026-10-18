import type {VaultPayload} from '../types.js';
import type {AiToolPlan,AiToolRuntime,AiToolId} from './ai-tool-orchestrator.js';
import {scopeVault} from './workspaces.js';
import {aiProductArchived} from './ai-business.js';

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
 if(/\b(?:create|make|generate|build|save|add|update|edit|change|remove|archive|restore|record|register|set|prepare|open|navigate|delete|post|pay|send)\b|(?:انشئ|سوي|اعمل|جهز|اضف|عدل|غير|احفظ|خزن|حدث|افتح|احذف|امسح|اعتمد|اصدر|رحل|ادفع|ارسل)/iu.test(text))return false;
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
 if((runtime.workspaceId&&runtime.workspaceId!==vault.appSettings.activeWorkspaceId)||
    (runtime.branchId&&runtime.branchId!==vault.appSettings.activeBranchId))return null;
 const customers=named(vault.customers,text,row=>[row.companyNameEn,row.companyNameAr]);
 const products=named(vault.savedItems.filter(row=>!aiProductArchived(row)),text,row=>[row.sku,row.descriptionEn,row.descriptionAr]);
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
