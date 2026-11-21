import {createHash} from 'node:crypto';

/**
 * ALIF 22 — UNWIRED, synthetic Node-only server-transaction contract.
 *
 * No handler calls this function. No Firebase transaction is performed.
 * This is not an authenticated posting, owner approval, or signed evidence.
 * The future server adapter must independently load the owner identity,
 * active period control, source documents, and source version within an
 * atomic Firestore transaction; none may originate from client claims.
 */
const fail=code=>{const error=new Error('ALIF_22_GL_CONTRACT_'+code);error.code=code;throw error;};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const nonempty=x=>typeof x==='string'&&x.length>0&&x===x.trim();
const validDate=x=>{
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const date=new Date(x+'T00:00:00.000Z');
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===x;
};

export function fingerprintSyntheticFinanceSources(sources){
  // A digest authenticates neither the snapshot provider nor its completeness.
  return digest(sources);
}
/** Demo-only canonical identifier: one immutable candidate ledger per exact
 * company + branch pair. The hash avoids concatenation ambiguities and
 * prevents clients from selecting a second ledger with a freeform path key.
 * This does not authenticate company membership.
 */
export function syntheticFinanceGlScopeKey(workspaceId,branchId){
  if(!nonempty(workspaceId)||!nonempty(branchId))
    fail('INVALID_SCOPE_ID');
  return 'scope-'+digest([workspaceId,branchId]).slice(0,48);
}
/** Pin caller-asserted accounting policy/COA and currency for the entire
 * synthetic generation, independently of stock document content.
 * A hash by itself is not approval or evidence from a real issuer.
 */
export function fingerprintSyntheticFinanceControls(controls){
  if(!controls||typeof controls!=='object'||Array.isArray(controls))
    fail('INVALID_CONTROLS');
  return digest(controls);
}
/**
 * Revalidate stored candidate journals AND operation receipts, even on a
 * read-only idempotent replay. A matching op hash alone is insufficient.
 * No issuer authentication or production journal authority is implied.
 */
function assertHistoricCandidateIntegrity(state,controls){
  const journalMap=new Map(),sourceIds=new Set(),receiptIds=new Set();
  for(const journal of state.journals){
    if(!journal||!nonempty(journal.id)||journalMap.has(journal.id)
      ||!nonempty(journal.sourceMovementId)||!nonempty(journal.sourceKind)
      ||!validDate(journal.effectiveDate)
      ||journal.workspaceId!==state.workspaceId
      ||journal.branchId!==state.branchId
      ||journal.currency!==controls.functionalCurrency)
      fail('HISTORIC_JOURNAL_CORRUPT');
    if(sourceIds.has(journal.sourceMovementId))
      fail('HISTORIC_JOURNAL_CORRUPT');
    sourceIds.add(journal.sourceMovementId);
    journalMap.set(journal.id,journal);
  }
  const claimedIds=new Set(),receiptVersions=new Set();
  for(const receipt of state.receipts){
    if(!receipt||!nonempty(receipt.opId)||receiptIds.has(receipt.opId)
      ||!(/^[a-f0-9]{64}$/.test(receipt.fingerprint||''))
      ||!Number.isSafeInteger(receipt.ledgerVersion)
      ||receipt.ledgerVersion<1||receipt.ledgerVersion>state.ledgerVersion
      ||receiptVersions.has(receipt.ledgerVersion)
      ||receipt.generation!==state.periodGeneration
      ||receipt.sourceSha256!==state.sourceSha256
      ||receipt.controlsSha256!==state.controlsSha256
      ||!Array.isArray(receipt.journalIds)||receipt.journalIds.length===0
      ||receipt.journalIds.length>100
      ||!(/^(?:0|[1-9]\d*)\.\d{2}$/.test(receipt.trialDebit||''))
      ||receipt.trialDebit!==receipt.trialCredit)
      fail('HISTORIC_RECEIPT_CORRUPT');
    receiptIds.add(receipt.opId);
    receiptVersions.add(receipt.ledgerVersion);
    for(const id of receipt.journalIds){
      if(!nonempty(id)||!journalMap.has(id)||claimedIds.has(id))
        fail('HISTORIC_RECEIPT_CORRUPT');
      claimedIds.add(id);
    }
  }
  if(claimedIds.size!==journalMap.size)
    fail('HISTORIC_RECEIPT_CORRUPT');
}
function verifiedSyntheticHistory(controls,sourceEvidence,history,verifySourceBoundGl){
  const proof=verifySourceBoundGl(controls,sourceEvidence,history);
  if(proof?.sourceMatchedWithinSyntheticEvidence!==true
    ||proof.sourceMovementCount!==history.length
    ||proof.trialBalance?.sourceJournalCount!==history.length
    ||proof.trialBalance?.totalDebitBalances!==proof.trialBalance?.totalCreditBalances
    ||proof.productionReady!==false||proof.trialBalance?.productionReady!==false)
    fail('SOURCE_AUDIT_INCOMPLETE');
  return proof;
}

