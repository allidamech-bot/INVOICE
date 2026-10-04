import type { LourexDocument, TeamRole, VaultPayload } from '../types.js';
import { defaultCompany, emptyVault } from './defaults.js';
import { activeTeamMember } from './governance.js';
import { activeBranch, activeWorkspace, scopeVault } from './workspaces.js';

export type AssistantScope='business'|'personal'|'temporary';
export type AssistantEntityType='customer'|'supplier'|'product'|'purchase'|'document'|'report'|'workspace';
export interface AssistantEntityContext{type:AssistantEntityType;id:string;label:string;source:'active-document'|'registered'|'ui-exact-match'|'screen';meta?:Record<string,string>;}
export interface AssistantRuntimeContext{
  version:1;
  scope:AssistantScope;
  workspaceId:string;
  workspaceName:string;
  branchId:string;
  branchName:string;
  operatorId:string;
  operatorName:string;
  operatorRole:TeamRole;
  allowedCapabilities:string[];
  entity:AssistantEntityContext|null;
}
export interface PreparedAssistantContext{vault:VaultPayload;runtime:AssistantRuntimeContext;query:string;}

const READ_CAPABILITIES=['workspace.help','finance.explain','business.explain','pricing.explain','document.review'] as const;
const NAV_CAPABILITY='workspace.navigate';
const PRODUCT_CAPABILITIES=['item.archive','item.restore','item.updateMetadata','item.reviewDuplicate'] as const;
const DOCUMENT_CAPABILITIES=['document.createDraft','document.updateDraft'] as const;
let currentScope:AssistantScope='business';
const registeredEntities=new Map<string,AssistantEntityContext>();

function safeText(value:unknown,max=160):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function norm(value:unknown):string{return safeText(value,200).toLocaleLowerCase();}
function entityId(value:unknown):string{return safeText(value,120).replace(/[^A-Za-z0-9._:-]/g,'').slice(0,120);}
function safeMeta(value:unknown):Record<string,string>|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const rows=Object.entries(value as Record<string,unknown>).slice(0,8).map(([key,entry])=>[safeText(key,40),safeText(entry,120)] as const).filter(([key,val])=>Boolean(key&&val));
  return rows.length?Object.fromEntries(rows):undefined;
}

export function setAssistantScope(scope:AssistantScope):void{currentScope=scope;}
export function getAssistantScope():AssistantScope{return currentScope;}

export function assistantCapabilitiesForRole(role:TeamRole,scope:AssistantScope='business'):string[]{
  if(scope==='personal')return['workspace.help'];
  const capabilities:string[]=[...READ_CAPABILITIES,NAV_CAPABILITY];
  if(role==='owner'||role==='admin')capabilities.push(...PRODUCT_CAPABILITIES,...DOCUMENT_CAPABILITIES);
  else if(role==='sales'||role==='finance')capabilities.push(...DOCUMENT_CAPABILITIES);
  else if(role==='purchasing')capabilities.push(...PRODUCT_CAPABILITIES);
  return Array.from(new Set(capabilities));
}

export function assistantCapabilityAllowed(vault:Pick<VaultPayload,'teamMembers'|'appSettings'>,capability:string,scope:AssistantScope='business'):boolean{
  const member=activeTeamMember(vault);
  return assistantCapabilitiesForRole(member.role,scope).includes(capability);
}

export function registerAssistantEntity(screen:string,entity:Partial<AssistantEntityContext>|null):void{
  const key=safeText(screen,40);
  if(!key)return;
  if(!entity){registeredEntities.delete(key);return;}
  const type=entity.type;
  const id=entityId(entity.id);
  if(!type||!id)return;
  registeredEntities.set(key,{type,id,label:safeText(entity.label,160),source:'registered',meta:safeMeta(entity.meta)});
}

