import type { VaultPayload } from '../types.js';
import type { KernelScope } from './ai-conversation-kernel.js';
import { graphScope } from './ai-business-memory-graph.js';
import { strictAiActor } from './ai-foundation-approval.js';
import { buildAiBusinessContext } from './ai-business.js';
import { buildAiFinanceContext } from './ai-finance.js';
import { buildAdvisorDataV2 } from './ai-advisor-v2.js';
import { treasuryProjection, treasuryAccountBalanceScaled, assertTreasuryAccount, assertTreasuryEntry } from './treasury-ledger.js';
import { decimalToScaled } from './money.js';
import { decimal, moneyString } from './ai-commercial-intelligence.js';
import { isIsoDate } from './id.js';
export interface PriorityInsight {id:string;severity:'info'|'watch'|'action-needed';label:string;source:string;date:string;currency:string;amount:string;}
export interface ReconciliationReview {asOf:string;unreconciled:{id:string;label:string;date:string;currency:string;amount:string;source:string}[];unallocated:number;duplicateSourceLinks:string[];missingDocumentPayments:string[];priorities:PriorityInsight[];}
const AREAS:Record<string,string[]>={owner:['*'],admin:['*'],finance:['*'],sales:['sales','receivables','pipeline'],purchasing:['purchasing','payables','inventory'],viewer:[]};
export function financialReviewAllowed(vault:VaultPayload):boolean{return ['owner','admin','finance'].includes(strictAiActor(vault).role);}
export function reliabilityReview(vault:VaultPayload,scope:KernelScope,asOf:string):ReconciliationReview {
 if(!isIsoDate(asOf))throw new Error('Choose a valid review date.');const v=graphScope(vault,scope),role=strictAiActor(vault).role;
 const business=buildAiBusinessContext(v,asOf),finance=buildAiFinanceContext({documents:v.documents,payments:v.payments,customers:v.customers,activeDocument:null},'',asOf),advisor=buildAdvisorDataV2(v,finance,business,scope.scope);
 const allowed=(area:string)=>AREAS[role]!.includes('*')||AREAS[role]!.includes(area);
 const priorities:PriorityInsight[]=advisor.evidence.filter(e=>e.severity!=='info'&&allowed(e.area)).map(e=>({id:e.id,severity:e.severity,label:e.fact,source:e.source,date:asOf,currency:e.currency,amount:e.amount}));
 for(const m of advisor.missingData.filter(m=>allowed(m.area)))priorities.push({id:'missing:'+m.code,severity:'watch',label:m.detail,source:'Advisor missing-data check',date:asOf,currency:'',amount:''});
 priorities.sort((a,b)=>({"action-needed":0,watch:1,info:2}[a.severity]-{"action-needed":0,watch:1,info:2}[b.severity])||a.id.localeCompare(b.id));
 if(!financialReviewAllowed(vault))return{asOf,unreconciled:[],unallocated:0,duplicateSourceLinks:[],missingDocumentPayments:[],priorities};
 const rows=treasuryProjection(v.payments,v.supplierPayments,v.expenses,v.treasuryEntries,v.treasuryReconciliations,v.company.defaultCurrency,asOf);
 const links=new Map<string,number>();for(const entry of v.treasuryEntries)if(entry.date<=asOf&&(!entry.createdAt||entry.createdAt.slice(0,10)<=asOf)&&(!entry.voidedAt||entry.voidedAt.slice(0,10)>asOf)&&['customer-payment','supplier-payment'].includes(entry.sourceType)){const key=entry.sourceType+':'+entry.sourceId;links.set(key,(links.get(key)||0)+1);}
 const documents=new Set(v.documents.map(d=>d.id));
 return{asOf,unreconciled:rows.filter(r=>!r.reconciled&&r.direction!=='internal').map(r=>({id:r.key,label:r.label,date:r.date,currency:r.currency,amount:r.amount,source:r.source})),unallocated:rows.filter(r=>r.direction!=='internal'&&!r.fromAccountId&&!r.toAccountId).length,duplicateSourceLinks:[...links].filter(([,n])=>n>1).map(([id])=>id),missingDocumentPayments:v.payments.filter(p=>p.date<=asOf&&(!p.createdAt||p.createdAt.slice(0,10)<=asOf)&&p.invoiceId&&!documents.has(p.invoiceId)).map(p=>p.id),priorities};
}
export interface CashAssumption {id:string;label:string;currency:string;amount:string;direction:'in'|'out';date:string;}
export interface CashSimulation {asOf:string;until:string;assumptions:CashAssumption[];results:{currency:string;recordedBalance:string|null;assumedIn:string;assumedOut:string;projected:string|null;sourceAccountIds:string[]}[];status:'scenario-not-posted';}
/** Recorded account balances are not sales, collections or a forecast. Explicit flows are assumptions. */
export function simulateCash(vault:VaultPayload,scope:KernelScope,asOf:string,until:string,input:CashAssumption[]):CashSimulation {
 const v=graphScope(vault,scope);if(!financialReviewAllowed(vault))throw new Error('Your role cannot prepare a cash scenario.');if(!isIsoDate(asOf)||!isIsoDate(until)||until<asOf)throw new Error('Choose valid baseline and horizon dates.');if(input.length>50)throw new Error('Scenario limit is 50 explicit flows; none were dropped.');
 const ids=new Set<string>(),assumptions=input.map(f=>{if(!f.id||ids.has(f.id)||!f.label.trim()||f.label.length>160||! /^[A-Z]{3}$/.test(f.currency)||!['in','out'].includes(f.direction)||!isIsoDate(f.date)||f.date<=asOf||f.date>until)throw new Error('Flow needs a unique ID, currency, direction and date after baseline within horizon.');ids.add(f.id);return{id:f.id,label:f.label.trim(),currency:f.currency,amount:decimal(f.amount),direction:f.direction,date:f.date};});
 const accountIds=new Set<string>();for(const account of v.treasuryAccounts){if(accountIds.has(account.id))throw new Error('Duplicate cash account identity. Review recorded data.');accountIds.add(account.id);assertTreasuryAccount(account);}
 const entryIds=new Set<string>(),sourceIds=new Set<string>();for(const entry of v.treasuryEntries){if(entry.date>asOf||(entry.createdAt&&entry.createdAt.slice(0,10)>asOf)||(entry.voidedAt&&entry.voidedAt.slice(0,10)<=asOf))continue;if(entryIds.has(entry.id))throw new Error('Duplicate treasury entry identity.');entryIds.add(entry.id);assertTreasuryEntry(entry,v.treasuryAccounts);if(entry.sourceType!=='manual'){const source=entry.sourceType+':'+entry.sourceId;if(sourceIds.has(source))throw new Error('Duplicate treasury source link. Review recorded data.');sourceIds.add(source);}}
 const accounts=v.treasuryAccounts.filter(a=>a.active&&(!a.createdAt||a.createdAt.slice(0,10)<=asOf)),currencies=[...new Set([...accounts.map(a=>a.currency),...assumptions.map(a=>a.currency)])].sort();
 const results=currencies.map(currency=>{const selected=accounts.filter(a=>a.currency===currency);let baseline=0n,inflow=0n,outflow=0n;for(const a of selected)baseline+=treasuryAccountBalanceScaled(a.id,v.treasuryEntries,asOf);for(const f of assumptions.filter(f=>f.currency===currency)){if(f.direction==='in')inflow+=decimalToScaled(f.amount,2);else outflow+=decimalToScaled(f.amount,2);}return{currency,recordedBalance:selected.length?moneyString(baseline):null,assumedIn:moneyString(inflow),assumedOut:moneyString(outflow),projected:selected.length?moneyString(baseline+inflow-outflow):null,sourceAccountIds:selected.map(a=>a.id)};});
 return{asOf,until,assumptions,results,status:'scenario-not-posted'};
}
