import type { VaultPayload } from '../types.js';
import type { AiBusinessContext } from './ai-business.js';
import type { AiFinanceContext } from './ai-finance.js';
import { validateFxRate } from './fx-rates.js';
import { todayIso } from './id.js';
import { decimalToScaled } from './money.js';
import { inventoryBalances, spendByCurrency } from './operations.js';
import { supplierPayablesByCurrency } from './payables.js';
import { buildSalesPipeline } from './sales-pipeline.js';
import { treasuryAccountBalance, treasuryProjection, treasuryTotals } from './treasury-ledger.js';

export type AdvisorHealthStatus='Healthy'|'Watch'|'Action Needed';
export type AdvisorEvidenceSeverity='info'|'watch'|'action-needed';
export type AdvisorArea='sales'|'receivables'|'payables'|'treasury'|'expenses'|'inventory'|'purchasing'|'fx'|'pipeline'|'company-health';

export interface AdvisorEvidence {
  id:string;
  area:AdvisorArea;
  source:string;
  fact:string;
  severity:AdvisorEvidenceSeverity;
  currency:string;
  amount:string;
  count:number;
}
export interface AdvisorMissingData {area:AdvisorArea;code:string;detail:string;}
export interface AdvisorHealthSignal {code:string;area:AdvisorArea;severity:'watch'|'action-needed';summary:string;evidenceIds:string[];}
export interface AdvisorResponseContract {
  sections:readonly ['Summary','KPI','Table','Risk','Missing','Recommendation','Evidence','Actions'];
  currencyPolicy:'keep-currencies-separate-unless-a-deterministic-fx-result-is-provided';
  arithmeticPolicy:'use-provided-deterministic-values-do-not-recalculate-accounting';
  missingDataPolicy:'state-missing-data-never-invent';
  actionPolicy:'preview-only-user-approval-required';
}
export interface AdvisorDataV2 {
  version:2;
  basis:'deterministic-advisor-data-v2';
  available:boolean;
  asOf:string;
  responseContract:AdvisorResponseContract;
  sales:{today:AiFinanceContext['today'];monthToDate:AiFinanceContext['monthToDate'];comparison:AiFinanceContext['comparisons']['monthToDateVsPreviousMonth'];};
  receivables:{byCurrency:AiFinanceContext['receivables'];highestOverdueByCurrency:AiFinanceContext['highestOverdueByCurrency'];};
  payables:{byCurrency:ReturnType<typeof supplierPayablesByCurrency>;};
  treasury:{accounts:Array<{id:string;label:string;kind:'cash'|'bank';currency:string;balance:string;active:boolean}>;activityByCurrency:Array<{currency:string;inflow:string;outflow:string;net:string;internalTransfers:string;reconciled:number;unreconciled:number}>;unallocatedMovements:number;};
  expenses:{byCurrency:Array<{currency:string;expenses:string}>;count:number;};
  inventory:{totalItems:number;positiveItems:number;zeroItems:number;negativeItems:number;rows:Array<{itemId:string;name:string;sku:string;quantity:string;state:'positive'|'zero'|'negative'}>;};
  purchasing:{byCurrency:Array<{currency:string;purchases:string;expenses:string;total:string}>;postedPurchases:number;draftPurchases:number;reversedPurchases:number;costAlerts:AiBusinessContext['suppliers']['costAlerts'];supplierComparisons:AiBusinessContext['suppliers']['itemComparisons'];};
  fx:{policy:'recorded-rates-only-no-automatic-conversion';latestRates:Array<{id:string;date:string;fromCurrency:string;toCurrency:string;rate:string;sourceLabel:string}>;recordedPairs:string[];};
  pipeline:{stages:ReturnType<typeof buildSalesPipeline>['stages'];openValues:ReturnType<typeof buildSalesPipeline>['openValues'];wonCount:number;lostCount:number;nextActions:Array<{id:string;title:string;stage:string;expectedCloseDate:string;nextAction:string;currency:string;amount:string}>;};
  health:{status:AdvisorHealthStatus;score:null;signals:AdvisorHealthSignal[];};
  evidence:AdvisorEvidence[];
  missingData:AdvisorMissingData[];
  limitations:string[];
}

const RESPONSE_CONTRACT:AdvisorResponseContract=Object.freeze({
  sections:['Summary','KPI','Table','Risk','Missing','Recommendation','Evidence','Actions'] as const,
  currencyPolicy:'keep-currencies-separate-unless-a-deterministic-fx-result-is-provided',
  arithmeticPolicy:'use-provided-deterministic-values-do-not-recalculate-accounting',
  missingDataPolicy:'state-missing-data-never-invent',
  actionPolicy:'preview-only-user-approval-required'
});

