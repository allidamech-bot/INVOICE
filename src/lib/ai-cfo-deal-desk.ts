import type { AdvisorDataV2, AdvisorEvidence, AdvisorHealthSignal } from './ai-advisor-v2.js';
import type { AiToolPlan, AiToolResult } from './ai-tool-orchestrator.js';

export type CfoPrioritySeverity='opportunity'|'watch'|'action-needed';
export interface CfoPriority {
  code:string;
  severity:CfoPrioritySeverity;
  area:string;
  observation:string;
  why:string;
  evidence:Array<{id:string;source:string;fact:string;currency:string;amount:string}>;
  recommendedAction:string;
  expectedEffect:string;
}
export interface CfoBrief {
  basis:'deterministic-cfo-brief-v1';
  available:boolean;
  asOf:string;
  status:'Healthy'|'Watch'|'Action Needed';
  priorities:CfoPriority[];
  opportunities:CfoPriority[];
  snapshot:{
    sales:AdvisorDataV2['sales']['monthToDate'];
    receivables:AdvisorDataV2['receivables']['byCurrency'];
    payables:AdvisorDataV2['payables']['byCurrency'];
    treasury:AdvisorDataV2['treasury'];
    expenses:AdvisorDataV2['expenses'];
    inventory:Pick<AdvisorDataV2['inventory'],'totalItems'|'positiveItems'|'zeroItems'|'negativeItems'>;
    pipeline:AdvisorDataV2['pipeline'];
  };
  missing:Array<{area:string;code:string;detail:string}>;
  limitations:string[];
}

export interface DealDeskDecision {
  basis:'deterministic-deal-desk-v1';
  status:'ready-for-review'|'needs-input';
  known:Array<{tool:string;label:string;data:unknown;source:string}>;
  risks:string[];
  missing:string[];
  evidence:Array<{tool:string;source:string;summary:string}>;
  recommendation:string;
  nextAction:string;
}

function clean(value:unknown,max=300):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function lower(value:unknown):string{return clean(value,1200).toLowerCase();}
function evidenceFor(advisor:AdvisorDataV2,signal:AdvisorHealthSignal):AdvisorEvidence[]{const ids=new Set(signal.evidenceIds);return advisor.evidence.filter(row=>ids.has(row.id)).slice(0,6);}
function actionFor(code:string):{action:string;effect:string}{
  const map:Record<string,{action:string;effect:string}>={
    'invalid-accounting-operations':{action:'Review the flagged accounting-integrity exceptions before relying on affected management outputs.',effect:'Restores confidence in deterministic operational-finance reporting.'},
    'negative-inventory':{action:'Review negative-stock items and their source movements before committing new availability.',effect:'Reduces stock-promise and purchasing errors.'},
    'overdue-receivables':{action:'Prioritize the highest overdue customer balances and prepare collection follow-ups.',effect:'Improves collection focus and working-capital visibility.'},
    'overdue-payables':{action:'Review overdue supplier obligations by currency and due date.',effect:'Reduces supplier-service and cash-planning risk.'},
    'unreconciled-treasury':{action:'Reconcile outstanding treasury movements before making cash-position decisions.',effect:'Improves reliability of cash and bank visibility.'},
    'missing-profit-costs':{action:'Verify missing item unit costs and invalid or missing internal expense records before using gross-profit figures for pricing decisions.',effect:'Prevents unsupported gross-profit and margin estimates from driving pricing.'},
    'supplier-cost-alerts':{action:'Review material supplier cost movements against observed supplier alternatives.',effect:'Surfaces sourcing and repricing decisions earlier.'},
    'zero-recorded-stock':{action:'Review zero-stock items against open demand and purchasing plans.',effect:'Highlights replenishment priorities without inventing demand.'}
  };
  return map[code]??{action:'Review the supporting LOUREX evidence and choose the next controlled action.',effect:'Keeps the decision tied to recorded business evidence.'};
}
function priorityFromSignal(advisor:AdvisorDataV2,signal:AdvisorHealthSignal):CfoPriority{
  const rows=evidenceFor(advisor,signal),action=actionFor(signal.code);
  return{code:signal.code,severity:signal.severity,area:signal.area,observation:signal.summary,why:rows.map(row=>row.fact).join(' ').slice(0,700)||'LOUREX deterministic health rules flagged this area.',evidence:rows.map(row=>({id:row.id,source:row.source,fact:row.fact,currency:row.currency,amount:row.amount})),recommendedAction:action.action,expectedEffect:action.effect};
}
function opportunity(code:string,area:string,observation:string,why:string,recommendedAction:string,expectedEffect:string,evidence:AdvisorEvidence[]=[]):CfoPriority{return{code,severity:'opportunity',area,observation,why,evidence:evidence.slice(0,4).map(row=>({id:row.id,source:row.source,fact:row.fact,currency:row.currency,amount:row.amount})),recommendedAction,expectedEffect};}