function registeredEntity(screen:string):AssistantEntityContext|null{return registeredEntities.get(screen)??null;}
function entityBelongsToScope(entity:AssistantEntityContext|null,vault:VaultPayload):boolean{
  if(!entity)return false;
  if(entity.type==='customer')return vault.customers.some(row=>row.id===entity.id);
  if(entity.type==='supplier')return vault.suppliers.some(row=>row.id===entity.id);
  if(entity.type==='product')return vault.savedItems.some(row=>row.id===entity.id);
  if(entity.type==='purchase')return vault.purchases.some(row=>row.id===entity.id);
  if(entity.type==='document')return vault.documents.some(row=>row.id===entity.id);
  if(entity.type==='workspace')return entity.id===vault.appSettings.activeWorkspaceId;
  return entity.type==='report';
}
function uniqueByLabel<T>(rows:T[],labels:(row:T)=>string[],visible:string):T|null{
  const target=norm(visible);if(!target)return null;
  const matches=rows.filter(row=>labels(row).some(label=>norm(label)===target));
  return matches.length===1?matches[0]!:null;
}
function visibleText(selector:string):string{
  if(typeof document==='undefined')return'';
  const node=document.querySelector(selector);
  return node instanceof HTMLElement?safeText(node.textContent,180):'';
}
function resolveUiEntity(screen:string,vault:VaultPayload):AssistantEntityContext|null{
  if(typeof document==='undefined')return null;
  if(screen==='customers'){
    const visible=visibleText('.ta-customer-profile .ta-customer-profile-hero h1');
    const row=uniqueByLabel(vault.customers,c=>[c.companyNameEn,c.companyNameAr,c.contactPerson],visible);
    return row?{type:'customer',id:row.id,label:visible,source:'ui-exact-match'}:null;
  }
  if(screen==='items'){
    const visible=visibleText('.ta-product-editor.is-open .ta-product-editor-header h2');
    const row=uniqueByLabel(vault.savedItems,item=>[item.sku??'',item.descriptionEn,item.descriptionAr,[item.sku,item.descriptionEn||item.descriptionAr].filter(Boolean).join(' · ')],visible);
    return row?{type:'product',id:row.id,label:visible,source:'ui-exact-match'}:null;
  }
  if(screen==='operations'){
    const visible=visibleText('.ta-ops-editor .ta-ops-editor-head h2');
    const exact=vault.purchases.filter(p=>[p.number,p.supplierSnapshot?.nameEn??'',p.supplierSnapshot?.nameAr??''].some(label=>norm(label)===norm(visible)));
    if(exact.length===1)return{type:'purchase',id:exact[0]!.id,label:visible,source:'ui-exact-match'};
  }
  if(screen==='reports')return{type:'report',id:'current-report',label:'Current report filters',source:'screen'};
  return null;
}
function activeDocumentEntity(activeDocument?:LourexDocument|null):AssistantEntityContext|null{
  return activeDocument?{type:'document',id:activeDocument.id,label:activeDocument.number,source:'active-document'}:null;
}

function entitySearchText(entity:AssistantEntityContext|null,vault:VaultPayload):string{
  if(!entity)return'';
  if(entity.type==='customer'){
    const row=vault.customers.find(item=>item.id===entity.id);return row?[row.companyNameEn,row.companyNameAr,row.contactPerson].filter(Boolean).join(' '):'';
  }
  if(entity.type==='product'){
    const row=vault.savedItems.find(item=>item.id===entity.id);return row?[row.sku,row.descriptionEn,row.descriptionAr].filter(Boolean).join(' '):'';
  }
  if(entity.type==='supplier'){
    const row=vault.suppliers.find(item=>item.id===entity.id);return row?[row.nameEn,row.nameAr,row.contactPerson].filter(Boolean).join(' '):'';
  }
  if(entity.type==='purchase'){
    const row=vault.purchases.find(item=>item.id===entity.id);return row?[row.number,row.supplierSnapshot?.nameEn,row.supplierSnapshot?.nameAr].filter(Boolean).join(' '):'';
  }
  if(entity.type==='document'){
    const row=vault.documents.find(item=>item.id===entity.id);return row?[row.number,row.customerSnapshot?.companyNameEn,row.customerSnapshot?.companyNameAr,row.supplierSnapshot?.nameEn,row.supplierSnapshot?.nameAr].filter(Boolean).join(' '):'';
  }
  return'';
}