function amountPositive(value:string):boolean{try{return decimalToScaled(value||'0',2)>0n;}catch{return false;}}
function quantityState(value:string):'positive'|'zero'|'negative'{try{const scaled=decimalToScaled(value||'0',4);return scaled<0n?'negative':scaled>0n?'positive':'zero';}catch{return'zero';}}
function itemName(item:VaultPayload['savedItems'][number]):string{return(item.descriptionEn||item.descriptionAr||item.sku||'Unnamed item').trim();}
function evidence(id:string,area:AdvisorArea,source:string,fact:string,severity:AdvisorEvidenceSeverity='info',currency='',amount='',count=0):AdvisorEvidence{return{id,area,source,fact,severity,currency,amount,count};}
function redactedAdvisor(asOf:string):AdvisorDataV2{return{
  version:2,basis:'deterministic-advisor-data-v2',available:false,asOf,responseContract:RESPONSE_CONTRACT,
  sales:{today:[],monthToDate:[],comparison:[]},receivables:{byCurrency:[],highestOverdueByCurrency:[]},payables:{byCurrency:[]},
  treasury:{accounts:[],activityByCurrency:[],unallocatedMovements:0},expenses:{byCurrency:[],count:0},inventory:{totalItems:0,positiveItems:0,zeroItems:0,negativeItems:0,rows:[]},
  purchasing:{byCurrency:[],postedPurchases:0,draftPurchases:0,reversedPurchases:0,costAlerts:[],supplierComparisons:[]},
  fx:{policy:'recorded-rates-only-no-automatic-conversion',latestRates:[],recordedPairs:[]},pipeline:{stages:[],openValues:[],wonCount:0,lostCount:0,nextActions:[]},
  health:{status:'Healthy',score:null,signals:[]},evidence:[],missingData:[{area:'company-health',code:'business-context-unavailable',detail:'Business data is intentionally unavailable in Personal assistant scope.'}],
  limitations:['personal-scope-excludes-business-data','no-cross-currency-total-without-deterministic-fx-result','health-is-qualitative-not-a-numeric-score']
};}

