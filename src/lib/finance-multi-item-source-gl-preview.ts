import type {LourexDocument} from '../types.js';
import {decimalToScaled} from './money.js';
import {allocateLandedCost,purchaseTotals} from './operations.js';
import {
  projectPostedValuationEvidence,type PostedValuationEvidence
} from './inventory-valuation-evidence.js';
import {inspectIllustrativeInventoryJournals} from './inventory-journal-integrity-preview.js';
import {
  previewFinanceInventoryTrialBalance,
  type FinanceGlControls,type FinanceGlJournal,type FinanceGlLine,type FinanceGlTrialBalancePreview
} from './finance-gl-foundation.js';

/**
 * Finance Alif 22: PURE, read-only, complete-scoped multi-item WAC and
 * purchase-liability reconciliation. Accepts caller-SUPPLIED evidence only.
 * No validated opening, approved cost policy, authenticated source, FX,
 * durable ledger, trusted balance sheet or live financial posting.
 *
 * Deliberately narrower than real accounting: one company, branch, warehouse
 * and currency; every purchase row must be tracked, unique and received once;
 * only ordinary receipt and final-invoice issue movements are accepted.
 */
export type MultiItemStockEvidence =
  Pick<PostedValuationEvidence,'movements'|'purchases'|'documents'|'orderedMovementIds'> & {
    warehouseId:string;
  };
