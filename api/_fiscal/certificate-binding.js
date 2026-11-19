import {X509Certificate,createHash,KeyObject} from 'node:crypto';
import {signFiscalCanonicalBytes,verifyFiscalCanonicalBytes} from './fiscal-ecdsa.js';

// Narrow certificate/key-binding checks, NOT full PKIX or ZATCA approval.
// Trusted server supplies immutable EGS enrollment metadata and environment pins.
const DIGEST=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function certificate(bytes){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>32768)throw Error('INVALID_CERTIFICATE');
  let cert;try{cert=new X509Certificate(bytes);}catch{throw Error('INVALID_CERTIFICATE');}
  if(!cert.raw.equals(bytes))throw Error('NONCANONICAL_CERTIFICATE');
  return cert;
}
export function verifyFiscalCertificateBinding({scope,credential,privateKey,chainDer,trustedRootDigests,at}){
  if(!scope||!credential||scope.environment!=='simulation'||credential.environment!==scope.environment||credential.kind!=='operational')throw Error('CERTIFICATE_SCOPE_MISMATCH');
  for(const k of ['accountUid','workspaceId','egsId'])if(typeof scope[k]!=='string'||!ID.test(scope[k])||credential[k]!==scope[k])throw Error('CERTIFICATE_SCOPE_MISMATCH');
  if(typeof credential.leafDigest!=='string'||!DIGEST.test(credential.leafDigest)||!Array.isArray(trustedRootDigests)||!trustedRootDigests.length||trustedRootDigests.some(v=>typeof v!=='string'||!DIGEST.test(v)))throw Error('INVALID_TRUST_CONFIGURATION');
  if(typeof at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)||!Number.isFinite(Date.parse(at))||new Date(at).toISOString()!==at)throw Error('INVALID_SIGNING_TIME');
  const now=Date.parse(at);
  if(!Array.isArray(chainDer)||chainDer.length<2||chainDer.length>8)throw Error('INVALID_CERTIFICATE_CHAIN');
  const chain=chainDer.map(certificate),digests=chain.map(c=>sha(c.raw));
  if(new Set(digests).size!==chain.length||digests[0]!==credential.leafDigest||!trustedRootDigests.includes(digests.at(-1)))throw Error('UNTRUSTED_CERTIFICATE');
  const leaf=chain[0];
  if(leaf.ca||leaf.publicKey.asymmetricKeyType!=='ec'||leaf.publicKey.asymmetricKeyDetails?.namedCurve!=='secp256k1')throw Error('INVALID_LEAF_KEY');
  for(const cert of chain){if(now<Date.parse(cert.validFrom)||now>Date.parse(cert.validTo))throw Error('CERTIFICATE_OUTSIDE_VALIDITY');}
  for(let i=0;i<chain.length-1;i++){
    const child=chain[i],issuer=chain[i+1];
    if(!issuer.ca||!child.checkIssued(issuer)||!child.verify(issuer.publicKey))throw Error('INVALID_CERTIFICATE_CHAIN');
  }
  const root=chain.at(-1);
  if(!root.ca||!root.checkIssued(root)||!root.verify(root.publicKey))throw Error('INVALID_TRUST_ANCHOR');
  if(!(privateKey instanceof KeyObject)||privateKey.type!=='private'||!leaf.checkPrivateKey(privateKey))throw Error('PRIVATE_KEY_MISMATCH');
  return {leaf,certificateDigests:digests};
}
// Returns a signature candidate for canonical SignedInfo bytes only. The final
// signed XML, signed properties digests, policy, revocation and SDK must be
// independently verified. No credentials or keys are returned or logged.
export function signCertificateBoundCandidate(config,signedInfoBytes,encoding){
  const binding=verifyFiscalCertificateBinding(config);
  const signature=signFiscalCanonicalBytes(signedInfoBytes,config.privateKey,encoding);
  if(!verifyFiscalCanonicalBytes(signedInfoBytes,signature,binding.leaf.publicKey,encoding))throw Error('SIGNATURE_VERIFICATION_FAILED');
  return {status:'signature-candidate',signature,certificateDigests:binding.certificateDigests,signedInfoDigest:sha(signedInfoBytes)};
}
