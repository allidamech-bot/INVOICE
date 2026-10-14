import type { VaultPayload, TeamRole } from '../types.js';
import { strictAiActor } from './ai-foundation-approval.js';

export type AiWorkflowDraftKind='quotation'|'supplier-purchase';

/** Local business-workflow authorization, enforced at the mutation boundary.
 * This is a necessary guard, not a substitute for server-authenticated team
 * membership: Firestore currently isolates the containing Firebase UID only.
 */
const DRAFT_ROLES:Record<AiWorkflowDraftKind,ReadonlyArray<TeamRole>>={
  quotation:['owner','admin','finance','sales'],
  'supplier-purchase':['owner','admin','purchasing']
};
export function assertAiWorkflowDraftPermission(vault:VaultPayload,kind:AiWorkflowDraftKind):void {
  const role=strictAiActor(vault).role;
  if(!DRAFT_ROLES[kind].includes(role))
    throw new Error(kind==='quotation'
      ?'Your active operator cannot save an AI quotation draft. Choose an authorized sales or finance operator.'
      :'Your active operator cannot save an AI supplier purchase draft. Choose an authorized purchasing operator.');
}
