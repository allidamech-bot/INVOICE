import {createProductionScopeAuthority} from './production-scope.js';
import {createProductionEnrollment} from './production-enrollment.js';
import {createProductionManagedKms} from './managed-kms.js';
import {createProductionManagedSigner} from './managed-signing.js';
import {createProductionCredentialVault} from './credential-vault.js';
import {createProductionProtectedSigningSession} from './protected-signing.js';
import {verifyProductionAuthorityCertificate} from './authority-certificate.js';
import {X509Certificate,createHash} from 'node:crypto';
import {normalizeSdk4Proof} from './sdk4-local-validator.js';

// Use on a trusted server supporting the pinned SDK and OpenSSL. This is not
// browser-configurable and must never be instantiated with synthetic adapters.
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code='FISCAL_ENROLLMENT_UNAVAILABLE')=>{if(!ok)throw Error(code);};
export function createProductionEnrollmentRuntime({db,loadWorkspace,kmsProjectId,keyName,getAccessToken,trust,loadCertificateChain,verifyTaxpayerRegistration,verifyOperation,verifyResult,buildComplianceInvoice,verifyComplianceResult,sdkManifestSha256}){
  need(trust?.environment==='production'&&/^[a-f0-9]{64}$/.test(trust.rootDigest??'')&&typeof trust.egsPolicyOid==='string'&&/^[a-f0-9]{64}$/.test(sdkManifestSha256??'')&&[loadCertificateChain,verifyTaxpayerRegistration,verifyOperation,verifyResult,buildComplianceInvoice,verifyComplianceResult,getAccessToken].every(f=>typeof f==='function'));
  const kms=createProductionManagedKms({projectId:kmsProjectId,keyName,getAccessToken});
  let authority;
  const signer=b=>createProductionManagedSigner({projectId:kmsProjectId,binding:b,getAccessToken,authorizeBinding:authority.authorizeBinding});
  authority=createProductionScopeAuthority({db,loadWorkspace,kmsProjectId,verifyOperation,verifyResult,verifyRegistration:verifyTaxpayerRegistration});
  const vault=createProductionCredentialVault({db,...kms,authorizeScope:authority.authorizeCredential});
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
    const c=await certificate(scope,profile,credential);
    return createProductionProtectedSigningSession({projectId:kmsProjectId,scope,binding:profile.binding,credential:{...scope,kind:'operational',issuerVat:profile.issuer.vatNumber,keyVersion:profile.binding.keyVersion,publicKeyDigest:profile.binding.publicKeyDigest,leafDigest:c.digest},chainDer:c.chainDer,crlsDer:c.crlsDer,trust,getAccessToken,authorizeBinding:authority.authorizeBinding});
  }
  const enrollment=createProductionEnrollment({db,authority,vault,resolveSigner:async(_s,b)=>signer(b),
    verifyCredential:async({scope,profile,credential})=>{await certificate(scope,profile,credential);return true;},
    resolveProtectedSession:protectedSession,
    buildComplianceInvoice:async input=>{
      const result=await buildComplianceInvoice(input);
      const bytes=Buffer.from(result.invoice,'base64');
      const proof=normalizeSdk4Proof(result.sdkProof,{uuid:result.uuid,mode:result.mode,artifactDigest:sha(bytes)});
      need(proof.kind===input.type&&proof.installationManifestSha256===sdkManifestSha256,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
      return {...result,verifiedByOfficialSdk:true};
    },verifyComplianceResult
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
  return Object.freeze({authority,enrollment,vault,resolveOperationalCredential,resolveOperationalSession});
}

// The same registration/credential authority owns the commercial issuance
// engine. This explicit trusted factory is not instantiated by the default
// hosted profile handler. It cannot accept a browser-selected signer or vault.
export async function createProductionFiscalRuntime({db,loadWorkspace,enrollmentAdapters,issuanceAdapters}){
  need(enrollmentAdapters&&issuanceAdapters&&issuanceAdapters.sdk?.manifestSha256===enrollmentAdapters.sdkManifestSha256);
  const registered=createProductionEnrollmentRuntime({...enrollmentAdapters,db,loadWorkspace});
  const {createProductionIssuanceRuntime}=await import('./production-issuance-runtime.js');
  const issuance=createProductionIssuanceRuntime({...issuanceAdapters,db,productionAuthority:registered.authority,resolveCredential:registered.resolveOperationalCredential,resolveProtectedSession:registered.resolveOperationalSession});
  return Object.freeze({enrollment:registered.enrollment,authority:registered.authority,issuance});
}