export function buildCfoBrief(advisor:AdvisorDataV2|null|undefined):CfoBrief|null{
  if(!advisor||advisor.version!==2||advisor.basis!=='deterministic-advisor-data-v2')return null;
  if(!advisor.available)return{basis:'deterministic-cfo-brief-v1',available:false,asOf:advisor.asOf,status:'Healthy',priorities:[],opportunities:[],snapshot:{sales:[],receivables:[],payables:[],treasury:{accounts:[],activityByCurrency:[],unallocatedMovements:0},expenses:{byCurrency:[],count:0},inventory:{totalItems:0,positiveItems:0,zeroItems:0,negativeItems:0},pipeline:{stages:[],openValues:[],wonCount:0,lostCount:0,nextActions:[]}},missing:advisor.missingData.map(row=>({area:row.area,code:row.code,detail:row.detail})),limitations:['business-data-unavailable-in-this-scope']};
  const priorities=advisor.health.signals.map(signal=>priorityFromSignal(advisor,signal)).sort((a,b)=>(a.severity==='action-needed'?0:1)-(b.severity==='action-needed'?0:1)).slice(0,8);
  const opportunities:CfoPriority[]=[];
  const down=advisor.purchasing.costAlerts.filter(row=>row.direction==='down').slice(0,3);for(const row of down)opportunities.push(opportunity(`supplier-cost-down-${row.itemId}`,'purchasing',`${row.itemName} supplier cost decreased in recorded purchasing history.`,`Recorded cost moved from ${row.previousUnitCost} to ${row.currentUnitCost} ${row.currency}; change ${row.changePercent}%.`,'Review the lower observed cost before the next quote or purchase.','May improve sourcing economics if the recorded supplier terms still apply.'));
  if(advisor.pipeline.nextActions.length)opportunities.push(opportunity('pipeline-next-actions','pipeline',`${advisor.pipeline.nextActions.length} sales opportunity action(s) are due for attention.`,'These are recorded pipeline next actions, not model-generated leads.','Work the highest-priority recorded pipeline follow-ups.','Improves sales follow-through without creating speculative revenue.'));
  return{basis:'deterministic-cfo-brief-v1',available:true,asOf:advisor.asOf,status:advisor.health.status,priorities,opportunities:opportunities.slice(0,5),snapshot:{sales:advisor.sales.monthToDate,receivables:advisor.receivables.byCurrency,payables:advisor.payables.byCurrency,treasury:advisor.treasury,expenses:advisor.expenses,inventory:{totalItems:advisor.inventory.totalItems,positiveItems:advisor.inventory.positiveItems,zeroItems:advisor.inventory.zeroItems,negativeItems:advisor.inventory.negativeItems},pipeline:advisor.pipeline},missing:advisor.missingData.map(row=>({area:row.area,code:row.code,detail:row.detail})),limitations:Array.from(new Set([...advisor.limitations,'currencies-remain-separate','no-model-calculated-accounting','gross-profit-is-used-only-when-deterministic-cost-data-is-complete']))};
}