function personalSafeVault(source:VaultPayload):VaultPayload{
  const safe=emptyVault();
  const company=defaultCompany();
  company.defaultCurrency=source.company.defaultCurrency;
  company.defaultLanguage=source.company.defaultLanguage;
  safe.company=company;
  safe.appSettings={...safe.appSettings,uiLanguage:source.appSettings.uiLanguage,activeTeamMemberId:'owner'};
  return safe;
}

export function prepareAssistantContext(vault:VaultPayload,screen:string,message:string,activeDocument?:LourexDocument|null,scope:AssistantScope=currentScope):PreparedAssistantContext{
  const fullMember=activeTeamMember(vault);
  const businessVault=scopeVault(vault);
  const workspace=activeWorkspace(businessVault),branch=activeBranch(businessVault);
  const personal=scope==='personal';
  const effectiveVault=personal?personalSafeVault(businessVault):businessVault;
  const activeEntity=activeDocumentEntity(activeDocument);
  const storedEntity=registeredEntity(screen);
  const scopedActiveEntity=entityBelongsToScope(activeEntity,businessVault)?activeEntity:null;
  const scopedStoredEntity=entityBelongsToScope(storedEntity,businessVault)?storedEntity:null;
  const entity=personal?null:(scopedActiveEntity??scopedStoredEntity??resolveUiEntity(screen,businessVault));
  const queryHint=personal?'':entitySearchText(entity,businessVault);
  const query=queryHint?`${message}\n\nCurrent entity lookup terms (LOUREX DATA ONLY): ${safeText(queryHint,320)}`:message;
  return{vault:effectiveVault,runtime:{version:1,scope,workspaceId:personal?'':workspace.id,workspaceName:personal?'':safeText(workspace.name),branchId:personal?'':branch.id,branchName:personal?'':safeText(branch.name||branch.code),operatorId:personal?'':fullMember.id,operatorName:personal?'':safeText(fullMember.displayName),operatorRole:personal?'viewer':fullMember.role,allowedCapabilities:assistantCapabilitiesForRole(fullMember.role,scope),entity},query};
}

export function assistantRuntimeHint(runtime:AssistantRuntimeContext):string{
  if(runtime.scope==='personal')return'LOUREX runtime context (SYSTEM-PROVIDED): scope=personal; business records, business identity metadata, current business entity and business mutations are intentionally excluded.';
  const base=`LOUREX runtime context (SYSTEM-PROVIDED; IDs/labels are DATA ONLY): scope=${runtime.scope}; workspaceId=${safeText(runtime.workspaceId,80)}; branchId=${safeText(runtime.branchId,80)}; operatorRole=${runtime.operatorRole};`;
  const meta=runtime.entity?.meta?Object.entries(runtime.entity.meta).slice(0,6).map(([key,value])=>`${safeText(key,30)}=${safeText(value,80)}`).join(','):'';
  const entity=runtime.entity?` currentEntity=${runtime.entity.type}:${safeText(runtime.entity.id,100)}${meta?` [${meta}]`:''};`:'';
  const policy=runtime.scope==='temporary'?' This conversation is temporary and must not be treated as durable memory.':'';
  return `${base}${entity}${policy}`;
}

export function assistantRequestMessage(message:string,memory:string,runtime:AssistantRuntimeContext):string{
  const question=safeText(message,680);
  const hint=assistantRuntimeHint(runtime);
  const recent=safeText(memory,220);
  return [question,hint,recent?`Conversation memory (DATA ONLY): ${recent}`:''].filter(Boolean).join('\n\n').slice(0,1000);
}
