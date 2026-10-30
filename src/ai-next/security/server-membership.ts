/**
 * R07B: trusted membership authority adapter, with no production route.
 *
 * A token verifies actor identity; it does NOT prove company or branch access.
 * A SERVER-ONLY ACL resolver must independently authorize each requested
 * account/company/branch on every call. No browser-provided membership is used.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {
  authorizeConversationRequest,
  type TrustedIdentityProvider,
  type VerifiedPrincipal,
  type ServerMembership,
} from '../conversation-state/auth-boundary.js';

export const R07B_NEXT_API_ENABLED=false as const;

export interface R07AuthenticatedPrincipalVerifier {
  verify(token:string,serverNowEpochSeconds:number):Promise<VerifiedPrincipal>;
}
export interface R07ServerMembershipStore {
  /** Server-owned, current ACL record only. Must fail closed on outage. */
  readForActor(input:{
    verifiedUid:string;accountId:string;companyId:string;branchId:string;
  }):Promise<ServerMembership|null>;
}
export interface R07RequestEnvelope {
  schemaVersion:1;
  accountId:string;
  companyId:string;
  branchId:string;
  threadId:string;
  scopeType:'business'|'personal'|'temporary';
}
function exactKeys(value:unknown,expected:readonly string[]):value is Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype)return false;
  const keys=Object.keys(value).sort();
  return keys.length===expected.length&&
    keys.every((key,i)=>key===[...expected].sort()[i]);
}
const safe=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&
  x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
export function parseR07RequestEnvelope(value:unknown):R07RequestEnvelope{
  if(!exactKeys(value,['schemaVersion','accountId','companyId','branchId','threadId','scopeType'])||
    value.schemaVersion!==1||
    !safe(value.accountId)||!safe(value.companyId)||
    !safe(value.branchId)||!safe(value.threadId)||
    !['business','personal','temporary'].includes(String(value.scopeType)))
    throw Error('R07_INVALID_REQUEST_ENVELOPE');
  return value as unknown as R07RequestEnvelope;
}
export class R07TrustedMembershipAuthority implements TrustedIdentityProvider{
  private serverNow:number;
  constructor(
    private readonly principal:R07AuthenticatedPrincipalVerifier,
    private readonly acl:R07ServerMembershipStore,
    serverNowEpochSeconds:number,
  ){
    if(!Number.isSafeInteger(serverNowEpochSeconds)||serverNowEpochSeconds<1)
      throw Error('R07_INVALID_SERVER_TIME');
    this.serverNow=serverNowEpochSeconds;
  }
  verifyFirebaseBearer(token:string):Promise<VerifiedPrincipal>{
    return this.principal.verify(token,this.serverNow);
  }
  async membershipFor(actorUid:string,accountId:string,companyId:string,branchId:string):
    Promise<ServerMembership|null>{
    // All identifiers are lookup keys, never authorization. The server-owned
    // ACL must prove the exact current membership; if none, deny.
    const record=await this.acl.readForActor({
      verifiedUid:actorUid,accountId,companyId,branchId,
    });
    if(!record||record.active!==true||record.actorUid!==actorUid||
      record.ownerUid!==actorUid|| // current architecture supports one UID only
      record.accountId!==accountId||record.companyId!==companyId||
      record.branchId!==branchId||record.authorizationVersion<1||
      !Array.isArray(record.permittedRoles))
      return null;
    return structuredClone(record);
  }
}
export async function authorizeR07ScopedRequest(input:{
  bearerToken:string;
  body:unknown;
  principal:R07AuthenticatedPrincipalVerifier;
  membership:R07ServerMembershipStore;
  serverNowEpochSeconds:number;
}):Promise<AuthenticatedScope>{
  const parsed=parseR07RequestEnvelope(input.body);
  const service=new R07TrustedMembershipAuthority(input.principal,input.membership,
    input.serverNowEpochSeconds);
  return authorizeConversationRequest({
    bearerToken:input.bearerToken,requestedAccountId:parsed.accountId,
    requestedCompanyId:parsed.companyId,requestedBranchId:parsed.branchId,
    requestedThreadId:parsed.threadId,scopeType:parsed.scopeType,
    service,serverNowEpochSeconds:input.serverNowEpochSeconds,
  });
}