export function isCfoIntent(message:string):boolean{return/(?:\bcfo\b|chief financial|financial review|business review|executive brief|company health|financial health|مستشار مالي|المدير المالي|الوضع المالي|صحة الشركة|راجع الشركة|راجع وضعي المالي|ملخص مالي|تقرير تنفيذي)/i.test(lower(message));}
export function isDealDeskIntent(message:string):boolean{return/(?:deal desk|evaluate (?:this )?deal|deal economics|landed cost.*margin|margin.*landed cost|supplier quote.*selling price|rfq.*supplier|صفقة|قيّم.*الصفقة|قيم.*الصفقة|ربحية.*الصفقة|عرض المورد.*سعر البيع|تكلفة الوصول.*هامش|هامش.*تكلفة الوصول)/i.test(lower(message));}

function labelFor(tool:string):string{const map:Record<string,string>={'landedCost.calculate':'Landed cost','pricing.margin':'Gross margin','pricing.markup':'Markup','pricing.targetPrice':'Target selling price','fx.convertUsingRecordedRate':'Recorded-rate FX','product.getSummary':'Product evidence','product.getCostHistory':'Observed cost history','supplier.getSummary':'Supplier evidence','quotation.prepare':'Quotation preview','search.records':'Search evidence'};return map[tool]??tool;}
function callCurrencies(plan:AiToolPlan):Set<string>{const set=new Set<string>();for(const call of plan.calls){for(const key of ['currency','fromCurrency','toCurrency']){const value=clean(call.args?.[key],8).toUpperCase();if(/^[A-Z]{3}$/.test(value))set.add(value);}}return set;}
export function buildDealDeskDecision(plan:AiToolPlan,results:AiToolResult[]):DealDeskDecision{
  const ok=results.filter(row=>row.ok),failed=results.filter(row=>!row.ok),landed=ok.find(row=>row.tool==='landedCost.calculate'),margin=ok.find(row=>row.tool==='pricing.margin'),target=ok.find(row=>row.tool==='pricing.targetPrice'),fx=ok.find(row=>row.tool==='fx.convertUsingRecordedRate'),quote=ok.find(row=>row.tool==='quotation.prepare');
  const known=ok.filter(row=>['landedCost.calculate','pricing.margin','pricing.markup','pricing.targetPrice','fx.convertUsingRecordedRate','product.getSummary','product.getCostHistory','supplier.getSummary','quotation.prepare','search.records'].includes(row.tool)).slice(0,8).map(row=>({tool:row.tool,label:labelFor(row.tool),data:row.data,source:row.source}));
  const risks:string[]=[];const missing:string[]=[];const currencies=callCurrencies(plan);
  if(failed.length)risks.push(...failed.slice(0,5).map(row=>`${row.tool}: ${clean(row.summary,220)}`));
  if(currencies.size>1&&!fx)risks.push('Multiple currencies are present. LOUREX will not combine them without an explicit recorded-rate FX conversion.');
  if(!landed)missing.push('A deterministic landed-cost result is not available for this deal. Provide quantity, unit cost and any known freight/duty/other costs.');
  if(!margin&&!target)missing.push('A deterministic selling-price decision is not available. Provide an explicit selling price for margin, or a target margin for target-price calculation.');
  if(!ok.some(row=>row.tool==='product.getCostHistory'||row.tool==='supplier.getSummary'||row.tool==='product.getSummary'))missing.push('Historical product/supplier evidence was not included in this evaluation.');
  if(fx){const data=fx.data as any;if(!data?.source||!data?.rateDate)risks.push('FX conversion lacks recorded-rate evidence and must not be relied on.');}
  const ready=Boolean(landed&&(margin||target)&&failed.length===0&&!(currencies.size>1&&!fx));
  const recommendation=ready?'The deterministic deal economics are available for review. Compare the supplier evidence, confirm commercial assumptions, then prepare the quotation only after review.':'Do not price or approve this deal yet. Complete the missing deterministic inputs and resolve the listed risks first.';
  const nextAction=quote?'Review the prepared quotation preview; saving or finalizing still requires the normal LOUREX approval workflow.':ready?'If the commercial terms are acceptable, prepare a quotation preview for explicit review.':'Provide the missing deal inputs and rerun Deal Desk.';
  return{basis:'deterministic-deal-desk-v1',status:ready?'ready-for-review':'needs-input',known,risks,missing,evidence:results.slice(0,10).map(row=>({tool:row.tool,source:row.source,summary:clean(row.summary,240)})),recommendation,nextAction};
}

