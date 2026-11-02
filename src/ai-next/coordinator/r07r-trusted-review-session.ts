/**
 * R07R — offline, disabled composition of EXISTING trusted components.
 *
 * There is exactly one durable R07M coordinator. This composition does not
 * accept a turn, create an event journal, expose HTTP, read financial records,
 * or execute/post a document. It joins R07J-audited context, R07P synthetic
 * interpretation and the guarded R07R/R07D CAS draft preparation seam.
 * A separately opted-in offline-only R07Q fixture is accepted for testing
 * the previously missing routed semantic -> durable edit contract.
 *
 * An authorized deployment still requires explicit R07M event/operation
 * idempotency receipts and QA acceptance before using this on real accounts.
 */
import type {R07AuthenticatedPrincipalVerifier,
  R07ServerMembershipStore} from '../security/server-membership.js';
import {R07PTrustedHistoryContext,
  type R07PHistoryAuthority} from '../conversation-state/trusted-history-context.js';
import {R07PSemanticPlanner,
  type R07PSyntheticInterpreter,type R07PRoutedInterpreter}
  from '../router/semantic-planner.js';
import {R07RReviewDraftPreparationBridge,
  type R07RTrustedCustomerResolver} from './r07r-draft-preparation.js';
import type {R07DExperimentalFirestoreDraftStore}
  from '../storage/firestore-review-drafts.js';

export const R07R_TRUSTED_OFFLINE_REVIEW_SESSION_ACTIVE=false as const;
export interface R07RTrustedSessionDependencies{
  /** A server-owned, explicit offline-fixture-only construction grant. */
  offlineFixtureMode?:true;
  /** Separately require receipt adapter/transaction approval for offline QA. */
  offlineReceiptMode?:true;
  /** New deterministic NLU is also OFF unless explicitly opted-in for offline QA. */
  offlineDeterministicStructuredIntents?:true;
  /** Test-only composition of the existing R07Q with R07M receipt editing. */
  offlineRoutedReviewFixtures?:true;
  principal:R07AuthenticatedPrincipalVerifier;
  membership:R07ServerMembershipStore;
  journal:R07PHistoryAuthority;
  draftStore:Pick<R07DExperimentalFirestoreDraftStore,
    'read'|'replaceReviewRevision'> &
    Partial<Pick<R07DExperimentalFirestoreDraftStore,
      'readEditReceipt'|'replaceReviewRevisionWithReceipt'>>;
  customers:R07RTrustedCustomerResolver;
  /** Synthetic fixture for controlled offline tests only. */
  syntheticInterpreter?:R07PSyntheticInterpreter;
  /** A server-injected, explicitly labelled synthetic transport, never live. */
  routedInterpreter?:R07PRoutedInterpreter & {
    readonly transportKind:'offline_synthetic_fixture';
  };
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
  const routed=deps.offlineRoutedReviewFixtures===true;
  // This composition is intentionally not a live-model activation. The
  // R07Q fixture and synthetic interpreter can NEVER be active together.
  if(routed?(
      !deps.routedInterpreter||
      deps.routedInterpreter.transportKind!=='offline_synthetic_fixture'||
      deps.syntheticInterpreter!==undefined||
      process.env.VERCEL_ENV!==undefined||process.env.NODE_ENV==='production'
    ):(
      !deps.syntheticInterpreter||deps.routedInterpreter!==undefined
    ))
    throw Error('R07R_UNSAFE_OFFLINE_INFERENCE_CONFIGURATION');
  const context=new R07PTrustedHistoryContext(deps.journal,deps.draftStore);
  const planner=new R07PSemanticPlanner({
    principal:deps.principal,membership:deps.membership,context,
    syntheticInterpreter:routed?undefined:deps.syntheticInterpreter,
    allowSyntheticInference:!routed,
    routedInterpreter:routed?deps.routedInterpreter:undefined,
    allowRoutedInference:routed,
    allowDeterministicStructuredIntents:
      deps.offlineDeterministicStructuredIntents===true,
    clock:deps.clock,
  });
  const bridge=new R07RReviewDraftPreparationBridge({
    principal:deps.principal,membership:deps.membership,
    planner,draftStore:deps.draftStore,customers:deps.customers,
    offlineReceiptMode:deps.offlineReceiptMode,
    allowOfflineRoutedReviewFixtures:routed,
    clock:deps.clock,
  });
  return {context,planner,bridge};
}
