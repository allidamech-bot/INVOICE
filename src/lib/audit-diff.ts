import type { AuditAction, AuditEntityType } from './audit-trail.js';
import { createAuditEvent } from './audit-trail.js';
import type { PurchaseRecord, SavedItem, VaultPayload } from '../types.js';

function comparable(value:any):string{
  if(!value||typeof value!=='object')return JSON.stringify(value);
  const clone=structuredClone(value);
  delete clone.updatedAt;
  if('usageCount'in clone)delete clone.usageCount;
  if('lastUsedAt'in clone)delete clone.lastUsedAt;
  return JSON.stringify(clone);
}
function labelFor(type:AuditEntityType,value:any):string{
  if(type==='customer')return String(value?.companyNameEn||value?.companyNameAr||'Customer');
  if(type==='supplier')return String(value?.nameEn||value?.nameAr||'Supplier');
  if(type==='product')return String(value?.descriptionEn||value?.descriptionAr||value?.sku||'Product');
  if(type==='purchase')return String(value?.number||'Purchase');
  return String(value?.number||'Document');
}
function diffCollection<T extends {id:string}>(before:T[],after:T[],entityType:AuditEntityType,actionFor?:(previous:T,current:T)=>AuditAction):ReturnType<typeof createAuditEvent>[] {
  const oldMap=new Map(before.map(item=>[item.id,item])),newMap=new Map(after.map(item=>[item.id,item])),events:ReturnType<typeof createAuditEvent>[]=[];
  for(const current of after){
    const previous=oldMap.get(current.id);
    if(!previous){events.push(createAuditEvent({entityType,entityId:current.id,entityLabel:labelFor(entityType,current),action:'created'}));continue;}
    if(comparable(previous)!==comparable(current))events.push(createAuditEvent({entityType,entityId:current.id,entityLabel:labelFor(entityType,current),action:actionFor?actionFor(previous,current):'updated'}));
  }
  for(const previous of before){if(!newMap.has(previous.id))events.push(createAuditEvent({entityType,entityId:previous.id,entityLabel:labelFor(entityType,previous),action:'deleted'}));}
  return events;
}
function purchaseAction(previous:PurchaseRecord,current:PurchaseRecord):AuditAction{
  if(previous.status!==current.status&&current.status==='posted')return'posted';
  if(previous.status!==current.status&&current.status==='reversed')return'reversed';
  return'updated';
}
function productChanged(previous:SavedItem,current:SavedItem):boolean{return comparable(previous)!==comparable(current);}

export function auditEventsForVaultDiff(base:VaultPayload,intended:VaultPayload):ReturnType<typeof createAuditEvent>[] {
  const events=[
    ...diffCollection(base.customers,intended.customers,'customer'),
    ...diffCollection(base.suppliers,intended.suppliers,'supplier'),
    ...diffCollection(base.purchases,intended.purchases,'purchase',purchaseAction)
  ];
  const products=diffCollection(base.savedItems,intended.savedItems,'product').filter(event=>{
    if(event.auditAction!=='updated')return true;
    const previous=base.savedItems.find(item=>item.id===event.auditEntityId),current=intended.savedItems.find(item=>item.id===event.auditEntityId);
    return Boolean(previous&&current&&productChanged(previous,current));
  });
  return[...events,...products];
}

export function appendAuditEventsForVaultDiff(base:VaultPayload,intended:VaultPayload):VaultPayload{
  const generated=auditEventsForVaultDiff(base,intended);
  return generated.length?{...intended,documentEvents:[...intended.documentEvents,...generated]}:intended;
}
