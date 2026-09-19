import type { VaultPayload } from '../types.js';

export type VaultMutation=(vault:VaultPayload)=>VaultPayload;
export type VaultMutationHandler=(mutation:VaultMutation)=>Promise<VaultPayload>;

let handler:VaultMutationHandler|null=null;

export function registerVaultMutationBridge(next:VaultMutationHandler):void{
  handler=next;
}

export async function mutateVaultSafely(mutation:VaultMutation):Promise<VaultPayload>{
  const active=handler;
  if(!active)throw new Error('LOUREX workspace is not ready for this change.');
  return active(mutation);
}
