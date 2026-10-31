/**
 * R07R — offline, disabled composition of EXISTING trusted components.
 *
 * There is exactly one durable R07M coordinator. This composition does not
 * accept a turn, create an event journal, expose HTTP, read financial records,
 * or execute/post a document. It joins R07J-audited context, R07P synthetic
 * interpretation and the guarded R07R/R07D CAS draft preparation seam.
 *
 * An authorized deployment still requires explicit R07M event/operation
 * idempotency receipts and QA acceptance before using this on real accounts.
 */
import type {R07AuthenticatedPrincipalVerifier,
  R07ServerMembershipStore} from '../security/server-membership.js';
import {R07PTrustedHistoryContext,
  type R07PHistoryAuthority} from '../conversation-state/trusted-history-context.js';
import {R07PSemanticPlanner,
  type R07PSyntheticInterpreter} from '../router/semantic-planner.js';
import {R07RReviewDraftPreparationBridge,
  type R07RTrustedCustomerResolver} from './r07r-draft-preparation.js';
import type {R07DExperimentalFirestoreDraftStore}
  from '../storage/firestore-review-drafts.js';

export const R07R_TRUSTED_OFFLINE_REVIEW_SESSION_ACTIVE=false as const;
export interface R07RTrustedSessionDependencies{
  /** A server-owned, explicit offline-fixture-only construction grant. */
  offlineFixtureMode?:true;
  principal:R07AuthenticatedPrincipalVerifier;
  membership:R07ServerMembershipStore;
  journal:R07PHistoryAuthority;
  draftStore:Pick<R07DExperimentalFirestoreDraftStore,
    'read'|'replaceReviewRevision'>;
  customers:R07RTrustedCustomerResolver;
  /** Synthetic fixture for controlled offline tests only. */
  syntheticInterpreter:R07PSyntheticInterpreter;
  clock?:()=>Date;
}
export function createR07RTrustedOfflineReviewSession(
  deps:R07RTrustedSessionDependencies,
):{
  context:R07PTrustedHistoryContext;
  planner:R07PSemanticPlanner;
  bridge:R07RReviewDraftPreparationBridge;
}{
  if(deps.offlineFixtureMode!==true)
    throw Error('R07R_OFFLINE_FIXTURE_CONSENT_REQUIRED');
  const context=new R07PTrustedHistoryContext(deps.journal,deps.draftStore);
  const planner=new R07PSemanticPlanner({
    principal:deps.principal,membership:deps.membership,context,
    syntheticInterpreter:deps.syntheticInterpreter,
    allowSyntheticInference:true,
    clock:deps.clock,
  });
  const bridge=new R07RReviewDraftPreparationBridge({
    principal:deps.principal,membership:deps.membership,
    planner,draftStore:deps.draftStore,customers:deps.customers,
    clock:deps.clock,
  });
  return {context,planner,bridge};
}
