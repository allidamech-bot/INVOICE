import { activeAccountStorageUid } from '../storage/db.js';
import type { VaultPayload } from '../types.js';
import { scopeVault } from './workspaces.js';
import { activeTeamMember } from './governance.js';
import { assistantCapabilityAllowed } from './ai-assistant-foundation.js';
import type { KernelScope } from './ai-conversation-kernel.js';
export interface FoundationApproval { id:string; scope:KernelScope; actorId:string; role:string; payload:string; baseline:string; createdAt:string; }
export function canonicalFoundationJson(value:unknown):string{
  const normalize=(v:any):any=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='foundationApproval').sort().map(k=>[k,normalize(v[k])])):v;
  return JSON.stringify(normalize(value));
}
function snapshot(vault:VaultPayload):string{
  const scoped=scopeVault(vault);
  // Conservative snapshot: unrelated business changes require re-review too.
  // Never include credentials, encryption keys, or account identity in the envelope.
  return canonicalFoundationJson({company:scoped.company,documents:scoped.documents,customers:scoped.customers,suppliers:scoped.suppliers,savedItems:scoped.savedItems,numbering:scoped.appSettings.numbering});
}
export function foundationActionAllowed(vault:VaultPayload,proposal:any,scope:KernelScope):boolean{
  const role=activeTeamMember(vault).role;
  if(proposal.capability==='tool.plan')return Array.isArray(proposal.steps)&&proposal.steps.every((p:any)=>foundationActionAllowed(vault,p,scope));
  if(proposal.capability!=='tool.execute')return assistantCapabilityAllowed(vault,proposal.capability,scope.scope);
  if(/^task\./.test(proposal.tool)||/^memory\./.test(proposal.tool))return scope.scope==='personal'?(proposal.tool==='task.create'||proposal.tool==='memory.create'?proposal.args?.scope==='personal':proposal.args?.scope!=='business'):role!=='viewer';
  return scope.scope!=='personal'&&(role==='owner'||role==='admin'||(role==='sales'&&/^customer\./.test(proposal.tool))||(role==='purchasing'&&/^(supplier|product)\./.test(proposal.tool)));
}
export function prepareFoundationApproval(vault:VaultPayload,proposal:any,scope:KernelScope):FoundationApproval{
  if(!foundationActionAllowed(vault,proposal,scope))throw new Error('Your role or conversation scope cannot approve this action.');
  const actor=activeTeamMember(vault);
  return{id:crypto.randomUUID(),scope:{...scope},actorId:actor.id,role:actor.role,payload:canonicalFoundationJson(proposal),baseline:scope.scope==='personal'?'':snapshot(vault),createdAt:new Date().toISOString()};
}
export function assertFoundationApproval(vault:VaultPayload,proposal:any):void{
  const approval=proposal.foundationApproval as FoundationApproval|undefined;
  // Legacy callers retain their established guards; every new kernel path stamps an envelope.
  if(!approval)return;
  const scoped=scopeVault(vault),actor=activeTeamMember(vault);
  if(approval.scope.accountId!==undefined&&approval.scope.accountId!==(activeAccountStorageUid()||''))throw new Error('Account changed. Review the action again.');
  if(approval.scope.scope!=='personal'&&(approval.scope.workspaceId!==scoped.appSettings.activeWorkspaceId||approval.scope.branchId!==scoped.appSettings.activeBranchId))throw new Error('Company or branch changed. Review the action again.');
  if(actor.id!==approval.actorId||actor.role!==approval.role||!foundationActionAllowed(vault,proposal,approval.scope))throw new Error('Operator or authorization changed. No action applied.');
  if(canonicalFoundationJson(proposal)!==approval.payload)throw new Error('Approval payload changed. Review the exact changes again.');
  if(approval.scope.scope!=='personal'&&snapshot(vault)!==approval.baseline)throw new Error('Business records changed since review. Refresh and review the differences before approval.');
}
