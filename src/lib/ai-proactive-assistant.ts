import type { VaultPayload } from '../types.js';
import type { AssistantTaskRecord } from '../storage/assistant-task-store.js';
import type { ProactiveCategory, ProactiveState } from '../storage/assistant-proactive-store.js';
import { proactiveSignalVisible } from '../storage/assistant-proactive-store.js';
import { whatMattersToday } from './daily-command-center.js';
import { buildInventoryPlanning } from './inventory-planning.js';
import { commercialTrackingFromEvents, effectiveCommercialStatus, isQuoteLikeDocument, linkedInvoiceForCommercialDocument } from './commercial-flow.js';
import { customerReceivables } from './receivables.js';
import { supplierPayablesByCurrency } from './payables.js';
import { treasuryProjection } from './treasury-ledger.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';
import { todayIso } from './id.js';

export type ProactiveKind='collection'|'quote-expiry'|'stale-quotation'|'purchase-draft'|'pricing'|'cost-change'|'product-data'|'inventory'|'credit-limit'|'supplier-obligation'|'treasury'|'expense-trend'|'conditional-task';
export interface ProactiveSignal{
  key:string;kind:ProactiveKind;category:ProactiveCategory;
  title:string;titleAr:string;detail:string;detailAr:string;
  actionLabel:string;actionLabelAr:string;searchQuery:string;
  evidence:string[];
}
export interface MorningBrief{
  asOf:string;
  business:ProactiveSignal[];
  personalTasks:Array<{id:string;title:string;dueAt:string;recurrence:string}>;
  topRisk:ProactiveSignal|null;
  topOpportunity:ProactiveSignal|null;
  firstAction:ProactiveSignal|null;
}
export interface ConditionalTaskSignal{taskId:string;triggered:boolean;reason:string;searchQuery:string;}

const CATEGORY_WEIGHT:Record<ProactiveCategory,number>={urgent:4,attention:3,opportunity:2,info:1};
function safe(value:unknown,max=220):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function scaled(value:string,scale=2):bigint{try{return decimalToScaled(value||'0',scale);}catch{return 0n;}}
function dateMs(date:string):number{const ms=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date)?`${date}T00:00:00.000Z`:date);return Number.isFinite(ms)?ms:0;}
function daysBetween(from:string,to:string):number{return Math.floor((dateMs(to)-dateMs(from))/86_400_000);}
function priorityCategory(priority:'critical'|'high'|'medium',title:string):ProactiveCategory{if(/^cost down/i.test(title))return'opportunity';return priority==='critical'?'urgent':priority==='high'?'attention':'info';}
function dedupe(rows:ProactiveSignal[]):ProactiveSignal[]{const seen=new Set<string>();return rows.filter(row=>{if(seen.has(row.key))return false;seen.add(row.key);return true;});}
function localizeBase(kind:string,title:string,detail:string):{titleAr:string;detailAr:string}{
  if(kind==='collection')return{titleAr:`تحصيل يحتاج متابعة — ${title.split('—').slice(1).join('—').trim()}`,detailAr:`ذمم متأخرة مسجلة تحتاج مراجعة. ${detail}`};
  if(kind==='quote-expiry')return{titleAr:`عرض سعر يقترب من الانتهاء — ${title.split('—').slice(1).join('—').trim()}`,detailAr:`راجع صلاحية العرض ومتابعة العميل. ${detail}`};
  if(kind==='purchase-draft')return{titleAr:`مسودة شراء تحتاج مراجعة — ${title.split('—').slice(1).join('—').trim()}`,detailAr:`مسودة شراء مفتوحة لم تُرحّل بعد. ${detail}`};
  if(kind==='pricing')return{titleAr:`تنبيه تسعير — ${title.split('—').slice(1).join('—').trim()}`,detailAr:`راجع السعر مقابل التكلفة والسياسة. ${detail}`};
  if(kind==='cost-change')return{titleAr:`تغير في تكلفة المورد — ${title.split('—').slice(1).join('—').trim()}`,detailAr:`تغير حتمي مسجل في تكلفة الشراء. ${detail}`};
  if(kind==='product-data')return{titleAr:`بيانات منتج ناقصة — ${title.split('—').slice(1).join('—').trim()}`,detailAr:`أكمل البيانات الناقصة قبل الاعتماد عليها. ${detail}`};
  return{titleAr:title,detailAr:detail};
}
function expensePeriod(date:string):string{return /^\d{4}-\d{2}/.test(date)?date.slice(0,7):'';}
function previousMonth(asOf:string):string{const date=new Date(`${asOf.slice(0,7)}-01T00:00:00.000Z`);date.setUTCMonth(date.getUTCMonth()-1);return date.toISOString().slice(0,7);}
function expenseTotals(vault:VaultPayload,period:string):Map<string,bigint>{const map=new Map<string,bigint>();for(const row of vault.expenses){if(expensePeriod(row.date)!==period)continue;map.set(row.currency,(map.get(row.currency)??0n)+scaled(row.amount));}return map;}

