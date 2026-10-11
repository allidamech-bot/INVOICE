import type { VaultPayload } from '../types.js';

export type VaultMutation=(vault:VaultPayload)=>VaultPayload;
export type VaultMutationHandler=(mutation:VaultMutation)=>Promise<VaultPayload>;

let handler:VaultMutationHandler|null=null;
export type WorkspaceReadSession={key:CryptoKey;vault:VaultPayload};
let sessionReader:(()=>Promise<WorkspaceReadSession|null>)|null=null;

/** A registered account reader is authoritative, including a signed-out null. */
export function registerWorkspaceSessionReader(reader:()=>Promise<WorkspaceReadSession|null>):void{
  sessionReader=reader;
}
export function readWorkspaceSession():Promise<WorkspaceReadSession|null>|undefined{
  return sessionReader?.();
}

export function registerVaultMutationBridge(next:VaultMutationHandler):void{
  handler=next;
}

export async function mutateVaultSafely(mutation:VaultMutation):Promise<VaultPayload>{
  const active=handler;
  if(!active)throw new Error('LOUREX workspace is not ready for this change.');
  return active(mutation);
}
