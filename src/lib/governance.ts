import type { ApprovalAction, ApprovalPolicyRecord, ApprovalRequestRecord, TeamMemberRecord, TeamRole, VaultPayload } from '../types.js';
import { makeId } from './id.js';

export type GovernanceCapability='issue-document'|'post-purchase'|'reverse-purchase'|'approve'|'approve-supplier-quote'|'record-goods-receipt'|'match-supplier-invoice'|'accept-sales-order'|'confirm-sales-delivery'|'issue-sales-stock';

const ROLE_CAPABILITIES:Record<TeamRole,GovernanceCapability[]>={
  owner:['issue-document','post-purchase','reverse-purchase','approve','approve-supplier-quote','record-goods-receipt','match-supplier-invoice','accept-sales-order','confirm-sales-delivery','issue-sales-stock'],
  admin:['issue-document','post-purchase','reverse-purchase','approve','approve-supplier-quote','record-goods-receipt','match-supplier-invoice','accept-sales-order','confirm-sales-delivery','issue-sales-stock'],
  finance:['issue-document','approve','match-supplier-invoice'],
  sales:['issue-document','accept-sales-order','confirm-sales-delivery'],
  purchasing:['post-purchase','reverse-purchase','approve-supplier-quote','record-goods-receipt'],
  viewer:[]
};

export const DEFAULT_APPROVAL_POLICIES:ApprovalPolicyRecord[]=[
  {id:'policy-issue-document',action:'issue-document',enabled:false,approverRoles:['owner','admin','finance']},
  {id:'policy-post-purchase',action:'post-purchase',enabled:false,approverRoles:['owner','admin','finance']},
  {id:'policy-reverse-purchase',action:'reverse-purchase',enabled:false,approverRoles:['owner','admin','finance']}
];

export function defaultOwnerMember(at=new Date().toISOString()):TeamMemberRecord{
  return{id:'owner',displayName:'Workspace Owner',email:'',role:'owner',status:'active',createdAt:at,updatedAt:at};
}

export function teamRoleLabel(role:TeamRole,arabic=false):string{
  const en:Record<TeamRole,string>={owner:'Owner',admin:'Admin',finance:'Finance',sales:'Sales',purchasing:'Purchasing',viewer:'Viewer'};
  const ar:Record<TeamRole,string>={owner:'المالك',admin:'مسؤول',finance:'المالية',sales:'المبيعات',purchasing:'المشتريات',viewer:'مشاهد'};
  return (arabic?ar:en)[role];
}

export function approvalActionLabel(action:ApprovalAction,arabic=false):string{
  const en:Record<ApprovalAction,string>={'issue-document':'Issue document','post-purchase':'Post purchase','reverse-purchase':'Reverse purchase'};
  const ar:Record<ApprovalAction,string>={'issue-document':'إصدار المستند','post-purchase':'ترحيل الشراء','reverse-purchase':'عكس الشراء'};
  return (arabic?ar:en)[action];
}

export function activeTeamMember(vault:Pick<VaultPayload,'teamMembers'|'appSettings'>):TeamMemberRecord{
  const active=vault.teamMembers.find(member=>member.id===vault.appSettings.activeTeamMemberId&&member.status==='active')
    ??vault.teamMembers.find(member=>member.role==='owner'&&member.status==='active')
    ??vault.teamMembers.find(member=>member.status==='active');
  return active??defaultOwnerMember();
}

export function roleCan(role:TeamRole,capability:GovernanceCapability):boolean{return ROLE_CAPABILITIES[role].includes(capability);}

export function assertGovernancePermission(vault:Pick<VaultPayload,'teamMembers'|'appSettings'>,capability:GovernanceCapability):TeamMemberRecord{
  const member=activeTeamMember(vault);
  if(!roleCan(member.role,capability))throw new Error(`The active operator (${member.displayName}) does not have permission for this action.`);
  return member;
}

export interface ApprovalGateInput{
  action:ApprovalAction;
  entityType:'document'|'purchase';
  entityId:string;
  entityLabel:string;
  entityUpdatedAt:string;
}

export interface ApprovalGateResult{allowed:boolean;vault:VaultPayload;request:ApprovalRequestRecord|null;created:boolean;}

export function approvalGate(vault:VaultPayload,input:ApprovalGateInput):ApprovalGateResult{
  const capability:GovernanceCapability=input.action;
  const member=assertGovernancePermission(vault,capability);
  const policy=vault.approvalPolicies.find(item=>item.action===input.action);
  if(!policy?.enabled)return{allowed:true,vault,request:null,created:false};
  const candidates=vault.approvalRequests
    .filter(request=>request.action===input.action&&request.entityId===input.entityId&&request.entityUpdatedAt===input.entityUpdatedAt)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const approved=candidates.find(request=>request.status==='approved');
  if(approved)return{allowed:true,vault,request:approved,created:false};
  const pending=candidates.find(request=>request.status==='pending');
  if(pending)return{allowed:false,vault,request:pending,created:false};
  const now=new Date().toISOString();
  const request:ApprovalRequestRecord={
    id:makeId('approval'),action:input.action,entityType:input.entityType,entityId:input.entityId,entityLabel:input.entityLabel,
    entityUpdatedAt:input.entityUpdatedAt,requestedByMemberId:member.id,status:'pending',decidedByMemberId:'',decisionNote:'',createdAt:now,decidedAt:''
  };
  return{allowed:false,vault:{...vault,approvalRequests:[...vault.approvalRequests,request]},request,created:true};
}

export function decideApprovalRequest(vault:VaultPayload,requestId:string,decision:'approved'|'rejected',note=''):VaultPayload{
  const member=assertGovernancePermission(vault,'approve');
  const request=vault.approvalRequests.find(item=>item.id===requestId);
  if(!request)throw new Error('Approval request was not found.');
  if(request.status!=='pending')throw new Error('This approval request has already been decided.');
  const policy=vault.approvalPolicies.find(item=>item.action===request.action);
  if(policy&&policy.approverRoles.length&&!policy.approverRoles.includes(member.role))throw new Error('The active operator role cannot approve this request.');
  const now=new Date().toISOString();
  return{...vault,approvalRequests:vault.approvalRequests.map(item=>item.id===requestId?{...item,status:decision,decidedByMemberId:member.id,decisionNote:note.trim(),decidedAt:now}:item)};
}

export function normalizeApprovalPolicies(policies:ApprovalPolicyRecord[]):ApprovalPolicyRecord[]{
  return DEFAULT_APPROVAL_POLICIES.map(fallback=>{
    const existing=policies.find(policy=>policy.action===fallback.action);
    return existing?{...fallback,...existing,id:existing.id||fallback.id,approverRoles:existing.approverRoles.length?existing.approverRoles:fallback.approverRoles}:{...fallback,approverRoles:[...fallback.approverRoles]};
  });
}