export function buildProactiveSignals(vault:VaultPayload,asOf=todayIso()):ProactiveSignal[]{
  const rows:ProactiveSignal[]=[];
  for(const alert of whatMattersToday(vault,8,asOf)){
    const localized=localizeBase(alert.kind,alert.title,alert.detail);
    rows.push({key:alert.key,kind:alert.kind as ProactiveKind,category:priorityCategory(alert.priority,alert.title),title:alert.title,titleAr:localized.titleAr,detail:alert.detail,detailAr:localized.detailAr,actionLabel:alert.actionLabel,actionLabelAr:'فتح ومراجعة',searchQuery:alert.searchQuery,evidence:[`daily-command:${alert.key}`]});
  }

  // Stale issued quotations: only active quote-like documents with no conversion and no terminal acceptance/rejection.
  for(const doc of vault.documents){
    if(!isQuoteLikeDocument(doc)||doc.status!=='final'||doc.lifecycleStatus==='voided'||doc.issueDate>asOf||linkedInvoiceForCommercialDocument(doc,vault.documents))continue;
    const tracking=commercialTrackingFromEvents(doc.id,vault.documentEvents),status=effectiveCommercialStatus(doc,vault.documents,tracking,asOf).status;
    if(['accepted','rejected','converted','expired'].includes(status))continue;
    const age=daysBetween(doc.issueDate,asOf);if(age<7)continue;
    const name=(doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'Customer').trim();
    rows.push({key:`stale-quotation:${doc.id}`,kind:'stale-quotation',category:age>=14?'attention':'info',title:`Quotation waiting for follow-up — ${doc.number}`,titleAr:`عرض سعر ينتظر المتابعة — ${doc.number}`,detail:`${name}; ${age} day(s) since issue; commercial status ${status}.`,detailAr:`${name}؛ مرّ ${age} يومًا منذ الإصدار؛ الحالة التجارية ${status}.`,actionLabel:'Review quotation',actionLabelAr:'مراجعة عرض السعر',searchQuery:doc.number,evidence:[`document:${doc.id}`,`commercial-status:${status}`]});
  }

  // Inventory only when deterministic planning is configured; never invent thresholds.
  const planning=buildInventoryPlanning(vault,asOf,90);
  for(const row of planning.rows){
    if(!row.policy)continue;const label=(row.item.descriptionEn||row.item.descriptionAr||row.item.sku||'Product').trim();
    if(row.status==='critical'||row.status==='reorder')rows.push({key:`inventory-plan:${row.item.id}:${row.status}`,kind:'inventory',category:row.status==='critical'?'urgent':'attention',title:`Inventory ${row.status==='critical'?'critical':'reorder'} — ${label}`,titleAr:`${row.status==='critical'?'مخزون حرج':'إعادة طلب'} — ${label}`,detail:`On hand ${row.onHand}; configured reorder trigger ${row.reorderTrigger}; suggested order ${row.suggestedOrder}.`,detailAr:`المتوفر ${row.onHand}؛ حد إعادة الطلب المحدد ${row.reorderTrigger}؛ الطلب المقترح ${row.suggestedOrder}.`,actionLabel:'Review inventory planning',actionLabelAr:'مراجعة تخطيط المخزون',searchQuery:label,evidence:[`inventory-plan:${row.item.id}`]});
    const target=row.policy.targetStock;if(target&&scaled(row.onHand,4)>scaled(target,4)*2n&&scaled(target,4)>0n)rows.push({key:`inventory-excess:${row.item.id}`,kind:'inventory',category:'opportunity',title:`Stock above configured target — ${label}`,titleAr:`المخزون أعلى من الهدف المحدد — ${label}`,detail:`On hand ${row.onHand}; configured target ${target}. Review whether excess stock is tying up working capital.`,detailAr:`المتوفر ${row.onHand}؛ الهدف المحدد ${target}. راجع ما إذا كان فائض المخزون يحجز رأس مال عامل.`,actionLabel:'Review inventory planning',actionLabelAr:'مراجعة تخطيط المخزون',searchQuery:label,evidence:[`inventory-plan:${row.item.id}`]});
  }

  // Credit exposure only when customer has an explicit limit in the same currency.
  for(const account of customerReceivables(vault.customers,vault.documents,vault.payments,asOf)){
    const customer=account.customer;if(!customer||!customer.creditLimit||!isNonNegativeDecimalInput(customer.creditLimit))continue;const currency=(customer.creditCurrency||customer.preferredCurrency||'').trim().toUpperCase();if(!currency)continue;const exposure=account.currencies.find(row=>row.currency.toUpperCase()===currency);if(!exposure)continue;const limit=scaled(customer.creditLimit),outstanding=scaled(exposure.outstanding);if(limit<=0n||outstanding*100n<limit*80n)continue;const pct=Number((outstanding*10000n)/limit)/100,name=(customer.companyNameEn||customer.companyNameAr||customer.contactPerson||'Customer').trim();rows.push({key:`credit-limit:${customer.id}:${currency}`,kind:'credit-limit',category:outstanding>=limit?'urgent':'attention',title:`Customer credit exposure — ${name}`,titleAr:`تعرض ائتماني للعميل — ${name}`,detail:`Outstanding ${exposure.outstanding} ${currency}; configured limit ${customer.creditLimit} ${currency} (${pct.toFixed(1)}%).`,detailAr:`المستحق ${exposure.outstanding} ${currency}؛ الحد الائتماني المحدد ${customer.creditLimit} ${currency} (${pct.toFixed(1)}%).`,actionLabel:'Review customer',actionLabelAr:'مراجعة العميل',searchQuery:name,evidence:[`receivables:${customer.id}:${currency}`,`credit-limit:${customer.id}`]});}

  // Supplier obligations remain separated by currency.
  for(const row of supplierPayablesByCurrency(vault.purchases,vault.supplierPayments,asOf)){
    if(scaled(row.overdue)>0n)rows.push({key:`supplier-payables:${row.currency}`,kind:'supplier-obligation',category:'attention',title:`Overdue supplier obligations — ${row.currency}`,titleAr:`التزامات موردين متأخرة — ${row.currency}`,detail:`Remaining ${row.remaining} ${row.currency}; overdue ${row.overdue} ${row.currency}; ${row.overduePurchases} overdue purchase(s).`,detailAr:`المتبقي ${row.remaining} ${row.currency}؛ المتأخر ${row.overdue} ${row.currency}؛ ${row.overduePurchases} عملية شراء متأخرة.`,actionLabel:'Review purchasing',actionLabelAr:'مراجعة المشتريات',searchQuery:row.currency,evidence:[`payables:${row.currency}`]});
  }

  const treasury=treasuryProjection(vault.payments,vault.supplierPayments,vault.expenses,vault.treasuryEntries,vault.treasuryReconciliations,vault.company.defaultCurrency||'USD',asOf).filter(row=>row.reconciled!==true&&row.direction!=='internal');
  if(treasury.length)rows.push({key:'treasury:unreconciled',kind:'treasury',category:treasury.length>=5?'attention':'info',title:'Treasury movements need reconciliation',titleAr:'حركات خزينة تحتاج مطابقة',detail:`${treasury.length} recorded cash/bank movement(s) remain unreconciled.`,detailAr:`يوجد ${treasury.length} حركة نقدية/بنكية مسجلة غير مطابقة.`,actionLabel:'Review treasury',actionLabelAr:'مراجعة الخزينة',searchQuery:'treasury',evidence:[`treasury-unreconciled:${treasury.length}`]});

  // Expense anomaly = current MTD recorded spend materially above the previous complete month by currency.
  const currentPeriod=asOf.slice(0,7),previous=previousMonth(asOf),currentExpenses=expenseTotals(vault,currentPeriod),previousExpenses=expenseTotals(vault,previous);for(const [currency,current] of currentExpenses){const prior=previousExpenses.get(currency)??0n;if(prior<=0n||current*100n<prior*130n)continue;const pct=Number(((current-prior)*10000n)/prior)/100;rows.push({key:`expense-trend:${currentPeriod}:${currency}`,kind:'expense-trend',category:pct>=75?'attention':'info',title:`Expenses above previous month — ${currency}`,titleAr:`المصروفات أعلى من الشهر السابق — ${currency}`,detail:`Recorded ${currentPeriod} expenses are ${(Number(current)/100).toFixed(2)} ${currency}, ${pct.toFixed(1)}% above ${previous}.`,detailAr:`مصروفات ${currentPeriod} المسجلة ${(Number(current)/100).toFixed(2)} ${currency}، أعلى بنسبة ${pct.toFixed(1)}% من ${previous}.`,actionLabel:'Review finance',actionLabelAr:'مراجعة المالية',searchQuery:'expenses',evidence:[`expenses:${currentPeriod}:${currency}`,`expenses:${previous}:${currency}`]});}

  return dedupe(rows).sort((a,b)=>CATEGORY_WEIGHT[b.category]-CATEGORY_WEIGHT[a.category]||a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title)).slice(0,30);
}

