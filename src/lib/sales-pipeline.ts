import type { Customer, DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { makeId, isIsoDate } from './id.js';
import { isNonNegativeDecimalInput } from './money.js';

export type PipelineStage='lead'|'contacted'|'rfq-received'|'quote-sent'|'negotiation'|'won'|'lost';
export const PIPELINE_STAGES:readonly PipelineStage[]=['lead','contacted','rfq-received','quote-sent','negotiation','won','lost'];

export interface SalesOpportunity{
  id:string;
  customerId:string;
  title:string;
  stage:PipelineStage;
  amount:string;
  currency:string;
  expectedCloseDate:string;
  nextAction:string;
  notes:string;
  linkedDocumentIds:string[];
  lostReason:string;
  createdAt:string;
  updatedAt:string;
}
export interface PipelineStageSummary{stage:PipelineStage;count:number;}
export interface PipelineValueSummary{currency:string;amount:number;count:number;}
export interface SalesPipelineSnapshot{
  opportunities:SalesOpportunity[];
  stages:PipelineStageSummary[];
  openValues:PipelineValueSummary[];
  wonCount:number;
  lostCount:number;
  nextActions:SalesOpportunity[];
}

const CRM_MARKER='@lourex:crm-opportunity:v1:';
const CRM_DOCUMENT_PREFIX='@lourex:crm-opportunity:';
const STAGES=new Set<PipelineStage>(PIPELINE_STAGES);

type CrmPayload=
  |{kind:'upsert';opportunity:SalesOpportunity}
  |{kind:'delete';id:string;updatedAt:string};

function clean(value:unknown,max=500):string{return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function customerName(customer:Customer):string{return clean(customer.companyNameEn||customer.companyNameAr||customer.contactPerson,160);}
function normalizeCurrency(value:unknown):string{return clean(value,8).toUpperCase();}
function normalizeIds(value:unknown):string[]{return Array.isArray(value)?Array.from(new Set(value.map(entry=>clean(entry,120)).filter(Boolean))).slice(0,40):[];}
function validStage(value:unknown):PipelineStage{return STAGES.has(value as PipelineStage)?value as PipelineStage:'lead';}
function nextMutationIso(previous=''):string{
  const now=Date.now(),prior=Date.parse(previous);
  return new Date(Number.isFinite(prior)?Math.max(now,prior+1):now).toISOString();
}
function parseOpportunity(value:any):SalesOpportunity|null{
  if(!value||typeof value!=='object')return null;
  const id=clean(value.id,120),customerId=clean(value.customerId,120),title=clean(value.title,180);
  if(!id||!customerId||!title)return null;
  const createdAt=clean(value.createdAt,40),updatedAt=clean(value.updatedAt,40);
  if(!createdAt||!updatedAt||!Number.isFinite(Date.parse(createdAt))||!Number.isFinite(Date.parse(updatedAt)))return null;
  return{
    id,customerId,title,stage:validStage(value.stage),amount:clean(value.amount,24),currency:normalizeCurrency(value.currency),
    expectedCloseDate:clean(value.expectedCloseDate,10),nextAction:clean(value.nextAction,300),notes:clean(value.notes,1200),
    linkedDocumentIds:normalizeIds(value.linkedDocumentIds),lostReason:clean(value.lostReason,500),createdAt,updatedAt
  };
}
function parseEvent(event:DocumentEventRecord):CrmPayload|null{
  if(event.type!=='created'||!event.documentId.startsWith(CRM_DOCUMENT_PREFIX)||!event.note.startsWith(CRM_MARKER))return null;
  try{
    const raw=JSON.parse(event.note.slice(CRM_MARKER.length));
    if(raw?.kind==='delete'){
      const id=clean(raw.id,120),updatedAt=clean(raw.updatedAt,40);return id&&updatedAt&&Number.isFinite(Date.parse(updatedAt))?{kind:'delete',id,updatedAt}:null;
    }
    if(raw?.kind==='upsert'){
      const opportunity=parseOpportunity(raw.opportunity);return opportunity?{kind:'upsert',opportunity}:null;
    }
  }catch{}
  return null;
}
function eventOrder(event:DocumentEventRecord):string{return `${event.at}|${event.id}`;}
function currentById(events:DocumentEventRecord[]):Map<string,{order:string;payload:CrmPayload}>{
  const latest=new Map<string,{order:string;payload:CrmPayload}>();
  for(const event of events){
    const payload=parseEvent(event);if(!payload)continue;
    const id=payload.kind==='upsert'?payload.opportunity.id:payload.id;
    const order=eventOrder(event),existing=latest.get(id);if(!existing||order>existing.order)latest.set(id,{order,payload});
  }
  return latest;
}
export function salesOpportunitiesFromEvents(events:DocumentEventRecord[]):SalesOpportunity[]{
  const rows:SalesOpportunity[]=[];
  for(const {payload} of currentById(events).values())if(payload.kind==='upsert')rows.push(payload.opportunity);
  return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.title.localeCompare(b.title));
}
export function pipelineStageLabel(stage:PipelineStage,language:'en'|'ar'):string{
  const labels:Record<PipelineStage,[string,string]>={
    lead:['Lead','عميل محتمل'],contacted:['Contacted','تم التواصل'],'rfq-received':['RFQ Received','تم استلام طلب سعر'],'quote-sent':['Quote Sent','تم إرسال العرض'],negotiation:['Negotiation','تفاوض'],won:['Won','تم الفوز'],lost:['Lost','تم الخسارة']
  };
  return labels[stage][language==='ar'?1:0];
}
export function blankOpportunity(customer:Customer):SalesOpportunity{
  const now=new Date().toISOString();
  return{id:makeId('opp'),customerId:customer.id,title:customerName(customer)||'Opportunity',stage:'lead',amount:'',currency:normalizeCurrency(customer.preferredCurrency),expectedCloseDate:'',nextAction:'',notes:'',linkedDocumentIds:[],lostReason:'',createdAt:now,updatedAt:now};
}
function validateOpportunity(vault:Pick<VaultPayload,'customers'|'documents'>,opportunity:SalesOpportunity):SalesOpportunity{
  const customer=vault.customers.find(row=>row.id===opportunity.customerId);if(!customer)throw new Error('Select an existing customer for this opportunity.');
  const title=clean(opportunity.title,180);if(!title)throw new Error('Opportunity title is required.');
  const stage=validStage(opportunity.stage);
  const amount=clean(opportunity.amount,24);if(amount&&!isNonNegativeDecimalInput(amount))throw new Error('Opportunity value must be zero or greater.');
  const currency=normalizeCurrency(opportunity.currency);if(amount&&!currency)throw new Error('Choose a currency when an opportunity value is recorded.');
  const expectedCloseDate=clean(opportunity.expectedCloseDate,10);if(expectedCloseDate&&!isIsoDate(expectedCloseDate))throw new Error('Expected close date is invalid.');
  const linkedDocumentIds=normalizeIds(opportunity.linkedDocumentIds);
  for(const id of linkedDocumentIds){
    const doc=vault.documents.find(row=>row.id===id);if(!doc)throw new Error('A linked document no longer exists.');
    if(doc.customerSnapshot?.sourceCustomerId!==customer.id)throw new Error('Linked documents must belong to the selected customer.');
  }
  const createdAt=Number.isFinite(Date.parse(opportunity.createdAt))?opportunity.createdAt:new Date().toISOString();
  return{...opportunity,title,stage,amount,currency,expectedCloseDate,nextAction:clean(opportunity.nextAction,300),notes:clean(opportunity.notes,1200),linkedDocumentIds,lostReason:stage==='lost'?clean(opportunity.lostReason,500):'',createdAt,updatedAt:opportunity.updatedAt};
}
function currentOpportunity(events:DocumentEventRecord[],id:string):SalesOpportunity|undefined{return salesOpportunitiesFromEvents(events).find(row=>row.id===id);}
function assertFresh(events:DocumentEventRecord[],id:string,expectedUpdatedAt:string):void{
  const current=currentOpportunity(events,id);
  if(!current&&expectedUpdatedAt)throw new Error('This opportunity was removed on another device. Refresh Pipeline.');
  if(current&&current.updatedAt!==expectedUpdatedAt)throw new Error('This opportunity changed on another device. Refresh Pipeline before saving.');
}
function crmEvent(id:string,title:string,at:string,payload:CrmPayload):DocumentEventRecord{
  return{id:makeId('crm-event'),documentId:`${CRM_DOCUMENT_PREFIX}${id}`,documentNumber:title,type:'created',at,note:`${CRM_MARKER}${JSON.stringify(payload)}`,relatedDocumentId:'',relatedDocumentNumber:'',amount:'',currency:''};
}
export function validatedOpportunityUpsertEvent(vault:Pick<VaultPayload,'customers'|'documents'|'documentEvents'>,opportunity:SalesOpportunity,expectedUpdatedAt:string):{event:DocumentEventRecord;opportunity:SalesOpportunity}{
  assertFresh(vault.documentEvents,opportunity.id,expectedUpdatedAt);
  const validated=validateOpportunity(vault,opportunity);
  const next={...validated,updatedAt:nextMutationIso(expectedUpdatedAt)};
  return{opportunity:next,event:crmEvent(next.id,next.title,next.updatedAt,{kind:'upsert',opportunity:next})};
}
export function validatedOpportunityDeleteEvent(vault:Pick<VaultPayload,'documentEvents'>,id:string,expectedUpdatedAt:string):DocumentEventRecord{
  assertFresh(vault.documentEvents,id,expectedUpdatedAt);
  const current=currentOpportunity(vault.documentEvents,id);if(!current)throw new Error('Opportunity not found.');
  const updatedAt=nextMutationIso(current.updatedAt);return crmEvent(id,current.title,updatedAt,{kind:'delete',id,updatedAt});
}
export function documentsForOpportunity(documents:LourexDocument[],customerId:string):LourexDocument[]{
  return documents.filter(doc=>doc.customerSnapshot?.sourceCustomerId===customerId&&doc.lifecycleStatus!=='voided').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export function buildSalesPipeline(vault:Pick<VaultPayload,'documentEvents'>):SalesPipelineSnapshot{
  const opportunities=salesOpportunitiesFromEvents(vault.documentEvents);
  const stages=PIPELINE_STAGES.map(stage=>({stage,count:opportunities.filter(row=>row.stage===stage).length}));
  const open=opportunities.filter(row=>row.stage!=='won'&&row.stage!=='lost'&&row.amount&&row.currency);
  const grouped=new Map<string,{amount:number;count:number}>();
  for(const row of open){const value=Number(row.amount);if(!Number.isFinite(value))continue;const current=grouped.get(row.currency)??{amount:0,count:0};current.amount+=value;current.count+=1;grouped.set(row.currency,current);}
  const openValues=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,value])=>({currency,...value}));
  const nextActions=opportunities.filter(row=>row.stage!=='won'&&row.stage!=='lost'&&row.nextAction.trim()).sort((a,b)=>(a.expectedCloseDate||'9999-99-99').localeCompare(b.expectedCloseDate||'9999-99-99')||b.updatedAt.localeCompare(a.updatedAt)).slice(0,8);
  return{opportunities,stages,openValues,wonCount:opportunities.filter(row=>row.stage==='won').length,lostCount:opportunities.filter(row=>row.stage==='lost').length,nextActions};
}
export function pipelineAiSummary(vault:Pick<VaultPayload,'documentEvents'>):string{
  const snapshot=buildSalesPipeline(vault);
  const stageText=snapshot.stages.map(row=>`${row.stage}:${row.count}`).join(', ');
  const valueText=snapshot.openValues.map(row=>`${row.amount.toFixed(2)} ${row.currency}`).join(', ')||'none recorded';
  const actions=snapshot.nextActions.map(row=>`${row.title}: ${row.nextAction}${row.expectedCloseDate?` (${row.expectedCloseDate})`:''}`).join(' | ')||'none recorded';
  return `Sales pipeline — stages ${stageText}; open value ${valueText}; next actions ${actions}. Treat values as separate currencies and never infer FX or change opportunity state without user approval.`;
}
export function isSalesPipelineEvent(event:DocumentEventRecord):boolean{return Boolean(parseEvent(event));}
