import type { AppSettings, BranchRecord, CompanySettings, SmartDocumentDefaults, VaultPayload, WorkspaceRecord } from '../types.js';
import { makeId } from './id.js';

export const DEFAULT_WORKSPACE_ID='default';
export const DEFAULT_BRANCH_ID='main';

const COMPANY_SCOPED_KEYS=['customers','suppliers','savedItems'] as const;
const BRANCH_SCOPED_KEYS=['purchases','supplierPayments','expenses','inventoryMovements','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const;

function same(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b);}
function recordWorkspace(record:any):string{return String(record?.workspaceId||DEFAULT_WORKSPACE_ID);}
function recordBranch(record:any):string{return String(record?.branchId||DEFAULT_BRANCH_ID);}

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

function filterCompanyScope<T>(rows:T[],workspaceId:string):T[]{return rows.filter(row=>recordWorkspace(row)===workspaceId);}
function filterBranchScope<T>(rows:T[],workspaceId:string,branchId:string):T[]{return rows.filter(row=>recordWorkspace(row)===workspaceId&&recordBranch(row)===branchId);}

export function scopeVault(vault:VaultPayload):VaultPayload{
  const workspace=activeWorkspace(vault),branch=activeBranch(vault);
  const scoped:any={...vault,company:structuredClone(workspace.company),appSettings:{...vault.appSettings,activeWorkspaceId:workspace.id,activeBranchId:branch.id,numbering:structuredClone(workspace.numbering),smartDefaults:structuredClone(workspace.smartDefaults)}};
  for(const key of COMPANY_SCOPED_KEYS)scoped[key]=filterCompanyScope((vault as any)[key]??[],workspace.id);
  for(const key of BRANCH_SCOPED_KEYS)scoped[key]=filterBranchScope((vault as any)[key]??[],workspace.id,branch.id);
  return scoped as VaultPayload;
}

function stampChanged(before:any[],after:any[],workspaceId:string,branchId:string):any[]{
  const beforeById=new Map(before.map(item=>[item.id,item]));
  return after.map(item=>{
    const previous=beforeById.get(item.id);
    if(previous&&same(previous,item))return item;
    return{...item,workspaceId,branchId};
  });
}

export function applyWorkspaceScope(base:VaultPayload,intended:VaultPayload):VaultPayload{
  const workspaceId=intended.appSettings.activeWorkspaceId||base.appSettings.activeWorkspaceId||DEFAULT_WORKSPACE_ID;
  const branchId=intended.appSettings.activeBranchId||base.appSettings.activeBranchId||DEFAULT_BRANCH_ID;
  const next:any={...intended};
  for(const key of COMPANY_SCOPED_KEYS)next[key]=stampChanged((base as any)[key]??[],(intended as any)[key]??[],workspaceId,'');
  for(const key of BRANCH_SCOPED_KEYS)next[key]=stampChanged((base as any)[key]??[],(intended as any)[key]??[],workspaceId,branchId);
  const now=new Date().toISOString();
  next.workspaces=intended.workspaces.map(workspace=>workspace.id===workspaceId?{
    ...workspace,
    company:structuredClone(intended.company),
    numbering:structuredClone(intended.appSettings.numbering),
    smartDefaults:structuredClone(intended.appSettings.smartDefaults),
    updatedAt:now
  }:workspace);
  return next as VaultPayload;
}

export function overlayWorkspaceScope(full:VaultPayload,scoped:VaultPayload):VaultPayload{
  const workspace=activeWorkspace(scoped),branch=activeBranch(scoped);
  const next:any={...full,...scoped};
  for(const key of COMPANY_SCOPED_KEYS){
    const hidden=((full as any)[key]??[]).filter((row:any)=>recordWorkspace(row)!==workspace.id);
    next[key]=[...hidden,...((scoped as any)[key]??[])];
  }
  for(const key of BRANCH_SCOPED_KEYS){
    const hidden=((full as any)[key]??[]).filter((row:any)=>!(recordWorkspace(row)===workspace.id&&recordBranch(row)===branch.id));
    next[key]=[...hidden,...((scoped as any)[key]??[])];
  }
  next.company=structuredClone(workspace.company);
  next.appSettings={...scoped.appSettings,activeWorkspaceId:workspace.id,activeBranchId:branch.id,numbering:structuredClone(workspace.numbering),smartDefaults:structuredClone(workspace.smartDefaults)};
  return next as VaultPayload;
}

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
  const company=structuredClone(vault.company);company.nameEn=clean;company.nameAr='';company.logoDataUrl='';company.signatureDataUrl='';company.stampDataUrl='';company.vatNumber='';company.taxNumber='';company.commercialRegistration='';
  const workspace:WorkspaceRecord={id,name:clean,company,numbering:structuredClone(vault.appSettings.numbering),smartDefaults:structuredClone(vault.appSettings.smartDefaults),createdAt:now,updatedAt:now};
  const branch:BranchRecord={id:makeId('branch'),workspaceId:id,name:'Main Branch',code:'MAIN',city:company.city,country:company.country,active:true,createdAt:now,updatedAt:now};
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
