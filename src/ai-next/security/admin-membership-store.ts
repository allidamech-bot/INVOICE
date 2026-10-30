/**
 * R07B3 — server-only ACL READ adapter for an isolated Firestore namespace.
 *
 * The client-writable /users/{uid}/... tree is intentionally NEVER consulted.
 * A privileged server database interface must be injected; this module cannot
 * provision memberships, create authority, or alter Firebase rules.
 *
 * IMPORTANT: checked-in firestore.rules defaults this root collection to
 * deny client access. Deployed rules and Admin IAM are UNVERIFIED. Do NOT
 * activate until live root-deny test and controlled provisioning are approved.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import type {ServerMembership} from '../conversation-state/auth-boundary.js';
import type {R07ServerMembershipStore} from './server-membership.js';

export const R07B3_MEMBERSHIP_PRODUCTION_ENABLED=false as const;
export const R07B3_COLLECTION='aiNextAuthMembershipsV1';
const VALID_ROLES=new Set<AuthenticatedScope['role']>([
  'owner','admin','finance','sales','purchasing','viewer',
]);
const validId=(x:unknown):x is string=>
  typeof x==='string'&&x.length>=1&&x.length<=160&&
  /^[A-Za-z0-9._:-]+$/.test(x);
const safeUid=(x:unknown):x is string=>
  typeof x==='string'&&x.length>=1&&x.length<=128&&
  /^[A-Za-z0-9_-]+$/.test(x);
const record=(x:unknown):x is Record<string,unknown>=>
  x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const plainStringArray=(x:unknown):x is AuthenticatedScope['role'][]=>
  Array.isArray(x)&&x.length>=1&&x.length<=6&&
  new Set(x).size===x.length&&x.every(role=>VALID_ROLES.has(role));
const strict=(obj:Record<string,unknown>,keys:string[]):boolean=>
  Object.keys(obj).sort().join('|')===keys.sort().join('|');

export interface R07B3AdminSnapshot {
  exists:boolean;
  data():unknown;
}
export interface R07B3AdminDatabase {
  collection(name:string):{
    doc(documentId:string):{get():Promise<R07B3AdminSnapshot>};
  };
}
export type R07B3MemberRow={
  accountId:string;companyId:string;branchId:string;
  active:boolean;permittedRoles:AuthenticatedScope['role'][];
};
export type R07B3MembershipDocument={
  schemaVersion:1;ownerUid:string;actorUid:string;
  active:boolean;authorizationVersion:number;
  memberships:R07B3MemberRow[];
};
function parseDocument(raw:unknown,uid:string):R07B3MembershipDocument|null{
  if(!record(raw)||!strict(raw,[
    'schemaVersion','ownerUid','actorUid','active','authorizationVersion','memberships',
  ])||raw.schemaVersion!==1||raw.ownerUid!==uid||raw.actorUid!==uid||
    raw.active!==true||!Number.isSafeInteger(raw.authorizationVersion)||
    (raw.authorizationVersion as number)<1||
    !Array.isArray(raw.memberships)||raw.memberships.length<1||
    raw.memberships.length>100)return null;
  const tuples=new Set<string>();
  for(const value of raw.memberships){
    if(!record(value)||!strict(value,[
      'accountId','companyId','branchId','active','permittedRoles',
    ])||!validId(value.accountId)||!validId(value.companyId)||
      !validId(value.branchId)||typeof value.active!=='boolean'||
      !plainStringArray(value.permittedRoles))return null;
    const key=JSON.stringify([value.accountId,value.companyId,value.branchId]);
    if(tuples.has(key))return null;
    tuples.add(key);
  }
  return structuredClone(raw) as R07B3MembershipDocument;
}
export class R07B3AdminMembershipStore implements R07ServerMembershipStore{
  constructor(private readonly database:R07B3AdminDatabase){}
  async readForActor(input:{
    verifiedUid:string;accountId:string;companyId:string;branchId:string;
  }):Promise<ServerMembership|null>{
    if(!safeUid(input.verifiedUid)||!validId(input.accountId)||
      !validId(input.companyId)||!validId(input.branchId))return null;
    // Only trusted server credentials must reach this collection. No writes
    // and no implicit lookup of client-writable workspace/vault documents.
    const ref=this.database.collection(R07B3_COLLECTION).doc(input.verifiedUid);
    const snapshot=await ref.get(); // unavailable DB => reject, no client fallback
    if(!snapshot.exists)return null;
    const saved=parseDocument(snapshot.data(),input.verifiedUid);
    if(!saved)return null;
    const found=saved.memberships.find(row=>
      row.accountId===input.accountId&&row.companyId===input.companyId&&
      row.branchId===input.branchId);
    if(!found||!found.active)return null;
    return {
      ownerUid:saved.ownerUid,actorUid:saved.actorUid,
      accountId:found.accountId,companyId:found.companyId,
      branchId:found.branchId,permittedRoles:[...found.permittedRoles],
      authorizationVersion:saved.authorizationVersion,active:true,
    };
  }
}
