/**
 * Pure R01 task reducer: no IO, no finance adapters, no AI provider, no hidden retries.
 * R01 blocks financial execution until R04 supplies and verifies a durable gateway.
 */
import type { TaskState, TaskPhase, CompletenessStatus } from './contracts.js';
import { assertCoreContract } from './validation.js';

const TRANSITIONS: Readonly<Record<TaskPhase, readonly TaskPhase[]>> = Object.freeze({
  created: ['understanding','cancelled'],
  understanding: ['gathering_evidence','processing','needs_clarification','failed','cancelled'],
  gathering_evidence: ['processing','needs_review','recoverable','failed','cancelled'],
  processing: ['needs_clarification','needs_review','awaiting_approval','completed','recoverable','failed','cancelled'],
  needs_clarification: ['understanding','cancelled'],
  needs_review: ['processing','awaiting_approval','cancelled'],
  awaiting_approval: ['needs_review','cancelled'], // no execute in R01
  executing: ['completed','needs_reconciliation'], // historical recovery only; R01 cannot enter
  recoverable: ['gathering_evidence','processing','cancelled'],
  needs_reconciliation: ['completed','failed','needs_review'],
  completed: [],
  failed: [],
  cancelled: [],
});
export const R01_EXECUTION_ENABLED = false as const;
export interface VerifiedCoverageGate {
  /** Trusted R02/R03 will resolve these from the authoritative source manifest, not the model. */
  documentSources: ReadonlyArray<{sourceId: string; status: CompletenessStatus}>;
}
export interface TransitionOptions {
  expectedStateVersion: number;
  now: string;
  /** R01 cannot execute external actions. */
  coverage?: VerifiedCoverageGate;
  /** Required when reconciling an uncertain external execution; not client generated. */
  reconciliationVerified?: boolean;
  /** Optional real observed progress, never guessed. */
  progress?: {completedUnits: number; totalUnits: number | null; unitType: TaskState['progress']['unitType']};
}

export function canTransition(from: TaskPhase, to: TaskPhase): boolean {
  return TRANSITIONS[from].includes(to);
}
export function transitionTask(current: TaskState, nextState: TaskPhase, options: TransitionOptions): TaskState {
  assertCoreContract('TaskState', current);
  if (!Number.isSafeInteger(options.expectedStateVersion) ||
    current.stateVersion !== options.expectedStateVersion)
    throw new Error('AI_NEXT_STALE_STATE_VERSION');
  if (!canTransition(current.state, nextState)) throw new Error('AI_NEXT_INVALID_STATE_TRANSITION');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(options.now) ||
    Number.isNaN(Date.parse(options.now)) || Date.parse(options.now) < Date.parse(current.updatedAt))
    throw new Error('AI_NEXT_INVALID_TRANSITION_TIME');
  if (nextState === 'executing') throw new Error('AI_NEXT_FINANCIAL_EXECUTION_DISABLED');
  if (nextState === 'completed') {
    if (current.state === 'needs_reconciliation' && !options.reconciliationVerified)
      throw new Error('AI_NEXT_UNVERIFIED_OPERATION');
    if (current.state === 'executing' && !options.reconciliationVerified)
      throw new Error('AI_NEXT_UNVERIFIED_OPERATION');
    if (current.sourceIds.length > 0) {
      const coverage = options.coverage?.documentSources ?? [];
      const seen = new Set(coverage.map(row => row.sourceId));
      if (seen.size !== coverage.length ||
        current.sourceIds.some(sourceId =>
          !coverage.some(c => c.sourceId === sourceId && c.status === 'complete')))
        throw new Error('AI_NEXT_INCOMPLETE_SOURCE_COVERAGE');
    }
  }
  if (current.state === 'needs_reconciliation' && nextState === 'failed' &&
    !options.reconciliationVerified)
    throw new Error('AI_NEXT_UNVERIFIED_OPERATION');
  if (current.executionOperationId && nextState === 'cancelled')
    throw new Error('AI_NEXT_EXECUTION_REQUIRES_RECONCILIATION');
  const p = options.progress;
  if (p && (!Number.isSafeInteger(p.completedUnits) || p.completedUnits < 0 ||
    (p.totalUnits !== null && (!Number.isSafeInteger(p.totalUnits) ||
      p.totalUnits < p.completedUnits))))
    throw new Error('AI_NEXT_INVALID_PROGRESS');
  const updated: TaskState = {
    ...current,
    state: nextState,
    revision: current.revision + 1,
    stateVersion: current.stateVersion + 1,
    updatedAt: options.now,
    completedAt: ['completed','cancelled','failed'].includes(nextState) ? options.now : null,
    cancellable: !['completed','cancelled','failed','executing','needs_reconciliation'].includes(nextState),
    progress: p ? {...p,observedAt: options.now} : current.progress,
  };
  assertCoreContract('TaskState', updated);
  return updated;
}

/** Cancellation after execution started is *not* proof that the business write stopped. */
export function requestCancellation(current: TaskState, expectedStateVersion: number, now: string): TaskState {
  assertCoreContract('TaskState', current);
  if (current.stateVersion !== expectedStateVersion) throw new Error('AI_NEXT_STALE_STATE_VERSION');
  if (current.state === 'executing' || !!current.executionOperationId) {
    if (!canTransition(current.state, 'needs_reconciliation'))
      throw new Error('AI_NEXT_EXECUTION_REQUIRES_RECONCILIATION');
    return transitionTask(current, 'needs_reconciliation', {expectedStateVersion, now});
  }
  return transitionTask(current, 'cancelled', {expectedStateVersion, now});
}

/** A terminal task is immutable. Retrying requires a new taskId referencing prior task. */
export function restartRequiresNewTask(current: TaskState, newTaskId: string): void {
  assertCoreContract('TaskState', current);
  if (!['failed','completed','cancelled'].includes(current.state) || newTaskId === current.taskId ||
    !newTaskId.trim()) throw new Error('AI_NEXT_RESTART_REQUIRES_NEW_TASK_ID');
}