export function prototypeFinanceGlAtomicAppend(
  {state,identity,command,sourceEvidence,controls,verifySourceBoundGl}
){
  if(!state||!identity||!command||!controls||!sourceEvidence||
    typeof verifySourceBoundGl!=='function')fail('INVALID_ENVELOPE');
  if(!state.authorityPresent||!nonempty(state.ownerUid)
    ||!Number.isSafeInteger(state.periodGeneration)||state.periodGeneration<1
    ||!Number.isSafeInteger(state.ledgerVersion)||state.ledgerVersion<0
    ||!nonempty(state.workspaceId)||!nonempty(state.branchId)
    ||!nonempty(state.sourceSha256)
    ||!(/^[a-f0-9]{64}$/.test(state.controlsSha256||''))
    ||!Array.isArray(state.journals)
    ||!Array.isArray(state.receipts))
    fail('AUTHORITY_MISSING');
  if(identity.role!=='owner'||identity.uid!==state.ownerUid)fail('OWNER_REQUIRED');
  if(typeof command.opId!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(command.opId)
    ||!Number.isSafeInteger(command.expectedLedgerVersion)
    ||!Number.isSafeInteger(command.expectedPeriodGeneration)
    ||!nonempty(command.expectedSourceSha256)
    ||!Array.isArray(command.append)||command.append.length===0
    ||command.append.length>100)
    fail('INVALID_COMMAND');
  if(state.workspaceId!==controls.workspaceId||state.branchId!==controls.branchId
    ||state.workspaceId!==command.workspaceId||state.branchId!==command.branchId)
    fail('WRONG_SCOPE');
  if(state.sourceSha256!==fingerprintSyntheticFinanceSources(sourceEvidence)
    ||command.expectedSourceSha256!==state.sourceSha256)
    fail('SOURCE_VERSION_MISMATCH');
  if(state.controlsSha256!==fingerprintSyntheticFinanceControls(controls))
    fail('CONTROLS_VERSION_MISMATCH');

  if(state.closedThrough!==null && state.closedThrough!==undefined
    &&!validDate(state.closedThrough))fail('PERIOD_CONTROL_INVALID');

  // Read-only replay MUST NOT accept a mutated ledger or copied receipt.
  assertHistoricCandidateIntegrity(state,controls);
  const fingerprint=digest(command);
  const prior=state.receipts.filter(x=>x.opId===command.opId);
  if(prior.length>1)fail('CORRUPT_RECEIPTS');
  if(prior.length===1){
    const receipt=prior[0];
    if(receipt.fingerprint!==fingerprint)fail('OPERATION_REUSED');
    const ids=command.append.map(x=>x?.id);
    if(ids.some(id=>!nonempty(id))||ids.length!==receipt.journalIds.length
      ||ids.some((id,i)=>id!==receipt.journalIds[i]))
      fail('HISTORIC_RECEIPT_CORRUPT');
    for(const proposal of command.append){
      const stored=state.journals.find(x=>x.id===proposal.id);
      if(!stored||digest(stored)!==digest(proposal))
        fail('HISTORIC_JOURNAL_CHANGED');
    }
    // Even if the ledger and its separate journal documents are BOTH
    // modified, the complete historic valuation must still match sources.
    const proof=verifiedSyntheticHistory(
      controls,sourceEvidence,state.journals,verifySourceBoundGl);
    if(receipt.ledgerVersion===state.ledgerVersion
      &&(receipt.trialDebit!==proof.trialBalance.totalDebitBalances
        ||receipt.trialCredit!==proof.trialBalance.totalCreditBalances))
      fail('HISTORIC_RECEIPT_CORRUPT');
    return{state,receipt:structuredClone(receipt),replayed:true,
      trustedPostingCommitted:false,productionReady:false};
  }

  if(command.expectedLedgerVersion!==state.ledgerVersion
    ||command.expectedPeriodGeneration!==state.periodGeneration)
    fail('REVISION_CONFLICT');

  if(state.closedThrough!==null && state.closedThrough!==undefined
    &&!validDate(state.closedThrough))fail('PERIOD_CONTROL_INVALID');
  const seenId=new Set(state.journals.map(j=>j.id));
  const seenSource=new Set(state.journals.map(j=>j.sourceMovementId));
  for(const row of command.append){
    if(!row||!nonempty(row.id)||!nonempty(row.sourceMovementId)
      ||seenId.has(row.id)||seenSource.has(row.sourceMovementId))
      fail('DUPLICATE_OR_MISSING_SOURCE');
    seenId.add(row.id);seenSource.add(row.sourceMovementId);
    if(!validDate(row.effectiveDate)
      ||state.closedThrough&&row.effectiveDate<=state.closedThrough)
      fail('CLOSED_OR_INVALID_PERIOD');
    if(row.workspaceId!==state.workspaceId||row.branchId!==state.branchId
      ||row.currency!==controls.functionalCurrency)
      fail('WRONG_SOURCE_SCOPE');
  }
  const fullHistory=[...state.journals,...command.append];
  // The caller-supplied function is for emulator/simulation only. Production
  // MUST bind this to the real server-owned stored evidence and vetted code.
  const proof=verifiedSyntheticHistory(controls,sourceEvidence,fullHistory,verifySourceBoundGl);
  const nextVersion=state.ledgerVersion+1;
  if(!Number.isSafeInteger(nextVersion))fail('REVISION_OVERFLOW');
  const receipt={
    opId:command.opId,fingerprint,ledgerVersion:nextVersion,
    generation:state.periodGeneration,sourceSha256:state.sourceSha256,
    controlsSha256:state.controlsSha256,journalIds:command.append.map(j=>j.id),
    trialDebit:proof.trialBalance.totalDebitBalances,
    trialCredit:proof.trialBalance.totalCreditBalances
  };
  // Immutable candidate only. This is NOT a write, CAS, Firestore transaction,
  // real permission check, or any kind of persistence.
  return{
    state:{
      ...structuredClone(state),ledgerVersion:nextVersion,
      journals:structuredClone(fullHistory),
      receipts:[...structuredClone(state.receipts),receipt]
    },
    receipt:structuredClone(receipt),replayed:false,
    trustedPostingCommitted:false,productionReady:false
  };
}


