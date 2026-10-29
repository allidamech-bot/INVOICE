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
