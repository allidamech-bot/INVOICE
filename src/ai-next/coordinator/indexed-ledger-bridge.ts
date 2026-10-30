/**
 * R07K — disabled compatibility bridge between R07B2 local coordinator's
 * authoritative R03 projection contract and R07J's indexed receipt API.
 *
 * This proves existing authorization / turn / task / unsaved draft semantics
 * against durable indexed events. Deliberately replays the FULL indexed event
 * history after every event. It is not the fast production read-model.
 * Never expose as a production handler, never use for financial execution.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import type {ScopedConversationLedger,ConversationSnapshot}
  from '../conversation-state/event-store.js';
import {R07JExperimentalIndexedJournal}
  from '../storage/firestore-indexed-append.js';
import type {R07CoordinatorEventLedger}
  from './local-coordinator.js';

export const R07K_COORDINATOR_INDEXED_BRIDGE_ACTIVATED=false as const;
export class R07KIndexedBridgeError extends Error{
  constructor(readonly code:string){super(code);}
}
type AppendInput=Parameters<ScopedConversationLedger['append']>[0];
type AppendResult=Awaited<ReturnType<ScopedConversationLedger['append']>>;

export class R07KIndexedCoordinatorLedger implements R07CoordinatorEventLedger{
  constructor(private readonly journal:R07JExperimentalIndexedJournal){}
  async snapshot(scope:AuthenticatedScope):Promise<ConversationSnapshot>{
    // Full R03 projection, hash and event order checks are still authoritative.
    return this.journal.auditFullHistory(scope);
  }
  async append(input:AppendInput):Promise<AppendResult>{
    const receipt=await this.journal.append(input);
    if(receipt.authoritativeFullSnapshot!==false||
      receipt.event.scopeKey!==exactScopeKey(input.scope)||
      receipt.event.eventId!==input.eventId||
      receipt.event.idempotencyKey!==input.idempotencyKey)
      throw new R07KIndexedBridgeError('R07K_RECEIPT_MISMATCH');
    // Never present a committed but unverified event as completed. A concurrent
    // later writer may legitimately make the audited revision > our receipt.
    const audited=await this.snapshot(input.scope);
    if(audited.revision<receipt.revision||
      (audited.revision===receipt.revision&&
        audited.lastHash!==receipt.lastHash))
      throw new R07KIndexedBridgeError('R07K_UNVERIFIED_COMMIT');
    return {event:receipt.event,snapshot:audited,replayed:receipt.replayed};
  }
}
