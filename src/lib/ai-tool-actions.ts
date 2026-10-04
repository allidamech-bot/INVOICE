import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { resumeVaultSession } from '../storage/vault.js';
import { createAssistantTask } from '../storage/assistant-task-store.js';

export interface GenericToolExecutionProposal{capability:'tool.execute';tool:'customer.update'|'supplier.update'|'task.create';args:Record<string,unknown>;label:string;rationale:string;}

function clean(value:unknown,max=160):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function patchObject(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function stringPatch(source:Record<string,unknown>,fields:ReadonlyArray<[string,number]>):Record<string,string>{const result:Record<string,string>={};for(const [key,max] of fields){if(!(key in source))continue;result[key]=clean(source[key],max);}return result;}
const CUSTOMER_FIELDS=[['companyNameEn',160],['companyNameAr',160],['contactPerson',120],['addressEn',240],['addressAr',240],['city',100],['country',100],['phone',60],['email',160],['vatTaxNumber',80],['commercialRegistration',80],['preferredCurrency',8],['paymentTerms',160],['creditLimit',40],['creditCurrency',8],['notes',1000]] as const;
const SUPPLIER_FIELDS=[['nameEn',160],['nameAr',160],['contactPerson',120],['address',240],['city',100],['country',100],['phone',60],['email',160],['vatTaxNumber',80],['commercialRegistration',80],['defaultCurrency',8],['paymentTerms',160],['notes',1000]] as const;

export async function applyApprovedToolExecution(proposal:GenericToolExecutionProposal):Promise<{summary:string;id:string}>{
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
    const task=await createAssistantTask(resumed.key,{scope,workspaceId:scope==='business'?resumed.vault.appSettings.activeWorkspaceId:'',branchId:scope==='business'?resumed.vault.appSettings.activeBranchId:'',title,notes:clean(proposal.args.notes,1000),dueAt:clean(proposal.args.dueAt,40),relatedEntityType:clean(proposal.args.relatedEntityType,40),relatedEntityId:clean(proposal.args.relatedEntityId,120)});return{summary:'Assistant task created after approval.',id:task.id};
  }
  throw new Error('Unsupported approved tool action.');
}
