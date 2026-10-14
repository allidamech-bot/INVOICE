import type { VaultPayload } from '../types.js';
import { strictAiActor } from './ai-foundation-approval.js';

export type AiImportSaveKind='quotation-draft'|'supplier-purchase-draft';

/**
 * Revalidate the selected operator INSIDE the freshly resumed vault mutation.
 * A click or AI-generated proposal is not permission to create business records.
 * This protects legacy AI Inbox/import routes; it is NOT a substitute for
 * server-side Firebase/team-member authorization.
 */
export function assertAiImportSaveAllowed(vault:VaultPayload,kind:AiImportSaveKind):void{
  const {role}=strictAiActor(vault);
  const authorized=kind==='quotation-draft'
    ?['owner','admin','sales','finance']
    :['owner','admin','purchasing'];
  if(!authorized.includes(role))
    throw new Error('The active operator cannot save this AI import. Switch to an authorized operator and review again.');
}
