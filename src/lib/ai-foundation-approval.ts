import { activeAccountStorageUid } from '../storage/db.js';
import type { TeamMemberRecord, VaultPayload } from '../types.js';
import { scopeVault } from './workspaces.js';
import { activeTeamMember } from './governance.js';
import { assistantCapabilityAllowed } from './ai-assistant-foundation.js';
import type { KernelScope } from './ai-conversation-kernel.js';
export interface FoundationApproval { id:string; scope:KernelScope; actorId:string; role:string; payload:string; baseline:string; createdAt:string; }
export function strictAiActor(vault:VaultPayload):TeamMemberRecord{
  const selected=vault.appSettings.activeTeamMemberId;
  const matches=selected?vault.teamMembers.filter(member=>member.id===selected):[];
  if(selected&&(matches.length!==1||matches[0]?.status!=='active'))throw new Error('The selected operator is unavailable. Select an active operator before approval.');
  if(!selected&&vault.teamMembers.length&&!vault.teamMembers.some(member=>member.status==='active'))throw new Error('No active operator is available for approval.');
  const actor=selected?matches[0]:activeTeamMember(vault);
  if(!actor)throw new Error('No active operator is available for approval.');
  if(!['owner','admin','finance','sales','purchasing','viewer'].includes(actor.role))throw new Error('The operator role is invalid. No action applied.');
  return actor;
}
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
  // The retired Delivery Note stock issue route is forbidden in every mode,
  // including previously signed owner/admin AI approvals.
  if(proposal.tool==='sales.issueConfirmedStock')return false;
  const role=strictAiActor(vault).role;
  if(proposal.capability==='tool.plan')return Array.isArray(proposal.steps)&&proposal.steps.every((p:any)=>foundationActionAllowed(vault,p,scope));
  if(proposal.capability!=='tool.execute')return assistantCapabilityAllowed(vault,proposal.capability,scope.scope);
  if(/^task\./.test(proposal.tool)||/^memory\./.test(proposal.tool))return scope.scope==='personal'?(proposal.tool==='task.create'||proposal.tool==='memory.create'?proposal.args?.scope==='personal':proposal.args?.scope!=='business'):role!=='viewer';
  return scope.scope!=='personal'&&(role==='owner'||role==='admin'||(role==='finance'&&(proposal.tool==='procurement.matchSupplierBill'||(proposal.tool==='sales.recordCustomerCollection'||proposal.tool==='procurement.recordSupplierPayment')))||(role==='sales'&&(/^customer\./.test(proposal.tool)||(proposal.tool==='sales.createDeliveryDraft'||proposal.tool==='sales.confirmPhysicalDelivery'||proposal.tool==='sales.createConfirmedInvoiceDraft')))||(role==='purchasing'&&(/^(supplier|product)\./.test(proposal.tool)||(proposal.tool==='procurement.createPoFromRfq'||proposal.tool==='procurement.recordGoodsReceipt'))));
}
export function prepareFoundationApproval(vault:VaultPayload,proposal:any,scope:KernelScope):FoundationApproval{
  if(!foundationActionAllowed(vault,proposal,scope))throw new Error('Your role or conversation scope cannot approve this action.');
  const actor=strictAiActor(vault);
  return{id:crypto.randomUUID(),scope:{...scope},actorId:actor.id,role:actor.role,payload:canonicalFoundationJson(proposal),baseline:scope.scope==='personal'?'':snapshot(vault),createdAt:new Date().toISOString()};
}
export function assertFoundationApproval(vault:VaultPayload,proposal:any):void{
  const approval=proposal.foundationApproval as FoundationApproval|undefined;
  // Legacy callers retain their established guards; every new kernel path stamps an envelope.
  if(!approval)return;
  const scoped=scopeVault(vault),actor=strictAiActor(vault);
  if(approval.scope.accountId!==undefined&&approval.scope.accountId!==(activeAccountStorageUid()||''))throw new Error('Account changed. Review the action again.');
  if(approval.scope.scope!=='personal'&&(approval.scope.workspaceId!==scoped.appSettings.activeWorkspaceId||approval.scope.branchId!==scoped.appSettings.activeBranchId))throw new Error('Company or branch changed. Review the action again.');
  if(actor.id!==approval.actorId||actor.role!==approval.role||!foundationActionAllowed(vault,proposal,approval.scope))throw new Error('Operator or authorization changed. No action applied.');
  if(canonicalFoundationJson(proposal)!==approval.payload)throw new Error('Approval payload changed. Review the exact changes again.');
  if(approval.scope.scope!=='personal'&&snapshot(vault)!==approval.baseline)throw new Error('Business records changed since review. Refresh and review the differences before approval.');
}