export function visibleProactiveSignals(vault:VaultPayload,state:ProactiveState,asOf=todayIso(),limit=8):ProactiveSignal[]{return buildProactiveSignals(vault,asOf).filter(row=>proactiveSignalVisible(state,row)).slice(0,Math.max(1,Math.min(20,limit)));}

export function evaluateConditionalTask(vault:VaultPayload,task:AssistantTaskRecord,asOf=todayIso()):ConditionalTaskSignal{
  if(task.status!=='open'||task.conditionType==='none')return{taskId:task.id,triggered:false,reason:'No active condition.',searchQuery:''};
  if(task.dueAt&&Date.parse(task.dueAt)>Date.parse(`${asOf}T23:59:59.999Z`))return{taskId:task.id,triggered:false,reason:'Condition date has not arrived.',searchQuery:''};
  if(task.conditionType==='document-not-converted'){
    const id=task.relatedEntityId||task.conditionValue,doc=vault.documents.find(row=>row.id===id);if(!doc||!isQuoteLikeDocument(doc))return{taskId:task.id,triggered:false,reason:'Quotation not found.',searchQuery:''};const converted=Boolean(linkedInvoiceForCommercialDocument(doc,vault.documents));return{taskId:task.id,triggered:!converted,reason:converted?'Quotation is already converted.':'Quotation is still not converted to an invoice.',searchQuery:doc.number};
  }
  if(task.conditionType==='customer-unpaid'){
    const customerId=task.relatedEntityId||task.conditionValue,account=customerReceivables(vault.customers,vault.documents,vault.payments,asOf).find(row=>row.customerId===customerId);const outstanding=account?.currencies.some(row=>scaled(row.outstanding)>0n)??false;const name=(account?.customer?.companyNameEn||account?.customer?.companyNameAr||account?.customer?.contactPerson||'').trim();return{taskId:task.id,triggered:outstanding,reason:outstanding?'Customer still has an outstanding recorded balance.':'No outstanding recorded balance remains.',searchQuery:name};
  }
  if(task.conditionType==='stock-below'){
    const itemId=task.relatedEntityId,threshold=task.conditionValue;if(!itemId||!isNonNegativeDecimalInput(threshold))return{taskId:task.id,triggered:false,reason:'Stock threshold is not configured.',searchQuery:''};const plan=buildInventoryPlanning(vault,asOf,90).rows.find(row=>row.item.id===itemId);if(!plan)return{taskId:task.id,triggered:false,reason:'Product not found.',searchQuery:''};const triggered=plan.onHandScaled<scaled(threshold,4),label=(plan.item.descriptionEn||plan.item.descriptionAr||plan.item.sku||'').trim();return{taskId:task.id,triggered,reason:triggered?`Recorded stock ${plan.onHand} is below ${threshold}.`:`Recorded stock ${plan.onHand} is not below ${threshold}.`,searchQuery:label};
  }
  return{taskId:task.id,triggered:false,reason:'Unsupported condition.',searchQuery:''};
}

