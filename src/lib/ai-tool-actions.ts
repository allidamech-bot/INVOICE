import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { applyAiBulkProductUpdate, type AiBulkProductBatch } from './ai-product-bulk-update.js';
import {applyAiProductSourceImport,type AiProductSourceImportBatch} from './ai-product-source-import.js';
import { resumeVaultSession } from '../storage/vault.js';
import { createAssistantTask, updateAssistantTask, completeAssistantTask, deleteAssistantTask } from '../storage/assistant-task-store.js';
import { createAssistantMemory, updateAssistantMemory, deleteAssistantMemory, setPersonalMemoryEnabled } from '../storage/assistant-memory-store.js';

export interface GenericToolExecutionProposal{capability:'tool.execute';tool:'customer.update'|'supplier.update'|'product.bulkUpdate'|'product.importSource'|'task.create'|'task.update'|'task.complete'|'task.delete'|'memory.create'|'memory.update'|'memory.delete'|'memory.setEnabled';args:Record<string,unknown>;label:string;rationale:string;}

function clean(value:unknown,max=160):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function patchObject(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function stringPatch(source:Record<string,unknown>,fields:ReadonlyArray<[string,number]>):Record<string,string>{const result:Record<string,string>={};for(const [key,max] of fields){if(!(key in source))continue;result[key]=clean(source[key],max);}return result;}
const CUSTOMER_FIELDS=[['companyNameEn',160],['companyNameAr',160],['contactPerson',120],['addressEn',240],['addressAr',240],['city',100],['country',100],['phone',60],['email',160],['vatTaxNumber',80],['commercialRegistration',80],['preferredCurrency',8],['paymentTerms',160],['creditLimit',40],['creditCurrency',8],['notes',1000]] as const;
const SUPPLIER_FIELDS=[['nameEn',160],['nameAr',160],['contactPerson',120],['address',240],['city',100],['country',100],['phone',60],['email',160],['vatTaxNumber',80],['commercialRegistration',80],['defaultCurrency',8],['paymentTerms',160],['notes',1000]] as const;

export async function applyApprovedToolExecution(proposal:GenericToolExecutionProposal):Promise<{summary:string;id:string}>{
  if(proposal.tool==='product.importSource'){
    const batch=proposal.args as unknown as AiProductSourceImportBatch;
    const next=await mutateVaultSafely(vault=>applyAiProductSourceImport(vault,batch));
    if(batch.rows.some(row=>!next.savedItems.some(item=>item.id===row.item.id)))throw new Error('Approved imported products could not be verified. Review the catalog.');
    return{summary:String(batch.rows.length)+' extracted products registered after explicit approval.',id:'imported-products-'+batch.rows.length};
  }
  if(proposal.tool==='product.bulkUpdate'){
    const batch=proposal.args as unknown as AiBulkProductBatch;
    const next=await mutateVaultSafely(vault=>applyAiBulkProductUpdate(vault,batch));
    if(batch.rows.some(row=>!next.savedItems.some(item=>item.id===row.itemId&&item.updatedAt!==row.beforeUpdatedAt)))throw new Error('Bulk product save could not be verified. Review your catalog before retrying.');
    return{summary:String(batch.rows.length)+' product records updated after explicit approval.',id:'bulk-products-'+batch.rows.length};
  }
  if(proposal.tool==='customer.update'){
    const id=clean(proposal.args.customerId,120),patch=stringPatch(patchObject(proposal.args.patch),CUSTOMER_FIELDS as any);if(!id||!Object.keys(patch).length)throw new Error('Customer update is incomplete.');
    const next=await mutateVaultSafely(vault=>{const index=vault.customers.findIndex(row=>row.id===id);if(index<0)throw new Error('Customer no longer exists in this workspace.');const current=vault.customers[index]!;const customers=[...vault.customers];customers[index]={...current,...patch,updatedAt:new Date().toISOString()};return{...vault,customers};});
    const row=next.customers.find(item=>item.id===id);if(!row)throw new Error('Customer update could not be verified.');return{summary:'Customer updated after approval.',id};
  }
  if(proposal.tool==='supplier.update'){
    const id=clean(proposal.args.supplierId,120),patch=stringPatch(patchObject(proposal.args.patch),SUPPLIER_FIELDS as any);if(!id||!Object.keys(patch).length)throw new Error('Supplier update is incomplete.');
    const next=await mutateVaultSafely(vault=>{const index=vault.suppliers.findIndex(row=>row.id===id);if(index<0)throw new Error('Supplier no longer exists in this workspace.');const current=vault.suppliers[index]!;const suppliers=[...vault.suppliers];suppliers[index]={...current,...patch,updatedAt:new Date().toISOString()};return{...vault,suppliers};});
    const row=next.suppliers.find(item=>item.id===id);if(!row)throw new Error('Supplier update could not be verified.');return{summary:'Supplier updated after approval.',id};
  }
  if(proposal.tool==='task.create'){
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX before creating an assistant task.');
    const scope=proposal.args.scope==='personal'?'personal':'business';const title=clean(proposal.args.title,180);if(!title)throw new Error('Task title is required.');
    const task=await createAssistantTask(resumed.key,{scope,workspaceId:scope==='business'?resumed.vault.appSettings.activeWorkspaceId:'',branchId:scope==='business'?resumed.vault.appSettings.activeBranchId:'',title,notes:clean(proposal.args.notes,1000),dueAt:clean(proposal.args.dueAt,48),recurrence:['daily','weekly','monthly'].includes(String(proposal.args.recurrence))?proposal.args.recurrence as any:'none',conditionType:['document-not-converted','customer-unpaid','stock-below'].includes(String(proposal.args.conditionType))?proposal.args.conditionType as any:'none',conditionValue:clean(proposal.args.conditionValue,160),timezone:clean(proposal.args.timezone,80),relatedEntityType:scope==='business'?clean(proposal.args.relatedEntityType,40):'',relatedEntityId:scope==='business'?clean(proposal.args.relatedEntityId,120):'',sourceThreadId:clean(proposal.args.sourceThreadId,120),sourceMessageId:clean(proposal.args.sourceMessageId,120)});return{summary:'Assistant task created after approval.',id:task.id};
  }
  if(['task.update','task.complete','task.delete'].includes(proposal.tool)){
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX before changing an assistant task.');const taskId=clean(proposal.args.taskId,120);if(!taskId)throw new Error('Task ID is required.');
    if(proposal.tool==='task.complete'){const row=await completeAssistantTask(resumed.key,taskId);return{summary:row.status==='done'?'Assistant task completed after approval.':'Recurring assistant task advanced to its next due date after approval.',id:row.id};}
    if(proposal.tool==='task.delete'){await deleteAssistantTask(resumed.key,taskId);return{summary:'Assistant task deleted after approval.',id:taskId};}
    const row=await updateAssistantTask(resumed.key,taskId,{title:'title'in proposal.args?clean(proposal.args.title,180):undefined,notes:'notes'in proposal.args?clean(proposal.args.notes,1000):undefined,dueAt:'dueAt'in proposal.args?clean(proposal.args.dueAt,48):undefined,recurrence:'recurrence'in proposal.args&&['none','daily','weekly','monthly'].includes(String(proposal.args.recurrence))?proposal.args.recurrence as any:undefined,conditionType:'conditionType'in proposal.args&&['none','document-not-converted','customer-unpaid','stock-below'].includes(String(proposal.args.conditionType))?proposal.args.conditionType as any:undefined,conditionValue:'conditionValue'in proposal.args?clean(proposal.args.conditionValue,160):undefined,timezone:'timezone'in proposal.args?clean(proposal.args.timezone,80):undefined});return{summary:'Assistant task updated after approval.',id:row.id};
  }
  if(['memory.create','memory.update','memory.delete','memory.setEnabled'].includes(proposal.tool)){
    const resumed=await resumeVaultSession();if(!resumed)throw new Error('Unlock LOUREX before changing assistant memory.');
    if(proposal.tool==='memory.setEnabled'){const enabled=proposal.args.enabled===true;await setPersonalMemoryEnabled(resumed.key,enabled);return{summary:enabled?'Personal assistant memory enabled after approval.':'Personal assistant memory disabled after approval.',id:'personal-memory-setting'};}
    if(proposal.tool==='memory.delete'){const memoryId=clean(proposal.args.memoryId,120);if(!memoryId)throw new Error('Memory ID is required.');await deleteAssistantMemory(resumed.key,memoryId);return{summary:'Assistant memory deleted after approval.',id:memoryId};}
    if(proposal.tool==='memory.update'){const memoryId=clean(proposal.args.memoryId,120);if(!memoryId)throw new Error('Memory ID is required.');const row=await updateAssistantMemory(resumed.key,memoryId,{content:'content'in proposal.args?clean(proposal.args.content,700):undefined,kind:['preference','fact','note','goal'].includes(String(proposal.args.kind))?proposal.args.kind as any:undefined,expiresAt:'expiresAt'in proposal.args?clean(proposal.args.expiresAt,48):undefined,active:'active'in proposal.args?proposal.args.active!==false:undefined,confirm:proposal.args.confirm===true});return{summary:'Assistant memory updated after approval.',id:row.id};}
    const scope=proposal.args.scope==='business'?'business':'personal';const content=clean(proposal.args.content,700);if(!content)throw new Error('Memory content is required.');const row=await createAssistantMemory(resumed.key,{scope,workspaceId:scope==='business'?resumed.vault.appSettings.activeWorkspaceId:'',branchId:scope==='business'?resumed.vault.appSettings.activeBranchId:'',kind:['preference','fact','note','goal'].includes(String(proposal.args.kind))?proposal.args.kind as any:'note',content,source:'user-approved',sourceThreadId:clean(proposal.args.sourceThreadId,120),expiresAt:clean(proposal.args.expiresAt,48)});return{summary:'Assistant memory stored after approval.',id:row.id};
  }
  throw new Error('Unsupported approved tool action.');
}