function json(value:unknown,max=1500):string{try{const text=JSON.stringify(value,null,2);return text.length<=max?text:`${text.slice(0,max)}\n…`;}catch{return clean(value,max);}}
export function formatCfoBrief(brief:CfoBrief,language:'en'|'ar'):string{
  const ar=language==='ar';if(!brief.available)return ar?'الملخص المالي غير متاح في هذا النطاق. بيانات الشركة معزولة عن المساعد الشخصي.':'The CFO brief is unavailable in this scope. Business data is isolated from Personal assistant scope.';
  const lines:string[]=[ar?'CFO Brief':'CFO Brief',ar?`الحالة: ${brief.status} — حتى ${brief.asOf}`:`Status: ${brief.status} — as of ${brief.asOf}`];
  lines.push('',ar?'الأولويات':'Priorities');if(!brief.priorities.length)lines.push(ar?'- لا توجد إشارة مخاطر حتمية نشطة في البيانات الحالية.':'- No deterministic health-risk signal is active in the current data.');for(const row of brief.priorities)lines.push(`- [${row.severity}] ${row.observation}\n  ${ar?'الإجراء':'Action'}: ${row.recommendedAction}\n  ${ar?'الدليل':'Evidence'}: ${row.why}`);
  if(brief.opportunities.length){lines.push('',ar?'الفرص':'Opportunities');for(const row of brief.opportunities)lines.push(`- ${row.observation}\n  ${ar?'الإجراء':'Action'}: ${row.recommendedAction}`);}
  lines.push('',ar?'لقطة الإدارة — العملات منفصلة':'Management snapshot — currencies remain separate',json({sales:brief.snapshot.sales,receivables:brief.snapshot.receivables,payables:brief.snapshot.payables,treasury:brief.snapshot.treasury,expenses:brief.snapshot.expenses,inventory:brief.snapshot.inventory,pipeline:{openValues:brief.snapshot.pipeline.openValues,nextActions:brief.snapshot.pipeline.nextActions}},2200));
  if(brief.missing.length)lines.push('',ar?'بيانات ناقصة':'Missing data',...brief.missing.slice(0,8).map(row=>`- ${row.detail}`));
  lines.push('',ar?'ملاحظة':'Note',ar?'لا يتم جمع العملات ولا اختراع أسعار صرف أو أرباح. الأرقام من محركات LOUREX الحتمية فقط.':'Currencies are not combined and no FX rate or profit is invented. Numeric facts come only from deterministic LOUREX engines.');return lines.join('\n').slice(0,6000);
}
export function formatDealDeskDecision(decision:DealDeskDecision,language:'en'|'ar'):string{
  const ar=language==='ar',lines:string[]=[ar?'Deal Desk — قرار الصفقة':'Deal Desk — Deal Decision',ar?`الحالة: ${decision.status==='ready-for-review'?'جاهزة للمراجعة':'تحتاج بيانات'}`:`Status: ${decision.status}`];
  if(decision.known.length){lines.push('',ar?'المعروف من LOUREX':'Known from LOUREX');for(const row of decision.known)lines.push(`- ${row.label}: ${json(row.data,900)}`);}
  if(decision.risks.length)lines.push('',ar?'المخاطر':'Risks',...decision.risks.map(row=>`- ${row}`));
  if(decision.missing.length)lines.push('',ar?'الناقص':'Missing',...decision.missing.map(row=>`- ${row}`));
  lines.push('',ar?'التوصية':'Recommendation',decision.recommendation,'',ar?'الخطوة التالية':'Next action',decision.nextAction,'',ar?'قاعدة الثقة':'Trust rule',ar?'LOUREX لم يخترع تكلفة أو سعر بيع أو سعر صرف. كل رقم ظاهر ناتج عن أداة حتمية أو سجل LOUREX.':'LOUREX did not invent cost, selling price, or FX. Every displayed number came from a deterministic tool or recorded LOUREX evidence.');return lines.join('\n').slice(0,6000);
}