export function conditionalTaskSignals(vault:VaultPayload,tasks:AssistantTaskRecord[],asOf=todayIso()):ProactiveSignal[]{const rows:ProactiveSignal[]=[];for(const task of tasks){const evaluated=evaluateConditionalTask(vault,task,asOf);if(!evaluated.triggered)continue;rows.push({key:`conditional-task:${task.id}`,kind:'conditional-task',category:'attention',title:`Follow-up condition met — ${task.title}`,titleAr:`تحقق شرط المتابعة — ${task.title}`,detail:evaluated.reason,detailAr:evaluated.reason,actionLabel:'Open related record',actionLabelAr:'فتح السجل المرتبط',searchQuery:evaluated.searchQuery,evidence:[`assistant-task:${task.id}`]});}return rows;}

export function buildMorningBrief(vault:VaultPayload,state:ProactiveState,personalTasks:AssistantTaskRecord[]=[],asOf=todayIso()):MorningBrief{
  const business=visibleProactiveSignals(vault,state,asOf,8),personal=personalTasks.filter(row=>row.scope==='personal'&&row.status==='open').filter(row=>!row.dueAt||Date.parse(row.dueAt)<=Date.parse(`${asOf}T23:59:59.999Z`)).slice(0,5).map(row=>({id:row.id,title:row.title,dueAt:row.dueAt,recurrence:row.recurrence}));
  return{asOf,business,personalTasks:personal,topRisk:business.find(row=>row.category==='urgent'||row.category==='attention')??null,topOpportunity:business.find(row=>row.category==='opportunity')??null,firstAction:business.find(row=>row.category==='urgent')??business.find(row=>row.category==='attention')??business[0]??null};
}