/** Reconcile a reviewed LEGACY gross-cost basis against the already posted
 * fiscal purchase model. This is a comparison of two accounting bases, NOT
 * a second input-VAT journal, GL posting, or approved chart of accounts.
 * The fiscal service must authenticate and replay the purchase and allocation
 * evidence before calling this pure contract. */
export function previewFiscalCostReclassification({scope,purchase,original,plan,effectiveDate}){
 const need=ok=>{if(!ok)fail('FISCAL_COST_BRIDGE_INVALID');};
 const money=v=>{need(typeof v==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
 const fmt=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
 need(scope?.environment==='simulation'&&nonempty(scope.accountUid)&&nonempty(scope.workspaceId)&&nonempty(scope.egsId)
  &&purchase?.status==='posted'&&purchase.workspaceId===scope.workspaceId&&nonempty(purchase.branchId)&&nonempty(purchase.id)
  &&purchase.currency==='SAR'&&purchase.purchaseTax===undefined&&validDate(purchase.date)&&validDate(effectiveDate)
  &&original?.accountUid===scope.accountUid&&original.workspaceId===scope.workspaceId&&original.egsId===scope.egsId
  &&original.environment===scope.environment&&original.source==='purchase'&&original.sourceId===purchase.id&&original.key==='purchase-'+purchase.id
  &&original.currency===purchase.currency&&validDate(original.taxDate)&&effectiveDate>=purchase.date&&effectiveDate>=original.taxDate);
 const a=original.amount,v=plan?.valuationBridge;
 need(a?.kind==='invoice'&&a.treatment==='domestic'&&v&&Array.isArray(purchase.items)&&purchase.items.length>0&&purchase.items.length<=200&&Array.isArray(plan.lines)&&plan.lines.length===purchase.items.length);
 const gross=money(a.gross),vat=money(a.vat),deductible=money(a.deductibleVat),corrected=gross-deductible;
 need(money(a.net)+vat===gross&&deductible>0n&&deductible<=vat&&money(plan.grossPayable)===gross&&money(plan.deductibleVat)===deductible&&money(plan.correctedCost)===corrected);
 const expected=new Map([['purchase-cost:debit',corrected],['input-vat:debit',deductible],['accounts-payable:credit',gross]].filter(([,n])=>n>0n));
 need(Array.isArray(a.lines)&&a.lines.length===expected.size);
 for(const line of a.lines){const key=line.account+':'+line.side;need(expected.has(key)&&expected.get(key)===money(line.amount));expected.delete(key);}
 need(expected.size===0);
 const inventory=money(v.inventoryRelief),cogs=money(v.cogsRelief),expense=money(v.expenseRelief);
 need(inventory+cogs+expense===deductible);
 const items=new Map(purchase.items.map(x=>[x.id,x])),seen=new Set(),movements=new Set();
 need(items.size===purchase.items.length);
 let oldTotal=0n,newTotal=0n,vatTotal=0n,invTotal=0n,cogsTotal=0n,expTotal=0n;
 for(const row of plan.lines){
  const item=items.get(row.lineId);
  need(item&&!seen.has(row.lineId)&&row.itemId===(item.savedItemId||null));
  seen.add(row.lineId);
  if(row.itemId){need(nonempty(row.movementId)&&!movements.has(row.movementId));movements.add(row.movementId);}else need(row.movementId===null);
  const old=money(row.originalAmount),tax=money(row.deductibleVat),next=money(row.correctedAmount);
  need(tax<=old&&next===old-tax);oldTotal+=old;newTotal+=next;vatTotal+=tax;
  const explicit=['inventoryRelief','cogsRelief','expenseRelief'].some(k=>row[k]!==undefined);
  const inv=explicit?money(row.inventoryRelief):row.itemId?tax:0n, cg=explicit?money(row.cogsRelief):0n, exp=explicit?money(row.expenseRelief):row.itemId?0n:tax;
  need(inv+cg+exp===tax&&(row.itemId||inv===0n&&cg===0n));
  invTotal+=inv;cogsTotal+=cg;expTotal+=exp;
 }
 need(oldTotal===gross&&newTotal===corrected&&vatTotal===deductible&&invTotal===inventory&&cogsTotal===cogs&&expTotal===expense);
 const lines=[{account:'input-vat',side:'debit',amount:fmt(deductible)},...[
  ['inventory',inventory],['cost-of-sales',cogs],['other-expense',expense]
 ].filter(([,n])=>n>0n).map(([account,n])=>({account,side:'credit',amount:fmt(n)}))];
 return {format:'LOUREX_FISCAL_COST_GL_BRIDGE_V1',workspaceId:scope.workspaceId,branchId:purchase.branchId,purchaseId:purchase.id,currency:'SAR',effectiveDate,
  legacyGrossCost:fmt(gross),fiscalNetCost:fmt(corrected),deductibleVat:fmt(deductible),lines,totalDebit:fmt(deductible),totalCredit:fmt(inventory+cogs+expense),
  mode:'reconciliation-only',alreadyRecognizedInFiscalPurchase:true,glPosted:false,productionReady:false};
}
