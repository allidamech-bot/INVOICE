import {createProductionScopeAuthority} from './production-scope.js';
import {createProductionEnrollment} from './production-enrollment.js';
import {createProductionManagedKms} from './managed-kms.js';
import {createProductionManagedSigner} from './managed-signing.js';
import {createProductionCredentialVault} from './credential-vault.js';
import {createProductionProtectedSigningSession,createProductionComplianceSigningSession} from './protected-signing.js';
import {verifyProductionAuthorityCertificate} from './authority-certificate.js';
import {X509Certificate,createHash} from 'node:crypto';
import {createProductionJournalVerification} from './production-journal-verification.js';
import {createProductionRegistrationCoordinator} from './production-registration-coordinator.js';
import {createProductionComplianceBuilder} from './production-compliance-builder.js';
import {createProductionProvisioningBridge} from './production-provisioning-bridge.js';

// Use on a trusted server supporting the pinned SDK and OpenSSL. This is not
// browser-configurable and must never be instantiated with synthetic adapters.
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code='FISCAL_ENROLLMENT_UNAVAILABLE')=>{if(!ok)throw Error(code);};
export function createProductionEnrollmentRuntime({db,loadWorkspace,kmsProjectId,keyName,getAccessToken,trust,loadCertificateChain,verifyTaxpayerRegistration,sdk,canonicalize,policy,clearance,testBuyer,sdkManifestSha256,authorizeOperator,verifyTaxpayerEligibility,resolveApprovedHsmKey}){
  need(trust?.environment==='production'&&/^[a-f0-9]{64}$/.test(trust.rootDigest??'')&&typeof trust.egsPolicyOid==='string'&&/^[a-f0-9]{64}$/.test(sdkManifestSha256??'')&&sdk?.manifestSha256===sdkManifestSha256&&policy&&[loadCertificateChain,verifyTaxpayerRegistration,canonicalize,getAccessToken].every(f=>typeof f==='function'));
  const kms=createProductionManagedKms({projectId:kmsProjectId,keyName,getAccessToken});
  let authority,vault;
  const journal=createProductionJournalVerification({db,getAuthority:()=>authority,getVault:()=>vault,verifyCertificate:certificate,manifestSha256:sdkManifestSha256,canonicalize,policy,clearance});
  const signer=b=>createProductionManagedSigner({projectId:kmsProjectId,binding:b,getAccessToken,authorizeBinding:authority.authorizeBinding});
  authority=createProductionScopeAuthority({db,loadWorkspace,kmsProjectId,sdkManifestSha256,verifyOperation:journal.verifyOperation,verifyResult:journal.verifyResult,verifyRegistration:verifyTaxpayerRegistration});
  vault=createProductionCredentialVault({db,...kms,authorizeScope:authority.authorizeCredential});
  async function certificate(scope,profile,credential){
    need(credential.environment==='production'&&['accountUid','workspaceId','egsId'].every(k=>credential[k]===scope[k]));
    const leaf=new X509Certificate(Buffer.from(credential.binarySecurityToken,'base64')),digest=sha(leaf.raw);
    need(sha(leaf.publicKey.export({type:'spki',format:'der'}))===profile.binding.publicKeyDigest);
    // Chain and revocation list come from a trusted resolver; never from a
    // request or from an embedded self-asserted root. Verify pinned PKIX.
    const {chainDer,crlsDer,identityVerified}=await loadCertificateChain({scope,profile,credentialKind:credential.kind,leafDer:leaf.raw});
    need(identityVerified===true&&Buffer.isBuffer(chainDer?.[0])&&chainDer[0].equals(leaf.raw));
    const at=new Date().toISOString();
    need(verifyProductionAuthorityCertificate({environment:'production',chainDer,crlsDer,trust:{environment:'production',rootDigest:trust.rootDigest,authoritySignerDigests:[digest],policyOid:trust.egsPolicyOid,curve:'secp256k1'},signedAt:at,observedAt:at}));
    return {digest,chainDer,crlsDer};
  }
  async function protectedSession(scope,profile,credential){
    need(credential.kind==='production'||credential.kind==='compliance'&&profile.state==='enrolling');
    const c=await certificate(scope,profile,credential);
    const compliance=credential.kind==='compliance';
    return (compliance?createProductionComplianceSigningSession:createProductionProtectedSigningSession)({projectId:kmsProjectId,scope,binding:profile.binding,credential:{...scope,kind:compliance?'compliance':'operational',issuerVat:profile.issuer.vatNumber,keyVersion:profile.binding.keyVersion,publicKeyDigest:profile.binding.publicKeyDigest,leafDigest:c.digest},chainDer:c.chainDer,crlsDer:c.crlsDer,trust,getAccessToken,authorizeBinding:authority.authorizeBinding});
  }
  const buildComplianceInvoice=createProductionComplianceBuilder({db,authority,loadWorkspace,resolveComplianceSession:protectedSession,sdk,canonicalize,policy,testBuyer});
  const enrollment=createProductionEnrollment({db,authority,vault,resolveSigner:async(_s,b)=>signer(b),
    verifyCredential:async({scope,profile,credential})=>{await certificate(scope,profile,credential);return true;},
    resolveProtectedSession:protectedSession,
    buildComplianceInvoice,sdkManifestSha256
  });
  async function activeCredential(scope,issuer){
    const profile=await db.runTransaction(tx=>authority.readUnit(tx,scope));
    need(profile.state==='active'&&profile.operationalCredentialRef&&profile.certificateDigest);
    if(issuer)need(['accountUid','workspaceId','issuerCountry','saRegime','vatNumber','legalName','effectiveFrom','profileVersion'].every(k=>issuer[k]===profile.issuer[k]));
    const credential=await vault.load(scope,profile.operationalCredentialRef,'production');
    const c=await certificate(scope,profile,credential);
    need(c.digest===profile.certificateDigest,'FISCAL_ISSUANCE_CERTIFICATE_CHANGED');
    return {profile,credential};
  }
  async function resolveOperationalCredential(scope){return (await activeCredential(scope)).credential;}
  async function resolveOperationalSession(scope,issuer){const {profile,credential}=await activeCredential(scope,issuer);return protectedSession(scope,profile,credential);}
  const registerVerifiedUnit=createProductionRegistrationCoordinator({db,loadWorkspace,authority,kmsProjectId,getAccessToken});
  // The EGS registration operator is independent of commercial issuance.
  // Customer requests are only actionable when all external authorizers exist.
  const provisioningReady=[authorizeOperator,verifyTaxpayerEligibility,resolveApprovedHsmKey]
    .every(f=>typeof f==='function');
  const provisionRequestedUnit=provisioningReady?createProductionProvisioningBridge({
    db,loadWorkspace,registerVerifiedUnit,
    readRegisteredUnit:authority.readUnit,
    authorizeOperator,verifyTaxpayerEligibility,resolveApprovedHsmKey,
  }):undefined;
  return Object.freeze({authority,enrollment,vault,registerVerifiedUnit,
    provisionRequestedUnit,resolveOperationalCredential,resolveOperationalSession});
}

