import type { DocumentEventRecord, InventoryMovementRecord, PurchaseRecord, SavedItem, Supplier, VaultPayload } from '../types.js';
import { makeId, isIsoDate, todayIso } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';
import { inventoryMovementAccountingIsValid } from './operations.js';

export type InventoryPlanStatus='critical'|'reorder'|'healthy'|'unconfigured';

export interface InventoryPlanningPolicy{
  itemId:string;
  reorderPoint:string;
  targetStock:string;
  safetyStock:string;
  leadTimeDays:number;
  preferredSupplierId:string;
  notes:string;
  updatedAt:string;
}

export interface InventoryPlanningRow{
  item:SavedItem;
  policy:InventoryPlanningPolicy|null;
  status:InventoryPlanStatus;
  onHand:string;
  onHandScaled:bigint;
  averageDailyIssue:string;
  leadTimeDemand:string;
  reorderTrigger:string;
  suggestedOrder:string;
  daysCover:number|null;
  preferredSupplier:Supplier|null;
  lastPurchase:PurchaseRecord|null;
}

export interface InventoryPlanningSnapshot{
  rows:InventoryPlanningRow[];
  critical:number;
  reorder:number;
  healthy:number;
  unconfigured:number;
  suggestedOrderItems:number;
  asOf:string;
  lookbackDays:number;
}

const PLAN_MARKER='@lourex:inventory-plan:v1:';
const PLAN_DOCUMENT_PREFIX='@lourex:inventory-plan:';
const SCALE=10_000n;

type PlanningPayload=
  |{kind:'upsert';policy:InventoryPlanningPolicy}
  |{kind:'delete';itemId:string;updatedAt:string};

