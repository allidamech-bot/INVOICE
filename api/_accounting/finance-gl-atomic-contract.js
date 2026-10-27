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
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)
  &&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;

export function fingerprintSyntheticFinanceSources(sources){
  // A digest authenticates neither the snapshot provider nor its completeness.
  return digest(sources);
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
    ||!nonempty(state.sourceSha256)||!Array.isArray(state.journals)
    ||!Array.isArray(state.receipts))
    fail('AUTHORITY_MISSING');
  if(identity.role!=='owner'||identity.uid!==state.ownerUid)fail('OWNER_REQUIRED');
  if(!nonempty(command.opId)||command.opId.length>128
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

  // Idempotency is checked against a fingerprint of the *complete* original
  // command. Persist only this digest, never customer source content.
  const fingerprint=digest(command);
  const prior=state.receipts.filter(x=>x.opId===command.opId);
  if(prior.length>1)fail('CORRUPT_RECEIPTS');
  if(prior.length===1){
    const receipt=prior[0];
    if(receipt.fingerprint!==fingerprint)fail('OPERATION_REUSED');
    if(!receipt.journalIds?.every(id=>state.journals.some(x=>x.id===id)))
      fail('HISTORIC_JOURNAL_MISSING');
    return{state,receipt:structuredClone(receipt),replayed:true,
      trustedPostingCommitted:false,productionReady:false};
  }

  if(command.expectedLedgerVersion!==state.ledgerVersion
    ||command.expectedPeriodGeneration!==state.periodGeneration)
    fail('REVISION_CONFLICT');

  if(state.closedThrough!==null && state.closedThrough!==undefined
    &&!validDate(state.closedThrough))fail('PERIOD_CONTROL_INVALID');
  const seenId=new Set(state.journals.map(j=>j.id));
  const seenSource=new Set(state.journals.map(j=>j.sourceKind+':'+j.sourceMovementId));
  for(const row of command.append){
    if(!row||!nonempty(row.id)||!nonempty(row.sourceMovementId)
      ||seenId.has(row.id)||seenSource.has(row.sourceKind+':'+row.sourceMovementId))
      fail('DUPLICATE_OR_MISSING_SOURCE');
    seenId.add(row.id);seenSource.add(row.sourceKind+':'+row.sourceMovementId);
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
  const proof=verifySourceBoundGl(controls,sourceEvidence,fullHistory);
  if(proof?.sourceMatchedWithinSyntheticEvidence!==true
    ||proof.sourceMovementCount!==fullHistory.length
    ||proof.trialBalance?.sourceJournalCount!==fullHistory.length
    ||proof.trialBalance?.totalDebitBalances!==proof.trialBalance?.totalCreditBalances
    ||proof.productionReady!==false||proof.trialBalance?.productionReady!==false)
    fail('SOURCE_AUDIT_INCOMPLETE');
  const nextVersion=state.ledgerVersion+1;
  if(!Number.isSafeInteger(nextVersion))fail('REVISION_OVERFLOW');
  const receipt={
    opId:command.opId,fingerprint,ledgerVersion:nextVersion,
    generation:state.periodGeneration,sourceSha256:state.sourceSha256,
    journalIds:command.append.map(j=>j.id),
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
