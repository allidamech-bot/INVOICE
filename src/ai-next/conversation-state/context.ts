/**
 * R03 context packer: NEVER mistake a bounded model prompt for complete data.
 * The authoritative full thread stays in the scoped event ledger.
 * Every excluded turn/source is surfaced as a pointer, not silently deleted.
 */
import type { AuthenticatedScope, CompletenessStatus } from '../domain/contracts.js';
import { exactScopeKey } from '../domain/turn-journal.js';
import type { ConversationSnapshot } from './event-store.js';
import type { KnowledgeRecord } from './knowledge.js';
import { knowledgeScopeKey } from './knowledge.js';

export interface SourcePointer {
  scopeKey:string;
  documentId:string;
  sourceSha256:string;
  coverageStatus:CompletenessStatus;
  pageCount:number|null;
  reviewed:boolean;
  /** Trusted reader resolves this locator after scope check; never embedded as raw bytes. */
  manifestRef:string;
}
export interface ContextItem {
  kind:'conversation'|'memory';
  id:string;
  role:'user'|'assistant'|'context';
  content:string;
  fromTurnId:string;
  selectedLength:number;
}
export interface ContextPlan {
  scopeKey:string;
  included:ContextItem[];
  sourcePointers:SourcePointer[];
  /** True means the prompt omitted old content, NOT that thread history was lost. */
  boundedPrompt:true;
  excludedMessageIds:string[];
  excludedMemoryIds:string[];
  unresolvedSources:string[];
  sourceCoverageComplete:boolean;
  canClaimCompleteFileAnswer:boolean;
  totalStoredMessages:number;
  totalStoredTurns:number;
  selectedCharacters:number;
  warnings:string[];
}
const safeNum=(n:number,max:number)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
export function prepareContext(input:{
  scope:AuthenticatedScope;
  snapshot:ConversationSnapshot;
  memories:readonly KnowledgeRecord[];
  requestedSources:readonly string[];
  sources:readonly SourcePointer[];
  maxCharacters:number;
  maxMessages:number;
  now:string;
}):ContextPlan{
  const {scope,snapshot}=input;
  const key=exactScopeKey(scope);
  if(snapshot.scopeKey!==key ||
    !Number.isFinite(Date.parse(input.now)) || !input.now.endsWith('Z') ||
    !safeNum(input.maxCharacters,120_000) ||
    input.maxCharacters<500 || !safeNum(input.maxMessages,200) ||
    input.maxMessages<1)
    throw new Error('AI_NEXT_CONTEXT_INVALID_SCOPE_OR_LIMIT');
  const selected=new Set<string>();
  const pointers:SourcePointer[]=[];
  const missing:string[]=[];
  for(const id of input.requestedSources){
    if(typeof id!=='string'||!id||selected.has(id))
      throw new Error('AI_NEXT_CONTEXT_DUPLICATE_OR_INVALID_SOURCE');
    selected.add(id);
    const found=input.sources.filter(s=>s.documentId===id);
    if(found.length!==1 || found[0]!.scopeKey!==key ||
      !/^[a-f0-9]{64}$/.test(found[0]!.sourceSha256) ||
      !found[0]!.manifestRef)
      missing.push(id);
    else pointers.push(structuredClone(found[0]!));
  }
  const memoryScope=knowledgeScopeKey(scope);
  const validMemories=input.memories.filter(m=>
    m.ownerKey===memoryScope && m.revokedAt===null && m.content!==null &&
    Date.parse(m.expiresAt)>Date.parse(input.now));
  if(validMemories.length!==input.memories.length)
    throw new Error('AI_NEXT_CONTEXT_FOREIGN_OR_REVOKED_MEMORY');
  const context:ContextItem[]=[],excludedMessageIds:string[]=[],excludedMemoryIds:string[]=[];
  let used=0;
  // Never chop a message mid-text. Omitted messages remain traceable.
  const recent=[...snapshot.messages].reverse();
  for(const item of recent){
    if(context.filter(x=>x.kind==='conversation').length>=input.maxMessages ||
      used+item.text.length>input.maxCharacters){
      excludedMessageIds.push(item.messageId);continue;
    }
    context.push({kind:'conversation',id:item.messageId,role:item.role,
      content:item.text,fromTurnId:item.turnId,selectedLength:item.text.length});
    used+=item.text.length;
  }
  for(const m of validMemories){
    const content=m.content!;
    if(used+content.length>input.maxCharacters){
      excludedMemoryIds.push(m.memoryId);continue;
    }
    context.push({kind:'memory',id:m.memoryId,role:'context',content,
      fromTurnId:m.sourceTurnId,selectedLength:content.length});
    used+=content.length;
  }
  const incomplete=pointers.some(p=>p.coverageStatus!=='complete'||!p.reviewed);
  const unresolvedSources=[...missing,...pointers.filter(p=>p.coverageStatus!=='complete'||!p.reviewed)
    .map(p=>p.documentId)];
  const warnings:string[]=[];
  if(excludedMessageIds.length)warnings.push('MODEL_CONTEXT_WINDOW_OMITTED_OLD_MESSAGES');
  if(excludedMemoryIds.length)warnings.push('MODEL_CONTEXT_WINDOW_OMITTED_MEMORIES');
  if(unresolvedSources.length)warnings.push('SOURCE_COVERAGE_OR_REVIEW_REQUIRED');
  return {
    scopeKey:key,
    included:context.reverse(),
    sourcePointers:pointers,
    boundedPrompt:true,
    excludedMessageIds,
    excludedMemoryIds,
    unresolvedSources,
    sourceCoverageComplete:!missing.length&&!incomplete,
    // A model cannot claim it read an entire document based only on pointers.
    canClaimCompleteFileAnswer:false,
    totalStoredMessages:snapshot.messages.length,
    totalStoredTurns:snapshot.turns.length,
    selectedCharacters:used,warnings,
  };
}
/** A resumed task always requires a deliberate user/server action; never auto-replay writes. */
export function classifyResume(snapshot:ConversationSnapshot):Array<{
  taskId:string;lastState:string;
  resume:'terminal'|'read_only_rehydrate'|'requires_confirmation'|'reconcile_first';
  stateVersion:number;
}>{
  return snapshot.tasks.map(task=>({
    taskId:task.taskId,lastState:task.state,stateVersion:task.stateVersion,
    resume:task.state==='needs_reconciliation'||task.state==='executing'||
      task.executionOperationId!==null?'reconcile_first'
      :['completed','cancelled','failed'].includes(task.state)?'terminal'
      :task.state==='awaiting_approval'?'requires_confirmation'
      :'read_only_rehydrate',
  }));
}