function clean(value:unknown,max=1000):string{return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function fixed4(value:bigint):string{
  const sign=value<0n?'-':'';
  const abs=value<0n?-value:value;
  const whole=abs/SCALE;
  const fraction=(abs%SCALE).toString().padStart(4,'0').replace(/0+$/,'');
  return `${sign}${whole}${fraction?`.${fraction}`:''}`;
}
function scaled(value:string):bigint{return decimalToScaled(value||'0',4);}
function maxBigInt(a:bigint,b:bigint):bigint{return a>b?a:b;}
function nonNegative(value:unknown):string{
  const text=clean(value,32);
  return text&&isNonNegativeDecimalInput(text)?text:'';
}
function dateCutoff(asOf:string,days:number):string{
  const date=new Date(`${asOf}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate()-Math.max(0,days-1));
  return date.toISOString().slice(0,10);
}
function nextMutationIso(previous=''):string{
  const now=Date.now(),prior=Date.parse(previous);
  return new Date(Number.isFinite(prior)?Math.max(now,prior+1):now).toISOString();
}
function eventOrder(event:DocumentEventRecord):string{return `${event.at}|${event.id}`;}

function parsePolicy(value:any):InventoryPlanningPolicy|null{
  if(!value||typeof value!=='object')return null;
  const itemId=clean(value.itemId,120),updatedAt=clean(value.updatedAt,40);
  if(!itemId||!updatedAt||!Number.isFinite(Date.parse(updatedAt)))return null;
  const leadTimeDays=Math.max(0,Math.min(3650,Math.trunc(Number(value.leadTimeDays)||0)));
  return{
    itemId,
    reorderPoint:nonNegative(value.reorderPoint),
    targetStock:nonNegative(value.targetStock),
    safetyStock:nonNegative(value.safetyStock)||'0',
    leadTimeDays,
    preferredSupplierId:clean(value.preferredSupplierId,120),
    notes:clean(value.notes,1000),
    updatedAt
  };
}

function parseEvent(event:DocumentEventRecord):PlanningPayload|null{
  if(event.type!=='created'||!event.documentId.startsWith(PLAN_DOCUMENT_PREFIX)||!event.note.startsWith(PLAN_MARKER))return null;
  try{
    const raw=JSON.parse(event.note.slice(PLAN_MARKER.length));
    if(raw?.kind==='delete'){
      const itemId=clean(raw.itemId,120),updatedAt=clean(raw.updatedAt,40);
      return itemId&&updatedAt&&Number.isFinite(Date.parse(updatedAt))?{kind:'delete',itemId,updatedAt}:null;
    }
    if(raw?.kind==='upsert'){
      const policy=parsePolicy(raw.policy);
      return policy?{kind:'upsert',policy}:null;
    }
  }catch{}
  return null;
}

function currentByItem(events:DocumentEventRecord[]):Map<string,{order:string;payload:PlanningPayload}>{
  const latest=new Map<string,{order:string;payload:PlanningPayload}>();
  for(const event of events){
    const payload=parseEvent(event);if(!payload)continue;
    const itemId=payload.kind==='upsert'?payload.policy.itemId:payload.itemId;
    const order=eventOrder(event),existing=latest.get(itemId);
    if(!existing||order>existing.order)latest.set(itemId,{order,payload});
  }
  return latest;
}

export function inventoryPlanningPoliciesFromEvents(events:DocumentEventRecord[]):InventoryPlanningPolicy[]{
  const rows:InventoryPlanningPolicy[]=[];
  for(const {payload} of currentByItem(events).values())if(payload.kind==='upsert')rows.push(payload.policy);
  return rows.sort((a,b)=>a.itemId.localeCompare(b.itemId));
}

export function blankInventoryPlanningPolicy(item:SavedItem):InventoryPlanningPolicy{
  return{itemId:item.id,reorderPoint:'',targetStock:'',safetyStock:'0',leadTimeDays:0,preferredSupplierId:'',notes:'',updatedAt:new Date().toISOString()};
}

function validatePolicy(vault:Pick<VaultPayload,'savedItems'|'suppliers'>,policy:InventoryPlanningPolicy):InventoryPlanningPolicy{
  const item=vault.savedItems.find(row=>row.id===policy.itemId);if(!item)throw new Error('The selected product no longer exists.');
  const reorderPoint=clean(policy.reorderPoint,32),targetStock=clean(policy.targetStock,32),safetyStock=clean(policy.safetyStock,32)||'0';
  for(const [label,value] of [['Reorder point',reorderPoint],['Target stock',targetStock],['Safety stock',safetyStock]] as const){
    if(value&&!isNonNegativeDecimalInput(value))throw new Error(`${label} must be zero or greater.`);
  }
  if(reorderPoint&&targetStock&&scaled(targetStock)<scaled(reorderPoint))throw new Error('Target stock must be greater than or equal to the reorder point.');
  const leadTimeDays=Math.trunc(Number(policy.leadTimeDays));
  if(!Number.isFinite(leadTimeDays)||leadTimeDays<0||leadTimeDays>3650)throw new Error('Lead time must be a whole number from 0 to 3650 days.');
  const preferredSupplierId=clean(policy.preferredSupplierId,120);
  if(preferredSupplierId&&!vault.suppliers.some(row=>row.id===preferredSupplierId))throw new Error('The preferred supplier no longer exists.');
  return{itemId:item.id,reorderPoint,targetStock,safetyStock,leadTimeDays,preferredSupplierId,notes:clean(policy.notes,1000),updatedAt:policy.updatedAt};
}

function currentPolicy(events:DocumentEventRecord[],itemId:string):InventoryPlanningPolicy|undefined{return inventoryPlanningPoliciesFromEvents(events).find(row=>row.itemId===itemId);}
function assertFresh(events:DocumentEventRecord[],itemId:string,expectedUpdatedAt:string):void{
  const current=currentPolicy(events,itemId);
  if(!current&&expectedUpdatedAt)throw new Error('This inventory plan was reset on another device. Refresh Inventory Planning.');
  if(current&&current.updatedAt!==expectedUpdatedAt)throw new Error('This inventory plan changed on another device. Refresh Inventory Planning before saving.');
}
function planningEvent(itemId:string,itemName:string,at:string,payload:PlanningPayload):DocumentEventRecord{
  return{id:makeId('inventory-plan-event'),documentId:`${PLAN_DOCUMENT_PREFIX}${itemId}`,documentNumber:itemName,type:'created',at,note:`${PLAN_MARKER}${JSON.stringify(payload)}`,relatedDocumentId:itemId,relatedDocumentNumber:'',amount:'',currency:''};
}

export function validatedInventoryPlanningUpsertEvent(vault:Pick<VaultPayload,'savedItems'|'suppliers'|'documentEvents'>,policy:InventoryPlanningPolicy,expectedUpdatedAt:string):{event:DocumentEventRecord;policy:InventoryPlanningPolicy}{
  assertFresh(vault.documentEvents,policy.itemId,expectedUpdatedAt);
  const validated=validatePolicy(vault,policy);
  const updatedAt=nextMutationIso(expectedUpdatedAt);
  const next={...validated,updatedAt};
  const item=vault.savedItems.find(row=>row.id===next.itemId)!;
  const name=(item.descriptionEn||item.descriptionAr||item.sku||'Inventory plan').trim();
  return{policy:next,event:planningEvent(next.itemId,name,updatedAt,{kind:'upsert',policy:next})};
}

export function validatedInventoryPlanningDeleteEvent(vault:Pick<VaultPayload,'savedItems'|'documentEvents'>,itemId:string,expectedUpdatedAt:string):DocumentEventRecord{
  assertFresh(vault.documentEvents,itemId,expectedUpdatedAt);
  const current=currentPolicy(vault.documentEvents,itemId);if(!current)throw new Error('Inventory plan not found.');
  const item=vault.savedItems.find(row=>row.id===itemId);if(!item)throw new Error('The selected product no longer exists.');
  const updatedAt=nextMutationIso(current.updatedAt),name=(item.descriptionEn||item.descriptionAr||item.sku||'Inventory plan').trim();
  return planningEvent(itemId,name,updatedAt,{kind:'delete',itemId,updatedAt});
}

function balanceByItem(movements:InventoryMovementRecord[]):Map<string,bigint>{
  const balances=new Map<string,bigint>();
  for(const movement of movements){
    if(!inventoryMovementAccountingIsValid(movement))continue;
    balances.set(movement.itemId,(balances.get(movement.itemId)??0n)+scaled(movement.quantity));
  }
  return balances;
}
function issueVelocityByItem(movements:InventoryMovementRecord[],asOf:string,lookbackDays:number):Map<string,bigint>{
  const cutoff=dateCutoff(asOf,lookbackDays),totals=new Map<string,bigint>();
  for(const movement of movements){
    if(movement.type!=='issue'||!inventoryMovementAccountingIsValid(movement)||movement.date<cutoff||movement.date>asOf)continue;
    const quantity=scaled(movement.quantity),issued=quantity<0n?-quantity:quantity;
    totals.set(movement.itemId,(totals.get(movement.itemId)??0n)+issued);
  }
  const daily=new Map<string,bigint>();
  for(const [itemId,total] of totals)daily.set(itemId,total/BigInt(Math.max(1,lookbackDays)));
  return daily;
}
function lastPostedPurchaseForItem(purchases:PurchaseRecord[],itemId:string):PurchaseRecord|null{
  return purchases.filter(row=>row.status==='posted'&&row.items.some(line=>line.savedItemId===itemId)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt))[0]??null;
}
function inferredSupplier(purchases:PurchaseRecord[],suppliers:Supplier[],itemId:string,preferredSupplierId:string):{supplier:Supplier|null;purchase:PurchaseRecord|null}{
  if(preferredSupplierId){const preferred=suppliers.find(row=>row.id===preferredSupplierId)??null;return{supplier:preferred,purchase:lastPostedPurchaseForItem(purchases,itemId)};}
  const purchase=lastPostedPurchaseForItem(purchases,itemId),supplierId=purchase?.supplierSnapshot?.sourceSupplierId??'';
  return{supplier:suppliers.find(row=>row.id===supplierId)??null,purchase};
}

export function buildInventoryPlanning(vault:Pick<VaultPayload,'savedItems'|'suppliers'|'purchases'|'inventoryMovements'|'documentEvents'>,asOf=todayIso(),lookbackDays=90):InventoryPlanningSnapshot{
  if(!isIsoDate(asOf))throw new Error('Inventory planning date is invalid.');
  const windowDays=Math.max(1,Math.min(365,Math.trunc(lookbackDays)||90));
  const policies=new Map(inventoryPlanningPoliciesFromEvents(vault.documentEvents).map(policy=>[policy.itemId,policy]));
  const balances=balanceByItem(vault.inventoryMovements),velocity=issueVelocityByItem(vault.inventoryMovements,asOf,windowDays);
  const rows=vault.savedItems.filter(item=>!item.archived).map(item=>{
    const policy=policies.get(item.id)??null,onHandScaled=balances.get(item.id)??0n,averageDailyScaled=velocity.get(item.id)??0n;
    const reorderScaled=policy?.reorderPoint?scaled(policy.reorderPoint):0n,safetyScaled=policy?.safetyStock?scaled(policy.safetyStock):0n;
    const leadDemandScaled=averageDailyScaled*BigInt(policy?.leadTimeDays??0),reorderTriggerScaled=maxBigInt(reorderScaled,leadDemandScaled+safetyScaled);
    const targetScaled=policy?.targetStock?scaled(policy.targetStock):0n;
    const configured=Boolean(policy&&(policy.reorderPoint||policy.targetStock||policy.leadTimeDays||scaled(policy.safetyStock)>0n));
    const needsOrder=configured&&onHandScaled<=reorderTriggerScaled;
    const suggestedScaled=needsOrder&&targetScaled>onHandScaled?targetScaled-onHandScaled:0n;
    const status:InventoryPlanStatus=!configured?'unconfigured':onHandScaled<=0n?'critical':needsOrder?'reorder':'healthy';
    const daysCover=averageDailyScaled>0n&&onHandScaled>0n?Number(onHandScaled)/Number(averageDailyScaled):null;
    const linked=inferredSupplier(vault.purchases,vault.suppliers,item.id,policy?.preferredSupplierId??'');
    return{item,policy,status,onHand:fixed4(onHandScaled),onHandScaled,averageDailyIssue:fixed4(averageDailyScaled),leadTimeDemand:fixed4(leadDemandScaled),reorderTrigger:fixed4(reorderTriggerScaled),suggestedOrder:fixed4(suggestedScaled),daysCover,preferredSupplier:linked.supplier,lastPurchase:linked.purchase};
  }).sort((a,b)=>{
    const rank:Record<InventoryPlanStatus,number>={critical:0,reorder:1,healthy:2,unconfigured:3};
    if(rank[a.status]!==rank[b.status])return rank[a.status]-rank[b.status];
    return (a.item.sku||a.item.descriptionEn||a.item.descriptionAr).localeCompare(b.item.sku||b.item.descriptionEn||b.item.descriptionAr);
  });
  return{
    rows,
    critical:rows.filter(row=>row.status==='critical').length,
    reorder:rows.filter(row=>row.status==='reorder').length,
    healthy:rows.filter(row=>row.status==='healthy').length,
    unconfigured:rows.filter(row=>row.status==='unconfigured').length,
    suggestedOrderItems:rows.filter(row=>scaled(row.suggestedOrder)>0n).length,
    asOf,lookbackDays:windowDays
  };
}

export function isInventoryPlanningEvent(event:DocumentEventRecord):boolean{return Boolean(parseEvent(event));}
