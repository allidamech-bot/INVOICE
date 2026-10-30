/**
 * R03 server authorization boundary. The token verifier and account membership
 * resolver MUST be trusted server-side dependencies; client-supplied claims,
 * branch labels, or model text can never grant access.
 *
 * R03 does not activate an HTTP route or Firebase config.
 */
import type { AuthenticatedScope } from '../domain/contracts.js';
import { validateAuthenticatedScope } from '../domain/validation.js';

export interface VerifiedPrincipal {
  uid:string;
  tokenIssuedAt:number;
  tokenExpiresAt:number;
  authenticatedAt:number;
  role:AuthenticatedScope['role'];
  anonymous:false;
}
export interface ServerMembership {
  ownerUid:string;
  accountId:string;
  companyId:string;
  branchId:string;
  actorUid:string;
  permittedRoles:ReadonlyArray<AuthenticatedScope['role']>;
  authorizationVersion:number;
  active:boolean;
}
export interface TrustedIdentityProvider {
  verifyFirebaseBearer(token:string):Promise<VerifiedPrincipal>;
  /** Query server-maintained ACLs. Never use any client-sent membership object. */
  membershipFor(actorUid:string,accountId:string,companyId:string,branchId:string):
    Promise<ServerMembership|null>;
}
export class AiNextAuthorizationError extends Error {
  constructor(public readonly code:string){super(code);}
}
/** The only scope constructor intended at a future HTTP boundary. */
export async function authorizeConversationRequest(input:{
  bearerToken:string;
  requestedAccountId:string;requestedCompanyId:string;
  requestedBranchId:string;requestedThreadId:string;
  scopeType:AuthenticatedScope['scopeType'];
  service:TrustedIdentityProvider;
  serverNowEpochSeconds:number;
}):Promise<AuthenticatedScope>{
  const {service}=input;
  if(typeof input.bearerToken!=='string'||input.bearerToken.length<30 ||
    input.bearerToken.length>16_384 ||
    [input.requestedAccountId,input.requestedCompanyId,input.requestedBranchId,
      input.requestedThreadId].some(x=>typeof x!=='string'||!x||x.length>160)||
    !Number.isSafeInteger(input.serverNowEpochSeconds) ||
    !['business','personal','temporary'].includes(input.scopeType))
    throw new AiNextAuthorizationError('AUTH_INVALID_REQUEST');
  const actor=await service.verifyFirebaseBearer(input.bearerToken);
  if(!actor || actor.anonymous!==false ||
    typeof actor.uid!=='string'||!actor.uid ||
    !Number.isSafeInteger(actor.tokenExpiresAt) ||
    actor.tokenExpiresAt<=input.serverNowEpochSeconds ||
    !Number.isSafeInteger(actor.tokenIssuedAt) ||
    actor.tokenIssuedAt>input.serverNowEpochSeconds ||
    !Number.isSafeInteger(actor.authenticatedAt) ||
    actor.authenticatedAt>input.serverNowEpochSeconds ||
    !['owner','admin','finance','sales','purchasing','viewer'].includes(actor.role))
    throw new AiNextAuthorizationError('AUTH_INVALID_PRINCIPAL');
  const membership=await service.membershipFor(actor.uid,input.requestedAccountId,
    input.requestedCompanyId,input.requestedBranchId);
  if(!membership||!membership.active||
    membership.accountId!==input.requestedAccountId||
    membership.companyId!==input.requestedCompanyId||
    membership.branchId!==input.requestedBranchId ||
    membership.actorUid!==actor.uid||
    !membership.ownerUid||membership.ownerUid.length>160 ||
    !Number.isSafeInteger(membership.authorizationVersion)||
    membership.authorizationVersion<1 ||
    !membership.permittedRoles.includes(actor.role))
    throw new AiNextAuthorizationError('AUTH_MEMBERSHIP_DENIED');
  // Current account model is single-owner UID. A shared multi-UID workspace
  // is not authorized by mere custom role claim: future membership model MUST
  // explicitly enable it after finance security audit.
  if(membership.ownerUid!==actor.uid)
    throw new AiNextAuthorizationError('AUTH_MULTI_UID_NOT_YET_SUPPORTED');
  const scoped:AuthenticatedScope={
    ownerUid:membership.ownerUid,accountId:membership.accountId,
    companyId:membership.companyId,branchId:membership.branchId,
    threadId:input.requestedThreadId,actorId:actor.uid,
    role:actor.role,scopeType:input.scopeType,
    authorizationVersion:membership.authorizationVersion,
  };
  if(!validateAuthenticatedScope(scoped))
    throw new AiNextAuthorizationError('AUTH_INVALID_SCOPE');
  return scoped;
}
