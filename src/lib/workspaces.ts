import type { AppSettings, BranchRecord, CompanySettings, NumberingSettings, SmartDocumentDefaults, VaultPayload, WorkspaceRecord } from '../types.js';
import { makeId } from './id.js';

export const DEFAULT_WORKSPACE_ID='default';
export const DEFAULT_BRANCH_ID='main';

export const COMPANY_SCOPED_KEYS=['customers','suppliers','savedItems','exchangeRates','inventoryTransfers'] as const;
export const BRANCH_SCOPED_KEYS=['purchases','supplierPayments','expenses','inventoryMovements','treasuryAccounts','treasuryEntries','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const;

function recordWorkspace(record:any):string{return String(record?.workspaceId||DEFAULT_WORKSPACE_ID);}
function recordBranch(record:any):string{return String(record?.branchId||DEFAULT_BRANCH_ID);}
function scopedCompanyRows(rows:any[],workspaceId:string):any[]{return rows.filter(row=>recordWorkspace(row)===workspaceId);}
function scopedBranchRows(rows:any[],workspaceId:string,branchId:string):any[]{return rows.filter(row=>recordWorkspace(row)===workspaceId&&recordBranch(row)===branchId);}
function stampCompanyRows(rows:any[],workspaceId:string):any[]{return rows.map(row=>({...row,workspaceId}));}
function stampBranchRows(rows:any[],workspaceId:string,branchId:string):any[]{return rows.map(row=>({...row,workspaceId,branchId}));}

function resetNumbering(source:NumberingSettings):NumberingSettings{
  const year=new Date().getFullYear();
  return{
    ...structuredClone(source),
    proformaLast:0,invoiceLast:0,creditNoteLast:0,purchaseOrderLast:0,draftLast:0,
    proformaYear:year,invoiceYear:year,creditNoteYear:year,purchaseOrderYear:year,draftYear:year
  };
}

export function workspaceRecordFrom(company:CompanySettings,appSettings:Pick<AppSettings,'numbering'|'smartDefaults'>,id=DEFAULT_WORKSPACE_ID,name=''):WorkspaceRecord{
  const now=new Date().toISOString();
  return{id,name:(name.trim()||company.nameEn||company.nameAr||'LOUREX').trim(),company:structuredClone(company),numbering:structuredClone(appSettings.numbering),smartDefaults:structuredClone(appSettings.smartDefaults),createdAt:now,updatedAt:now};
}

export function branchRecordFrom(workspaceId:string,name='Main Branch',code='MAIN'):BranchRecord{
  const now=new Date().toISOString();
  return{id:workspaceId===DEFAULT_WORKSPACE_ID?DEFAULT_BRANCH_ID:makeId('branch'),workspaceId,name:name.trim()||'Main Branch',code:code.trim().toUpperCase().slice(0,12)||'MAIN',city:'',country:'',active:true,createdAt:now,updatedAt:now};
}

export function activeWorkspace(vault:Pick<VaultPayload,'workspaces'|'appSettings'>):WorkspaceRecord{
  const workspace=vault.workspaces.find(item=>item.id===vault.appSettings.activeWorkspaceId)
    ??vault.workspaces.find(item=>item.id===DEFAULT_WORKSPACE_ID)
    ??vault.workspaces[0];
  if(!workspace)throw new Error('Workspace configuration is missing.');
  return workspace;
}

export function activeBranch(vault:Pick<VaultPayload,'branches'|'appSettings'|'workspaces'>):BranchRecord{
  const workspace=activeWorkspace(vault);
  const branch=vault.branches.find(item=>item.workspaceId===workspace.id&&item.id===vault.appSettings.activeBranchId&&item.active)
    ??vault.branches.find(item=>item.workspaceId===workspace.id&&item.active);
  if(!branch)throw new Error('Active workspace has no active branch.');
  return branch;
}

export function scopeVault(vault:VaultPayload):VaultPayload{
  const workspace=activeWorkspace(vault),branch=activeBranch(vault);
  const scoped:any={
    ...vault,
    company:structuredClone(workspace.company),
    appSettings:{...vault.appSettings,activeWorkspaceId:workspace.id,activeBranchId:branch.id,numbering:structuredClone(workspace.numbering),smartDefaults:structuredClone(workspace.smartDefaults)}
  };
  for(const key of COMPANY_SCOPED_KEYS)scoped[key]=scopedCompanyRows((vault as any)[key]??[],workspace.id);
  for(const key of BRANCH_SCOPED_KEYS)scoped[key]=scopedBranchRows((vault as any)[key]??[],workspace.id,branch.id);
  return scoped as VaultPayload;
}

export function scopeVaultForExternalMutation(vault:VaultPayload):VaultPayload{
  const scoped:any=scopeVault(vault);
  const workspace=activeWorkspace(scoped),branch=activeBranch(scoped);
  scoped.workspaces=[structuredClone(workspace)];
  scoped.branches=[structuredClone(branch)];
  delete scoped.companyAssets;
  return scoped as VaultPayload;
}

export function applyWorkspaceScope(base:VaultPayload,intended:VaultPayload):VaultPayload{
  const workspaceId=intended.appSettings.activeWorkspaceId||base.appSettings.activeWorkspaceId||DEFAULT_WORKSPACE_ID;
  const branchId=intended.appSettings.activeBranchId||base.appSettings.activeBranchId||DEFAULT_BRANCH_ID;
  const next:any={...intended};
  for(const key of COMPANY_SCOPED_KEYS)next[key]=stampCompanyRows((intended as any)[key]??[],workspaceId);
  for(const key of BRANCH_SCOPED_KEYS)next[key]=stampBranchRows((intended as any)[key]??[],workspaceId,branchId);
  const now=new Date().toISOString();
  next.workspaces=intended.workspaces.map(workspace=>workspace.id===workspaceId?{
    ...workspace,company:structuredClone(intended.company),numbering:structuredClone(intended.appSettings.numbering),smartDefaults:structuredClone(intended.appSettings.smartDefaults),updatedAt:now
  }:workspace);
  return next as VaultPayload;
}

export function mergeScopedVault(full:VaultPayload,scoped:VaultPayload):VaultPayload{
  const workspaceId=scoped.appSettings.activeWorkspaceId||full.appSettings.activeWorkspaceId||DEFAULT_WORKSPACE_ID;
  const branchId=scoped.appSettings.activeBranchId||full.appSettings.activeBranchId||DEFAULT_BRANCH_ID;
  const directoryWorkspace=full.workspaces.find(item=>item.id===workspaceId);
  if(!directoryWorkspace)throw new Error('Active workspace is missing from the encrypted vault.');
  const directoryBranch=full.branches.find(item=>item.workspaceId===workspaceId&&item.id===branchId&&item.active);
  if(!directoryBranch)throw new Error('Active branch is missing from the encrypted vault.');
  const next:any={...full};
  for(const key of COMPANY_SCOPED_KEYS){
    const hidden=((full as any)[key]??[]).filter((row:any)=>recordWorkspace(row)!==workspaceId);
    next[key]=[...hidden,...stampCompanyRows((scoped as any)[key]??[],workspaceId)];
  }
  for(const key of BRANCH_SCOPED_KEYS){
    const hidden=((full as any)[key]??[]).filter((row:any)=>!(recordWorkspace(row)===workspaceId&&recordBranch(row)===branchId));
    next[key]=[...hidden,...stampBranchRows((scoped as any)[key]??[],workspaceId,branchId)];
  }
  next.teamMembers=structuredClone(scoped.teamMembers);
  next.approvalPolicies=structuredClone(scoped.approvalPolicies);
  next.company=structuredClone(scoped.company);
  next.appSettings={...full.appSettings,autoLockMinutes:scoped.appSettings.autoLockMinutes,uiLanguage:scoped.appSettings.uiLanguage,activeTeamMemberId:scoped.appSettings.activeTeamMemberId,activeWorkspaceId:workspaceId,activeBranchId:branchId,numbering:structuredClone(scoped.appSettings.numbering),smartDefaults:structuredClone(scoped.appSettings.smartDefaults)};
  const now=new Date().toISOString();
  next.workspaces=full.workspaces.map(workspace=>workspace.id===workspaceId?{...workspace,company:structuredClone(scoped.company),numbering:structuredClone(scoped.appSettings.numbering),smartDefaults:structuredClone(scoped.appSettings.smartDefaults),updatedAt:now}:workspace);
  next.branches=full.branches;
  return next as VaultPayload;
}

export function overlayWorkspaceScope(full:VaultPayload,scoped:VaultPayload):VaultPayload{return mergeScopedVault(full,scoped);}

export function activateWorkspace(vault:VaultPayload,workspaceId:string,requestedBranchId=''):VaultPayload{
  const workspace=vault.workspaces.find(item=>item.id===workspaceId);
  if(!workspace)throw new Error('Workspace was not found.');
  const branch=vault.branches.find(item=>item.workspaceId===workspaceId&&item.id===requestedBranchId&&item.active)
    ??vault.branches.find(item=>item.workspaceId===workspaceId&&item.active);
  if(!branch)throw new Error('This workspace has no active branch.');
  return{...vault,company:structuredClone(workspace.company),appSettings:{...vault.appSettings,activeWorkspaceId:workspace.id,activeBranchId:branch.id,numbering:structuredClone(workspace.numbering),smartDefaults:structuredClone(workspace.smartDefaults)}};
}

export function activateBranch(vault:VaultPayload,branchId:string):VaultPayload{
  const workspace=activeWorkspace(vault);
  const branch=vault.branches.find(item=>item.workspaceId===workspace.id&&item.id===branchId&&item.active);
  if(!branch)throw new Error('Branch was not found or is inactive.');
  return{...vault,appSettings:{...vault.appSettings,activeBranchId:branch.id}};
}

export function createWorkspace(vault:VaultPayload,name:string):VaultPayload{
  const clean=name.trim();if(!clean)throw new Error('Workspace name is required.');
  if(vault.workspaces.some(item=>item.name.trim().toLocaleLowerCase()===clean.toLocaleLowerCase()))throw new Error('A workspace with this name already exists.');
  const id=makeId('workspace'),now=new Date().toISOString();
  const company=structuredClone(vault.company);
  company.nameEn=clean;company.nameAr='';company.logoDataUrl='';company.signatureDataUrl='';company.stampDataUrl='';company.addressEn='';company.addressAr='';company.city='';company.country='';company.phone='';company.email='';company.website='';company.vatNumber='';company.taxNumber='';company.commercialRegistration='';company.bank={bankName:'',accountName:'',iban:'',swift:'',currency:company.defaultCurrency||'USD'};company.bankAccounts=[];company.defaultBankAccountId='primary';
  const workspace:WorkspaceRecord={id,name:clean,company,numbering:resetNumbering(vault.appSettings.numbering),smartDefaults:structuredClone(vault.appSettings.smartDefaults),createdAt:now,updatedAt:now};
  const branch:BranchRecord={id:makeId('branch'),workspaceId:id,name:'Main Branch',code:'MAIN',city:'',country:'',active:true,createdAt:now,updatedAt:now};
  return{...vault,workspaces:[...vault.workspaces,workspace],branches:[...vault.branches,branch]};
}

export function createBranch(vault:VaultPayload,name:string,code:string):VaultPayload{
  const workspace=activeWorkspace(vault),clean=name.trim(),cleanCode=code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,12);
  if(!clean)throw new Error('Branch name is required.');
  if(!cleanCode)throw new Error('Branch code is required.');
  if(vault.branches.some(branch=>branch.workspaceId===workspace.id&&branch.code.toUpperCase()===cleanCode))throw new Error('Branch code already exists in this workspace.');
  const now=new Date().toISOString();
  const branch:BranchRecord={id:makeId('branch'),workspaceId:workspace.id,name:clean,code:cleanCode,city:vault.company.city,country:vault.company.country,active:true,createdAt:now,updatedAt:now};
  return{...vault,branches:[...vault.branches,branch]};
}

export function normalizeWorkspaceSmartDefaults(value:SmartDocumentDefaults):SmartDocumentDefaults{return structuredClone(value);}
