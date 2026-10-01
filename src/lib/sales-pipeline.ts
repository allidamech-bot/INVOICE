import type { OpportunityRecord, OpportunityStage } from '../crm-types.js';
import { isNonNegativeDecimalInput } from './money.js';
import { isIsoDate } from './id.js';

export const OPPORTUNITY_STAGES:OpportunityStage[]=['lead','contacted','rfq-received','quote-sent','negotiation','won','lost'];
const STAGES=new Set<OpportunityStage>(OPPORTUNITY_STAGES);

function text(value:unknown):string{return typeof value==='string'?value.trim():'';}
function currency(value:unknown):string{return text(value).toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);}
function isoDate(value:unknown):string{const next=text(value);return next&&isIsoDate(next)?next:'';}
function uniqueStrings(value:unknown):string[]{return Array.isArray(value)?Array.from(new Set(value.map(text).filter(Boolean))).slice(0,100):[];}

export function normalizeOpportunity(value:any,now=new Date().toISOString()):OpportunityRecord{
  const stage:OpportunityStage=STAGES.has(value?.stage)?value.stage:'lead';
  const amount=text(value?.value);
  const normalizedCurrency=amount?currency(value?.currency):currency(value?.currency);
  return{
    id:text(value?.id),createdAt:text(value?.createdAt)||now,updatedAt:text(value?.updatedAt)||text(value?.createdAt)||now,
    title:text(value?.title),stage,customerId:text(value?.customerId),partyName:text(value?.partyName),contactPerson:text(value?.contactPerson),
    email:text(value?.email),phone:text(value?.phone),value:amount,currency:normalizedCurrency,expectedCloseDate:isoDate(value?.expectedCloseDate),
    nextAction:text(value?.nextAction),nextActionDate:isoDate(value?.nextActionDate),notes:text(value?.notes),lostReason:stage==='lost'?text(value?.lostReason):'',
    linkedDocumentIds:uniqueStrings(value?.linkedDocumentIds)
  };
}

export function normalizeOpportunities(value:unknown):OpportunityRecord[]{
  if(!Array.isArray(value))return[];
  const seen=new Set<string>();const result:OpportunityRecord[]=[];
  for(const raw of value){
    const item=normalizeOpportunity(raw);
    if(!item.id||seen.has(item.id))continue;
    seen.add(item.id);result.push(item);
  }
  return result;
}

export function validateOpportunity(opportunity:OpportunityRecord):string[]{
  const errors:string[]=[];
  if(!opportunity.id.trim())errors.push('Opportunity ID is required.');
  if(!opportunity.title.trim())errors.push('Opportunity title is required.');
  if(!opportunity.partyName.trim()&&!opportunity.customerId.trim())errors.push('Lead or customer identity is required.');
  if(!STAGES.has(opportunity.stage))errors.push('Opportunity stage is invalid.');
  if(opportunity.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opportunity.email))errors.push('Opportunity email is invalid.');
  if(opportunity.value&&!isNonNegativeDecimalInput(opportunity.value))errors.push('Opportunity value must be zero or greater.');
  if(opportunity.value&&!opportunity.currency)errors.push('Opportunity currency is required when value is set.');
  if(opportunity.currency&&!/^[A-Z]{3}$/.test(opportunity.currency))errors.push('Opportunity currency must be a 3-letter code.');
  if(opportunity.expectedCloseDate&&!isIsoDate(opportunity.expectedCloseDate))errors.push('Expected close date is invalid.');
  if(opportunity.nextActionDate&&!isIsoDate(opportunity.nextActionDate))errors.push('Next action date is invalid.');
  if(opportunity.stage==='lost'&&!opportunity.lostReason.trim())errors.push('Lost reason is required when an opportunity is lost.');
  return errors;
}

export function assertOpportunity(opportunity:OpportunityRecord):void{
  const errors=validateOpportunity(opportunity);if(errors.length)throw new Error(errors[0]);
}

export function opportunityIsOpen(opportunity:OpportunityRecord):boolean{return opportunity.stage!=='won'&&opportunity.stage!=='lost';}

export function opportunitiesForCustomer(opportunities:OpportunityRecord[],customerId:string):OpportunityRecord[]{
  return opportunities.filter(item=>item.customerId===customerId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}

export function opportunityStageLabel(stage:OpportunityStage,language:'en'|'ar'='en'):string{
  const labels:Record<OpportunityStage,[string,string]>={
    lead:['Lead','عميل محتمل'],contacted:['Contacted','تم التواصل'],'rfq-received':['RFQ Received','تم استلام طلب عرض'],'quote-sent':['Quote Sent','تم إرسال العرض'],
    negotiation:['Negotiation','تفاوض'],won:['Won','ناجحة'],lost:['Lost','خاسرة']
  };
  return labels[stage][language==='ar'?1:0];
}
