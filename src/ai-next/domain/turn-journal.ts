/**
 * R01 in-memory journal: synthetic, synchronous and NOT production persistence.
 * The persistent compare-and-swap repository is R03 work; no financial writes exist.
 */
import type { AuthenticatedScope, ConversationTurn, TaskState } from './contracts.js';
import { assertCoreContract, validateAuthenticatedScope } from './validation.js';
import { transitionTask, type TransitionOptions } from './state-machine.js';

export function exactScopeKey(scope: AuthenticatedScope): string {
  if (!validateAuthenticatedScope(scope)) throw new Error('AI_NEXT_INVALID_SCOPE');
  // Do not omit owner, account, company, branch, thread or authorization epoch.
  return JSON.stringify([scope.ownerUid,scope.accountId,scope.companyId,
    scope.branchId,scope.threadId,scope.actorId,scope.role,scope.scopeType,
    scope.authorizationVersion]);
}
const copy = <T>(value: T): T => structuredClone(value);
const nowIso = () => new Date().toISOString();

export interface BeginTurnInput {
  scope: AuthenticatedScope; // MUST come from a verified future server auth boundary.
  requestId: string;
  idempotencyKey: string;
  userMessageId: string;
  message: string;
  languageHint: ConversationTurn['userMessage']['languageHint'];
  mode: ConversationTurn['mode'];
  attachedSourceIds?: string[];
}
export interface BeginTurnResult {
  replayed: boolean;
  turn: ConversationTurn;
  task: TaskState;
}
interface JournalRecord {
  fingerprint: string;
  turn: ConversationTurn;
  task: TaskState;
}
/**
 * Safe deterministic reference implementation and R01 test double only.
 * A new instance loses its state. Do not call this for live tasks.
 */
export class SyntheticTurnJournal {
  private records = new Map<string, JournalRecord>();
  private activeByThread = new Map<string, string>();
  private sequences = new Map<string, number>();

  begin(input: BeginTurnInput, clock = nowIso()): BeginTurnResult {
    if (!validateAuthenticatedScope(input.scope)) throw new Error('AI_NEXT_INVALID_SCOPE');
    if (typeof input.message !== 'string' || !input.message.trim())
      throw new Error('AI_NEXT_EMPTY_REQUEST');
    if (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey.trim())
      throw new Error('AI_NEXT_MISSING_IDEMPOTENCY_KEY');
    const scopeKey = exactScopeKey(input.scope);
    const threadKey = scopeKey;
    const requestKey = JSON.stringify([scopeKey, input.idempotencyKey]);
    const attachmentIds = [...new Set(input.attachedSourceIds ?? [])];
    const fingerprint = JSON.stringify([input.userMessageId,input.message,input.languageHint,
      input.mode,attachmentIds,input.requestId]);
    const existing = this.records.get(requestKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new Error('AI_NEXT_IDEMPOTENCY_COLLISION');
      return {replayed:true,turn:copy(existing.turn),task:copy(existing.task)};
    }
    const active = this.activeByThread.get(threadKey);
    if (active && this.records.get(active)?.task.state &&
      !['completed','failed','cancelled'].includes(this.records.get(active)!.task.state))
      throw new Error('AI_NEXT_CONCURRENT_TURN');
    const sequenceNumber = (this.sequences.get(threadKey) ?? 0) + 1;
    const receivedAt = clock;
    const turnId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const turn: ConversationTurn = {
      schemaVersion:1,scope:copy(input.scope),turnId,threadId:input.scope.threadId,
      userMessageId:input.userMessageId,requestId:input.requestId,
      idempotencyKey:input.idempotencyKey,sequenceNumber,parentTurnId:null,
      userMessage:{text:input.message,languageHint:input.languageHint,
        attachedSourceIds:attachmentIds},
      mode:input.mode,receivedAt,stateVersion:0,selectedSourceIds:[],
      taskId,lifecycle:'received',outputResultId:null,
    };
    const task: TaskState = {
      schemaVersion:1,scope:copy(input.scope),taskId,threadId:input.scope.threadId,turnId,
      taskType:'conversation',state:'created',revision:0,stateVersion:0,
      startedAt:receivedAt,updatedAt:receivedAt,completedAt:null,stageIndex:0,
      progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:receivedAt},
      currentCheckpointId:null,sourceIds:attachmentIds,draftId:null,approvalId:null,
      lastError:null,cancellable:true,retryPolicy:'safe_only',executionOperationId:null,
    };
    assertCoreContract('ConversationTurn',turn);
    assertCoreContract('TaskState',task);
    this.records.set(requestKey,{fingerprint,turn:copy(turn),task:copy(task)});
    this.activeByThread.set(threadKey,requestKey);
    this.sequences.set(threadKey,sequenceNumber);
    return {replayed:false,turn:copy(turn),task:copy(task)};
  }

  transition(input: {
    scope: AuthenticatedScope;
    idempotencyKey: string;
    taskId: string;
    next: TaskState['state'];
    options: TransitionOptions;
  }): TaskState {
    const key = JSON.stringify([exactScopeKey(input.scope),input.idempotencyKey]);
    const record = this.records.get(key);
    if (!record || record.task.taskId !== input.taskId)
      throw new Error('AI_NEXT_TASK_NOT_FOUND_OR_FORBIDDEN');
    const updated = transitionTask(record.task,input.next,input.options);
    record.task = copy(updated);
    return copy(updated);
  }
  get(input: {scope: AuthenticatedScope; idempotencyKey: string}): BeginTurnResult | null {
    const key = JSON.stringify([exactScopeKey(input.scope),input.idempotencyKey]);
    const record = this.records.get(key);
    return record ? {replayed:true,turn:copy(record.turn),task:copy(record.task)} : null;
  }
  /** This R01 prototype has deliberately NO execute/write/approve function. */
  sizeForTests(): number {return this.records.size;}
}