export interface MultiItemPurchaseReconciliation {
  purchaseId:string;
  purchaseNumber:string;
  lineCount:number;
  supplierPayable:string;
  summedValuedReceipts:string;
  exactlyReconciled:true;
}
export interface MultiItemSourceBoundStockAudit {
  receiptCount:number;
  issueCount:number;
  productCount:number;
  purchases:MultiItemPurchaseReconciliation[];
  calculatedGrossInventory:string;
  calculatedSalesCost:string;
  trialBalance:FinanceGlTrialBalancePreview;
  sourceAuthenticated:false;
  allocationPolicyApproved:false;
  postingApproved:false;
  generalLedgerVerified:false;
  productionReady:false;
}
function fail(why:string):never{
  throw new Error('ALIF_22_MULTI_ITEM_GL_NOT_READY: '+why);
}
function equalMoney(a:string,b:string,minor:0|2|3):boolean{
  if(!/^-?\d+\.\d{12}$/.test(b))fail('Invalid canonical source valuation.');
  const scale=10n**BigInt(12-minor);
  const v=decimalToScaled(b,12);
  if(v%scale!==0n)fail('A fractional minor-unit movement needs an approved residual policy.');
  if(typeof a!=='string'||!/^\d+(?:\.\d+)?$/.test(a)
    ||(a.split('.')[1]?.length??0)>minor)return false;
  return decimalToScaled(a,minor)===v/scale;
}
function cents(amount:bigint,digits:number):string{
  const neg=amount<0n,abs=neg?-amount:amount,den=10n**BigInt(digits);
  return (neg?'-':'')+(abs/den).toString()+
    (digits?'.'+(abs%den).toString().padStart(digits,'0'):'');
}
function needed(input:unknown):input is string{
  return typeof input==='string'&&input.length>0&&input.trim()===input;
}
export function inspectMultiItemSourceBoundStockGl(
  controls:FinanceGlControls,
  input:MultiItemStockEvidence,
  journals:readonly FinanceGlJournal[]
):MultiItemSourceBoundStockAudit{
  if(!needed(input.warehouseId)||!needed(controls.workspaceId)
    ||!needed(controls.branchId)||!needed(controls.functionalCurrency)
    ||!Array.isArray(input.movements)||!Array.isArray(input.purchases)
    ||!Array.isArray(input.documents)||!Array.isArray(input.orderedMovementIds)
    ||!Array.isArray(journals)||!input.movements.length||!input.purchases.length
    ||input.movements.length!==input.orderedMovementIds.length
    ||input.movements.length!==journals.length)
    fail('Complete, identified, nonempty scoped purchase, stock and journal history is required.');
  const movements=new Map<string,(typeof input.movements)[number]>();
  const products=new Set<string>();
  for(const movement of input.movements){
    if(!needed(movement.id)||movements.has(movement.id)||!needed(movement.itemId)
      ||movement.workspaceId!==controls.workspaceId
      ||movement.branchId!==controls.branchId
      ||movement.currency!==controls.functionalCurrency
      ||(movement.type!=='purchase'&&movement.type!=='issue'))
      fail('Duplicate, cross-scope or unsupported stock movement.');
    movements.set(movement.id,movement);
    products.add(movement.itemId);
  }
  // Require one-to-one *global* movement and journal order; interleaved items
  // must still be in chronological order before per-item WAC projections.
  const seen=new Set<string>();
  let previousDate='';
  for(let i=0;i<input.orderedMovementIds.length;i++){
    const id=input.orderedMovementIds[i]!,row=movements.get(id),journal=journals[i]!;
    if(seen.has(id)||!row||row.date<previousDate||row.date>controls.asOfDate
      ||journal.sourceMovementId!==id||journal.effectiveDate!==row.date
      ||journal.sourceKind!==(row.type==='purchase'?'purchase-receipt':'sales-stock-issue'))
      fail('Unordered, missing or mismatched stock movement/journal.');
    seen.add(id);previousDate=row.date;
  }
  // For every supplied final invoice, require all its tracked stock lines
  // to appear exactly once; a partial invoice cannot claim a complete GL.
  // All other non-stock invoice components are outside this stock-only bridge.
  const invoiceIds=new Set<string>();
  for(const invoice of input.documents){
    if(!needed(invoice.id)||invoiceIds.has(invoice.id)
      ||invoice.workspaceId!==controls.workspaceId
      ||invoice.branchId!==controls.branchId
      ||invoice.currency!==controls.functionalCurrency)
      fail('Issued invoice source must be unique and in the same scope and functional currency.');
    invoiceIds.add(invoice.id);
    const lines=invoice.items.filter((line:LourexDocument['items'][number])=>line.stockTreatment==='tracked');
    if(!lines.length)fail('Nonstock invoice does not belong in this stock-only source set.');
    const ids=new Set<string>();
    for(const line of lines){
      if(!needed(line.id)||ids.has(line.id)||!needed(line.savedItemId))
        fail('Tracked invoice stock line identity is missing or duplicated.');
      ids.add(line.id);
      const matching=input.movements.filter(row=>
        row.id==='sales-invoice-stock:'+invoice.id+':'+line.id
        &&row.sourceId===invoice.id&&row.itemId===line.savedItemId&&row.type==='issue');
      if(matching.length!==1)
        fail('Complete final invoice stock issue must be represented exactly once.');
    }
  }
  const purchaseMap=new Map<string,(typeof input.purchases)[number]>();
  for(const purchase of input.purchases){
    if(!needed(purchase.id)||purchaseMap.has(purchase.id)||purchase.status!=='posted'
      ||purchase.workspaceId!==controls.workspaceId||purchase.branchId!==controls.branchId
      ||purchase.currency!==controls.functionalCurrency||!purchase.items.length)
      fail('Purchase must be uniquely identified, posted, complete and in the same company/currency.');
    purchaseMap.set(purchase.id,purchase);
    const lines=new Set<string>(),items=new Set<string>();
    let allocated;
    try{allocated=allocateLandedCost(purchase);}
    catch{fail('Cannot independently recompute the source purchase landed allocation.');}
    if(allocated.items.length!==purchase.items.length)
      fail('Missing allocated source lines.');
    for(let i=0;i<purchase.items.length;i++){
      const line=purchase.items[i]!,recomputed=allocated.items[i]!;
      if(!needed(line.id)||lines.has(line.id)||!needed(line.savedItemId)
        ||items.has(line.savedItemId)||!products.has(line.savedItemId)
        ||!needed(line.landedUnitCost))
        fail('All purchased rows must be unique tracked stock lines with full receipts.');
      lines.add(line.id);items.add(line.savedItemId);
      // Recalculate the app's EXISTING landed-cost allocation from base
      // unit cost plus expenses. This is algorithm parity, not independent
      // accountant approval of the method or of expense capitalization.
      try{
        if(decimalToScaled(line.landedUnitCost,12)!==
          decimalToScaled(recomputed.landedUnitCost,12))
          fail('Posted landed distribution differs from independently recomputed purchase policy.');
      }catch(error){
        if(error instanceof Error&&error.message.startsWith('ALIF_22_MULTI_ITEM_GL_NOT_READY'))throw error;
        fail('Posted landed source cost has invalid precision.');
      }
    }
  }
  const byProduct=new Map<string,ReturnType<typeof projectPostedValuationEvidence>>();
  let inventory=0n,cogs=0n,issues=0,receipts=0;
  const moneyScale=10n**BigInt(12-controls.currencyMinorDigits);
  const receiptsByPurchase=new Map<string,{count:number;value:bigint;products:Set<string>}>();
  for(const itemId of products){
    const evidence:PostedValuationEvidence={
      scope:{workspaceId:controls.workspaceId,branchId:controls.branchId,
        warehouseId:input.warehouseId,itemId,
        functionalCurrency:controls.functionalCurrency},
      orderedMovementIds:input.orderedMovementIds.filter(id=>movements.get(id)?.itemId===itemId),
      movements:input.movements,purchases:input.purchases,documents:input.documents
    };
    const projection=projectPostedValuationEvidence(evidence);
    byProduct.set(itemId,projection);
    if(!projection.steps.length
      ||projection.steps.some(row=>row.kind!=='receipt'&&row.kind!=='issue'))
      fail('Unvalued opening, adjustment, return or unsupported stock sources.');
    const itemJournals=projection.steps.map(step=>{
      const journal=journals.find(entry=>entry.sourceMovementId===step.id);
      if(!journal)fail('A valued movement has no journal.');
      return journal;
    });
    const audited=inspectIllustrativeInventoryJournals(evidence,itemJournals.map(j=>({
      id:j.id,sourceMovementId:j.sourceMovementId,date:j.effectiveDate,
      workspaceId:j.workspaceId,branchId:j.branchId,currency:j.currency,lines:j.lines
    })),{
      inventoryAccountId:controls.inventoryAssetAccountId,
      salesCogsAccountId:controls.salesCogsAccountId,
      currencyMinorDigits:controls.currencyMinorDigits
    });
    inventory+=decimalToScaled(audited.illustrativeNetInventory,controls.currencyMinorDigits);
    cogs+=decimalToScaled(audited.illustrativeTotalSalesCOGS,controls.currencyMinorDigits);
    for(const step of projection.steps){
      const movement=movements.get(step.id)!;
      const journal=journals.find(entry=>entry.sourceMovementId===step.id)!;
      const amount=step.kind==='receipt'?step.valueChange:step.costOfGoodsSold;
      if(journal.lines.length!==2||journal.lines.some((line:FinanceGlLine)=>
        !equalMoney(line.amount,amount,controls.currencyMinorDigits)))
        fail('Journal value disagrees with original independently valued movement.');
      if(step.kind==='receipt'){
        receipts++;
        const purchase=purchaseMap.get(movement.sourceId);
        if(!purchase)fail('Purchase receipt has no posted purchase in complete source set.');
        const bucket=receiptsByPurchase.get(purchase.id)??{count:0,value:0n,products:new Set<string>()};
        if(bucket.products.has(itemId))fail('One purchase item must not be received twice.');
        bucket.products.add(itemId);bucket.count++;
        bucket.value+=decimalToScaled(step.valueChange,12);
        receiptsByPurchase.set(purchase.id,bucket);
      }else issues++;
    }
  }
  const purchases:MultiItemPurchaseReconciliation[]=[];
  for(const purchase of input.purchases){
    const bucket=receiptsByPurchase.get(purchase.id);
    if(!bucket||bucket.count!==purchase.items.length)
      fail('Missing or partial purchase receipts; payable cannot be booked from incomplete stock lines.');
    let original:bigint;
    try{original=decimalToScaled(purchaseTotals(purchase).landedTotal,2);}
    catch{fail('Purchase base costs or landed expense totals are invalid.');}
    const scaled=original*10_000_000_000n;
    if(bucket.value!==scaled)
      fail('Combined stock receipt carrying values differ from original full posted purchase payable.');
    purchases.push({
      purchaseId:purchase.id,purchaseNumber:purchase.number,
      lineCount:purchase.items.length,supplierPayable:cents(original,2),
      summedValuedReceipts:cents(bucket.value/moneyScale,controls.currencyMinorDigits),
      exactlyReconciled:true
    });
  }
  const trialBalance=previewFinanceInventoryTrialBalance(controls,journals);
  if(trialBalance.sourceJournalCount!==receipts+issues
    ||decimalToScaled(trialBalance.grossInventoryAsset,controls.currencyMinorDigits)!==inventory
    ||decimalToScaled(trialBalance.salesCogsExpense,controls.currencyMinorDigits)!==cogs
    ||trialBalance.inventoryAllowance!==cents(0n,controls.currencyMinorDigits)
    ||decimalToScaled(trialBalance.totalDebitBalances,controls.currencyMinorDigits)!==
      decimalToScaled(trialBalance.totalCreditBalances,controls.currencyMinorDigits))
    fail('Aggregated stock valuations and candidate trial balance disagree.');
  return{
    receiptCount:receipts,issueCount:issues,productCount:byProduct.size,
    purchases,calculatedGrossInventory:cents(inventory,controls.currencyMinorDigits),
    calculatedSalesCost:cents(cogs,controls.currencyMinorDigits),
    trialBalance,sourceAuthenticated:false,allocationPolicyApproved:false,
    postingApproved:false,generalLedgerVerified:false,productionReady:false
  };
}