// The same registration/credential authority owns the commercial issuance
// engine. This explicit trusted factory is not instantiated by the default
// hosted profile handler. It cannot accept a browser-selected signer or vault.
export async function createProductionFiscalRuntime({db,loadWorkspace,enrollmentAdapters,issuanceAdapters}){
  need(enrollmentAdapters&&issuanceAdapters&&issuanceAdapters.sdk?.manifestSha256===enrollmentAdapters.sdkManifestSha256);
  const registered=createProductionEnrollmentRuntime({...enrollmentAdapters,sdk:issuanceAdapters.sdk,canonicalize:issuanceAdapters.canonicalize,policy:issuanceAdapters.policy,clearance:issuanceAdapters.clearance,db,loadWorkspace});
  const {createProductionIssuanceRuntime}=await import('./production-issuance-runtime.js');
  const issuance=createProductionIssuanceRuntime({...issuanceAdapters,db,productionAuthority:registered.authority,resolveCredential:registered.resolveOperationalCredential,resolveProtectedSession:registered.resolveOperationalSession});
  // A persisted active flag is not proof that a current, tenant-bound,
  // non-revoked operational certificate and HSM signing context remain usable.
  // This is private readiness evidence only; no session or keys reach a client.
  async function verifyIssuanceReady(scope){
    const {requireProtectedSigningSession}=await import('./protected-signing.js');
    const session=requireProtectedSigningSession(await registered.resolveOperationalSession(scope));
    return session.credentialKind==='operational'&&session.scope.environment==='production'&&
      ['accountUid','workspaceId','egsId'].every(k=>session.scope[k]===scope[k]);
  }
  // Keep the same independently authorized provisioning service for
  // enrollment-only and enrollment+issuance compositions.
  const provisionRequestedUnit=registered.provisionRequestedUnit;
  // Separate immutable, independently approved emergency hold. This does not
  // enable a browser suspension route or an automatic reactivation path.
  let holdUnit;
  if(typeof enrollmentAdapters.authorizeOperator==='function'&&
    typeof enrollmentAdapters.verifyHoldEvidence==='function'){
    const {createProductionSecurityHold}=await import('./production-security-hold.js');
    holdUnit=createProductionSecurityHold({db,
      authorizeOperator:enrollmentAdapters.authorizeOperator,
      verifyEvidence:enrollmentAdapters.verifyHoldEvidence});
  }
  return Object.freeze({enrollment:registered.enrollment,authority:registered.authority,
    registerVerifiedUnit:registered.registerVerifiedUnit,
    provisionRequestedUnit,holdUnit,issuance,verifyIssuanceReady});
}