export function buildAdvisorDataV2(vault:VaultPayload,finance:AiFinanceContext,business:AiBusinessContext,scope:'business'|'personal'|'temporary'='business'):AdvisorDataV2{
  const asOf=finance.asOf||business.asOf||todayIso();
  if(scope==='personal')return redactedAdvisor(asOf);

  const payables=supplierPayablesByCurrency(vault.purchases,vault.supplierPayments,asOf);
  const treasuryRows=treasuryProjection(vault.payments,vault.supplierPayments,vault.expenses,vault.treasuryEntries,vault.treasuryReconciliations,vault.company.defaultCurrency||'USD');
  const treasuryCurrencies=Array.from(new Set([...vault.treasuryAccounts.map(row=>row.currency),...treasuryRows.map(row=>row.currency)].filter(Boolean))).sort();
  const treasuryAccounts=vault.treasuryAccounts.slice(0,24).map(account=>({id:account.id,label:account.label,kind:account.kind,currency:account.currency,balance:treasuryAccountBalance(account.id,vault.treasuryEntries),active:account.active}));
  const activityByCurrency=treasuryCurrencies.slice(0,12).map(currency=>({currency,...treasuryTotals(treasuryRows,currency)}));
  const unallocatedMovements=treasuryRows.filter(row=>row.direction!=='internal'&&!row.fromAccountId&&!row.toAccountId).length;

  const spend=spendByCurrency(vault.purchases,vault.expenses).slice(0,12);
  const expensesByCurrency=spend.filter(row=>amountPositive(row.expenses)).map(row=>({currency:row.currency,expenses:row.expenses}));
  const balances=inventoryBalances(vault.savedItems,vault.inventoryMovements);
  const inventoryRows=balances.map(row=>({itemId:row.item.id,name:itemName(row.item),sku:row.item.sku??'',quantity:row.quantity,state:quantityState(row.quantity)})).sort((a,b)=>{
    const rank={negative:2,zero:1,positive:0} as const;return rank[b.state]-rank[a.state]||a.name.localeCompare(b.name);
  });
  const negativeItems=inventoryRows.filter(row=>row.state==='negative').length,zeroItems=inventoryRows.filter(row=>row.state==='zero').length,positiveItems=inventoryRows.filter(row=>row.state==='positive').length;

  const validRates=vault.fxRates.filter(rate=>validateFxRate(rate).length===0&&rate.date<=asOf).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
  const seenPairs=new Set<string>();
  const latestRates=[] as AdvisorDataV2['fx']['latestRates'];
  for(const rate of validRates){const pair=`${rate.fromCurrency.trim().toUpperCase()}/${rate.toCurrency.trim().toUpperCase()}`;if(seenPairs.has(pair))continue;seenPairs.add(pair);latestRates.push({id:rate.id,date:rate.date,fromCurrency:rate.fromCurrency.trim().toUpperCase(),toCurrency:rate.toCurrency.trim().toUpperCase(),rate:rate.rate,sourceLabel:rate.sourceLabel});if(latestRates.length>=20)break;}

  const pipeline=buildSalesPipeline(vault);
  const nextActions=pipeline.nextActions.map(row=>({id:row.id,title:row.title,stage:row.stage,expectedCloseDate:row.expectedCloseDate,nextAction:row.nextAction,currency:row.currency,amount:row.amount}));
  const evidenceRows:AdvisorEvidence[]=[];
  for(const row of finance.monthToDate.slice(0,8))evidenceRows.push(evidence(`sales-mtd-${row.currency}`,'sales','ai-finance.monthToDate',`Month-to-date net sales are ${row.netSales} ${row.currency}; collected ${row.collected} ${row.currency}.`,'info',row.currency,row.netSales,row.issuedInvoices));
  for(const row of finance.receivables.filter(row=>amountPositive(row.outstanding)).slice(0,8))evidenceRows.push(evidence(`receivable-${row.currency}`,'receivables','receivables.customerReceivables',`Open receivables are ${row.outstanding} ${row.currency}; overdue ${row.overdue} ${row.currency}.`,amountPositive(row.overdue)?'watch':'info',row.currency,row.overdue,row.overdueInvoices));
  for(const row of payables.filter(row=>amountPositive(row.remaining)).slice(0,8))evidenceRows.push(evidence(`payable-${row.currency}`,'payables','payables.supplierPayablesByCurrency',`Open supplier payables are ${row.remaining} ${row.currency}; overdue ${row.overdue} ${row.currency}.`,amountPositive(row.overdue)?'watch':'info',row.currency,row.overdue,row.overduePurchases));
  for(const row of treasuryAccounts.filter(row=>row.active).slice(0,10))evidenceRows.push(evidence(`treasury-${row.id}`,'treasury','treasury.treasuryAccountBalance',`${row.label} ledger balance is ${row.balance} ${row.currency}.`,'info',row.currency,row.balance,1));
  if(negativeItems)evidenceRows.push(evidence('inventory-negative','inventory','operations.inventoryBalances',`${negativeItems} inventory item(s) have a negative recorded quantity.`,'action-needed','',String(negativeItems),negativeItems));
  if(zeroItems)evidenceRows.push(evidence('inventory-zero','inventory','operations.inventoryBalances',`${zeroItems} inventory item(s) have zero recorded quantity.`,'watch','',String(zeroItems),zeroItems));
  if(business.daily.invalidOperations)evidenceRows.push(evidence('operations-invalid','company-health','operations.operationsIntegritySummary',`${business.daily.invalidOperations} accounting operation(s) failed deterministic integrity checks.`,'action-needed','',String(business.daily.invalidOperations),business.daily.invalidOperations));
  if(business.daily.missingCostItems)evidenceRows.push(evidence('missing-costs','company-health','reports.profitability',`${business.daily.missingCostItems} item line(s) are missing cost data in today’s deterministic brief.`,'watch','',String(business.daily.missingCostItems),business.daily.missingCostItems));
  const unreconciled=activityByCurrency.reduce((sum,row)=>sum+row.unreconciled,0);if(unreconciled)evidenceRows.push(evidence('treasury-unreconciled','treasury','treasury.treasuryProjection',`${unreconciled} treasury movement(s) are unreconciled.`,'watch','',String(unreconciled),unreconciled));
  if(business.suppliers.costAlerts.length)evidenceRows.push(evidence('purchase-cost-alerts','purchasing','ai-business.suppliers.costAlerts',`${business.suppliers.costAlerts.length} deterministic supplier cost alert(s) are active.`,'watch','',String(business.suppliers.costAlerts.length),business.suppliers.costAlerts.length));

  const signals:AdvisorHealthSignal[]=[];
  if(business.daily.invalidOperations)signals.push({code:'invalid-accounting-operations',area:'company-health',severity:'action-needed',summary:'Accounting integrity exceptions require review.',evidenceIds:['operations-invalid']});
  if(negativeItems)signals.push({code:'negative-inventory',area:'inventory',severity:'action-needed',summary:'Negative recorded stock requires review.',evidenceIds:['inventory-negative']});
  const overdueReceivableEvidence=finance.receivables.filter(row=>amountPositive(row.overdue)).map(row=>`receivable-${row.currency}`);if(overdueReceivableEvidence.length)signals.push({code:'overdue-receivables',area:'receivables',severity:'watch',summary:'Overdue customer receivables are present.',evidenceIds:overdueReceivableEvidence});
  const overduePayableEvidence=payables.filter(row=>amountPositive(row.overdue)).map(row=>`payable-${row.currency}`);if(overduePayableEvidence.length)signals.push({code:'overdue-payables',area:'payables',severity:'watch',summary:'Overdue supplier payables are present.',evidenceIds:overduePayableEvidence});
  if(unreconciled)signals.push({code:'unreconciled-treasury',area:'treasury',severity:'watch',summary:'Treasury contains unreconciled movements.',evidenceIds:['treasury-unreconciled']});
  if(business.daily.missingCostItems)signals.push({code:'missing-profit-costs',area:'company-health',severity:'watch',summary:'Some profitability outputs are incomplete because cost data is missing.',evidenceIds:['missing-costs']});
  if(business.suppliers.costAlerts.length)signals.push({code:'supplier-cost-alerts',area:'purchasing',severity:'watch',summary:'Supplier cost changes crossed deterministic alert rules.',evidenceIds:['purchase-cost-alerts']});
  if(zeroItems)signals.push({code:'zero-recorded-stock',area:'inventory',severity:'watch',summary:'Some items have zero recorded stock.',evidenceIds:['inventory-zero']});
  const status:AdvisorHealthStatus=signals.some(row=>row.severity==='action-needed')?'Action Needed':signals.length?'Watch':'Healthy';

  const currencies=Array.from(new Set([
    ...finance.monthToDate.map(row=>row.currency),...finance.receivables.map(row=>row.currency),...payables.map(row=>row.currency),...spend.map(row=>row.currency),...treasuryCurrencies
  ].filter(Boolean))).sort();
  const missingData:AdvisorMissingData[]=[];
  if(business.daily.missingCostItems)missingData.push({area:'company-health',code:'missing-cost-data',detail:'Profitability is incomplete where item cost data is missing.'});
  if(!vault.treasuryAccounts.length&&(vault.payments.length||vault.supplierPayments.length||vault.expenses.length||vault.treasuryEntries.length))missingData.push({area:'treasury',code:'treasury-accounts-not-configured',detail:'Financial activity exists but no treasury cash/bank account is configured.'});
  if(currencies.length>1&&!latestRates.length)missingData.push({area:'fx',code:'no-recorded-fx-rates',detail:'Multiple currencies are present but no valid recorded FX rate is available. LOUREX will keep currencies separate.'});
  if(unallocatedMovements)missingData.push({area:'treasury',code:'unallocated-treasury-movements',detail:`${unallocatedMovements} cash movement(s) are not allocated to a treasury account.`});

  return{
    version:2,basis:'deterministic-advisor-data-v2',available:true,asOf,responseContract:RESPONSE_CONTRACT,
    sales:{today:finance.today.slice(0,12),monthToDate:finance.monthToDate.slice(0,12),comparison:finance.comparisons.monthToDateVsPreviousMonth.slice(0,12)},
    receivables:{byCurrency:finance.receivables.slice(0,12),highestOverdueByCurrency:finance.highestOverdueByCurrency.slice(0,12)},
    payables:{byCurrency:payables.slice(0,12)},treasury:{accounts:treasuryAccounts,activityByCurrency,unallocatedMovements},expenses:{byCurrency:expensesByCurrency,count:vault.expenses.length},
    inventory:{totalItems:inventoryRows.length,positiveItems,zeroItems,negativeItems,rows:inventoryRows.slice(0,24)},
    purchasing:{byCurrency:spend,postedPurchases:vault.purchases.filter(row=>row.status==='posted').length,draftPurchases:vault.purchases.filter(row=>row.status==='draft').length,reversedPurchases:vault.purchases.filter(row=>row.status==='reversed').length,costAlerts:business.suppliers.costAlerts.slice(0,12),supplierComparisons:business.suppliers.itemComparisons.slice(0,12)},
    fx:{policy:'recorded-rates-only-no-automatic-conversion',latestRates,recordedPairs:[...seenPairs].slice(0,20)},
    pipeline:{stages:pipeline.stages,openValues:pipeline.openValues,nextActions,wonCount:pipeline.wonCount,lostCount:pipeline.lostCount},
    health:{status,score:null,signals},evidence:evidenceRows.slice(0,32),missingData,
    limitations:['currencies-remain-separate-by-default','no-cross-currency-total-without-deterministic-fx-result','recorded-fx-rates-are-evidence-not-model-arithmetic-authority','health-is-qualitative-not-a-numeric-score','inventory-has-no-invented-reorder-threshold','pipeline-values-remain-separated-by-currency','ai-explains-deterministic-results-and-does-not-recalculate-accounting']
  };
}
