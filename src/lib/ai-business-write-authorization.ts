import type {VaultPayload} from '../types.js';
import {assistantCapabilitiesForRole} from './ai-assistant-foundation.js';
import {strictAiActor} from './ai-foundation-approval.js';

/**
 * Defense in depth for the legacy Controller approval entry point.
 * Execute at the same fresh-vault mutation boundary as data validation.
 *
 * Operator selection is client state and must NOT be mistaken for a
 * cryptographically authenticated Firebase team-member permission.
 */
export function assertAiBusinessWriteAuthorized(vault:VaultPayload,capability:string):void {
  const operator=strictAiActor(vault);
  const allowed=assistantCapabilitiesForRole(operator.role,'business');
  if(!allowed.includes(capability))
    throw new Error('The active operator is not authorized to save this AI business action. Select an authorized operator and review again.');
}
