const fail=()=>{throw Error('FISCAL_COST_REVIEW_REQUIRED');};
const exact=(v,d)=>{if(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v)||v.length>40)fail();const [a,b='']=v.split('.');if(b.length>d)fail();return BigInt(a+b.padEnd(d,'0'));};
const cents=v=>{if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v))fail();return exact(v,2);};
const fmt=n=>(n<0n?'-':'')+String((n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
// Stock quantity has four decimals and the purchase engine retains twelve cost decimals.
export function stockCostCents(quantity,unitCost){const q=exact(quantity,4);if(q<=0n)fail();return (q*exact(unitCost,12)+50000000000000n)/100000000000000n;}
// A fiscal credit/debit changes the supplier liability, not the original commercial invoice.
// No physical return or cash refund is implied by the tax document alone.
export function supplierAdjustmentProjection(original,adjustments,paid){
 const gross=cents(original.amount.gross),settled=cents(paid);let credits=0n,debits=0n,netCredits=0n,vatCredits=0n,deductibleCredits=0n;const seen=new Set();
 if(original.amount.kind!=='invoice'||original.amount.treatment!=='domestic')fail();
 for(const row of adjustments){
  if(!row.key||seen.has(row.key)||row.source!=='purchase'||row.sourceId!==original.sourceId||row.originalId!==original.sourceId||row.accountUid!==original.accountUid||row.workspaceId!==original.workspaceId||row.egsId!==original.egsId||row.environment!==original.environment||row.issuerVat!==original.issuerVat||row.counterpartyVat!==original.counterpartyVat||row.sourceFingerprint!==original.sourceFingerprint||row.currency!==original.currency||row.category!==original.category||row.rate!==original.rate||row.taxDate<original.taxDate||row.amount.treatment!=='domestic')fail();
  seen.add(row.key);const a=row.amount,n=cents(a.net),v=cents(a.vat),d=cents(a.deductibleVat),g=cents(a.gross);
  if(n+v!==g||g<=0n||d>v)fail();
  if(a.kind==='credit-note'){credits+=g;netCredits+=n;vatCredits+=v;deductibleCredits+=d;}
  else if(a.kind==='debit-note')debits+=g;else fail();
 }
 if(netCredits>cents(original.amount.net)||vatCredits>cents(original.amount.vat)||deductibleCredits>cents(original.amount.deductibleVat)||vatCredits-deductibleCredits>cents(original.amount.vat)-cents(original.amount.deductibleVat)||credits>gross)fail();
 const liability=gross-credits+debits;
 return {creditAdjustments:fmt(credits),debitAdjustments:fmt(debits),adjustedPayable:fmt(liability),adjustedOutstanding:fmt(liability-settled),adjustmentDifference:fmt(debits-credits),supplierCredit:fmt(settled>liability?settled-liability:0n)};
}
