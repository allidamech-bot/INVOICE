import {decimalToScaled} from './money.js';
import {projectPostedValuationEvidence,type PostedValuationEvidence} from './inventory-valuation-evidence.js';
import {inspectIllustrativeInventoryJournals} from './inventory-journal-integrity-preview.js';
import {
  previewFinanceInventoryTrialBalance,
  type FinanceGlControls,type FinanceGlJournal,
  type FinanceGlTrialBalancePreview
} from './finance-gl-foundation.js';

/**
 * Finance Alif 22 — independent SOURCE-BOUND, read-only GL rehearsal.
 * This is restricted to simple single-line, same-currency, zero-extra-cost
 * receipts and ordinary sales issues. No journal/actual GL/period writes.
 *
 * IMPORTANT: It cannot authenticate invoices, receipt costs, company
 * functional currency, immutable ledger history or owner approval.
 */
export interface FinanceSourceBoundStockAudit {
  sourceMovementCount:number;
  sourceMatchedWithinSyntheticEvidence:true;
  calculatedGrossInventory:string;
  calculatedSalesCost:string;
  trialBalance:FinanceGlTrialBalancePreview;
  sourceAuthenticated:false;
  postingApproved:false;
  generalLedgerVerified:false;
  productionReady:false;
}
function deny(message:string):never{
  throw new Error('ALIF_22_SOURCE_BOUND_GL_NOT_READY: '+message);
}
function matchingMoney(actual:string,expected:string,minorDigits:number):boolean{
  const factor=10n**BigInt(12-minorDigits);
  if(!/^-?\d+\.\d{12}$/.test(expected))deny('Source valuation has no canonical twelve-decimal amount.');
  const scaled=decimalToScaled(expected,12);
  if(scaled%factor!==0n)deny('Unapproved fractional minor-unit cost needs a separate residual policy.');
  if(typeof actual!=='string'||!/^\d+(?:\.\d+)?$/.test(actual)
    ||(actual.split('.')[1]?.length??0)>minorDigits)return false;
  return decimalToScaled(actual,minorDigits)===scaled/factor;
}
/**
 * Accept ONLY a complete per-item company/branch/warehouse movement stream
 * already validated against domain source records. Every proposed GL entry
 * must match its source in the exact immutable movement order.
 *
 * NRV, refunds, returns, transfers, stock counts, allocations and FX
 * are intentionally out of scope. They cannot be represented as ordinary
 * supplier payable / inventory receipts by changing only the GL account.
 */
export function inspectSourceBoundStockGl(
  controls:FinanceGlControls,
  evidence:PostedValuationEvidence,
  journals:readonly FinanceGlJournal[]
):FinanceSourceBoundStockAudit{
  const scope=evidence.scope;
  if(scope.workspaceId!==controls.workspaceId||scope.branchId!==controls.branchId
    ||scope.functionalCurrency!==controls.functionalCurrency)
    deny('Valuation scope and asserted functional currency must exactly match the GL.');
  const projection=projectPostedValuationEvidence(evidence);
  if(projection.steps.length===0||projection.steps.length!==journals.length
    ||evidence.orderedMovementIds.length!==journals.length)
    deny('Every sourced movement needs one journal; empty or partial streams are not evidence.');
  if(projection.steps.some(step=>step.kind!=='receipt'&&step.kind!=='issue'))
    deny('Opening, return, adjustment and other unsupported stock events require separate policy.');
  const purchaseById=new Map(evidence.purchases.map(p=>[p.id,p]));
  const movements=new Map(evidence.movements.map(m=>[m.id,m]));
  for(let i=0;i<projection.steps.length;i++){
    const step=projection.steps[i]!,journal=journals[i]!,movement=movements.get(step.id);
    if(!movement||journal.sourceMovementId!==step.id
      ||evidence.orderedMovementIds[i]!==step.id||journal.effectiveDate!==movement.date
      ||journal.sourceKind!==(step.kind==='receipt'?'purchase-receipt':'sales-stock-issue'))
      deny('GL source kind, exact stock movement order and transaction date must match.');
    if(movement.currency!==controls.functionalCurrency)
      deny('Different currency source needs a separately approved AP/FX posting policy.');
    if(step.kind==='receipt'){
      const purchase=purchaseById.get(movement.sourceId);
      if(!purchase||purchase.items.length!==1
        ||!['freight','duty','otherCosts'].every(field=>{
          const value=purchase[field as 'freight'|'duty'|'otherCosts'];
          try{return decimalToScaled(value,12)===0n;}catch{return false;}
        }))
        deny('Receipt AP counterpart requires a single-line, zero-extra-cost source; allocations need separate policy.');
    }else{
      const invoice=evidence.documents.find(d=>d.id===movement.sourceId);
      if(!invoice||invoice.currency!==controls.functionalCurrency)
        deny('Issued invoice currency must match the asserted functional currency.');
    }
    const expected=step.kind==='receipt'?step.valueChange:step.costOfGoodsSold;
    if(journal.lines.length!==2||journal.lines.some(line=>!matchingMoney(line.amount,expected,controls.currencyMinorDigits)))
      deny('Journal amount differs from the independently recomputed original movement cost.');
  }
  const sourceAudit=inspectIllustrativeInventoryJournals(evidence,
    journals.map(j=>({
      id:j.id,sourceMovementId:j.sourceMovementId,date:j.effectiveDate,
      workspaceId:j.workspaceId,branchId:j.branchId,currency:j.currency,lines:j.lines
    })),{
      inventoryAccountId:controls.inventoryAssetAccountId,
      salesCogsAccountId:controls.salesCogsAccountId,
      currencyMinorDigits:controls.currencyMinorDigits
    });
  const trialBalance=previewFinanceInventoryTrialBalance(controls,journals);
  if(trialBalance.sourceJournalCount!==sourceAudit.checkedEntries
    ||trialBalance.grossInventoryAsset!==sourceAudit.illustrativeNetInventory
    ||trialBalance.salesCogsExpense!==sourceAudit.illustrativeTotalSalesCOGS
    ||trialBalance.inventoryAllowance!=='0'+(controls.currencyMinorDigits?
       '.'+'0'.repeat(controls.currencyMinorDigits):''))
    deny('Synthesized trial balance does not reconcile to original valued movements.');
  return{
    sourceMovementCount:sourceAudit.checkedEntries,
    sourceMatchedWithinSyntheticEvidence:true,
    calculatedGrossInventory:sourceAudit.illustrativeNetInventory,
    calculatedSalesCost:sourceAudit.illustrativeTotalSalesCOGS,
    trialBalance,
    sourceAuthenticated:false,postingApproved:false,
    generalLedgerVerified:false,productionReady:false
  };
}
