import {createHash,X509Certificate,verify} from 'node:crypto';
import {createQaManagedSigner} from './managed-signing.js';
import {verifyAuthorityCertificate} from './authority-certificate.js';

// Trusted server composition only. Use a distinct enrollment pin and policy,
// NOT the clearance authority's leaf pin. No exportable key enters this path.
const sessions=new WeakSet();
const keys=['environment','accountUid','workspaceId','egsId'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const equalScope=(a,b)=>a&&b&&keys.every(k=>typeof a[k]==='string'&&a[k]===b[k]);
export function requireProtectedSigningSession(s){if(!sessions.has(s))throw Error('PROTECTED_SIGNING_SESSION_REQUIRED');return s;}
export async function createProtectedSigningSession({projectId,scope,credential,binding,chainDer,crlsDer,trust,clock=()=>new Date().toISOString(),getAccessToken,fetchImpl,timeoutMs}){
  if(scope?.environment!=='simulation'||!equalScope(scope,credential)||!equalScope(scope,binding)||credential.kind!=='operational'||typeof credential.issuerVat!=='string'||!/^3[0-9]{13}3$/.test(credential.issuerVat)||credential.keyVersion!==binding.keyVersion||credential.publicKeyDigest!==binding.publicKeyDigest||credential.privateKey!==undefined||binding.privateKey!==undefined||trust?.environment!=='simulation'||typeof trust.rootDigest!=='string'||typeof trust.egsPolicyOid!=='string'||typeof clock!=='function'||!Array.isArray(chainDer)||chainDer.length<2||chainDer.length>8||chainDer.some(b=>!Buffer.isBuffer(b)||!b.length||b.length>32768)||!Array.isArray(crlsDer)||crlsDer.some(b=>!Buffer.isBuffer(b)||!b.length||b.length>256*1024))throw Error('PROTECTED_SIGNING_NOT_CONFIGURED');
  const s=Object.freeze(Object.fromEntries(keys.map(k=>[k,scope[k]]))),chain=chainDer.map(b=>Buffer.from(b)),lists=crlsDer.map(b=>Buffer.from(b));
  if(hash(chain[0])!==credential.leafDigest)throw Error('EGS_CERTIFICATE_MISMATCH');
  const pins={environment:'simulation',rootDigest:trust.rootDigest,authoritySignerDigests:[credential.leafDigest],policyOid:trust.egsPolicyOid,curve:'secp256k1'};
  const at=clock(),leaf=new X509Certificate(chain[0]),spki=leaf.publicKey.export({type:'spki',format:'der'});
  if(hash(spki)!==binding.publicKeyDigest)throw Error('EGS_PUBLIC_KEY_MISMATCH');
  function checkTrust(){
    const observedAt=clock();
    const age=Date.parse(observedAt)-Date.parse(at);
    if(!Number.isFinite(age)||age<0||age>300000||!verifyAuthorityCertificate({environment:'simulation',chainDer:chain,crlsDer:lists,trust:pins,signedAt:at,observedAt})||!verifyAuthorityCertificate({environment:'simulation',chainDer:chain,crlsDer:lists,trust:pins,signedAt:observedAt,observedAt}))throw Error('EGS_CERTIFICATE_NOT_VERIFIED');
  }
  checkTrust();
  const signer=createQaManagedSigner({projectId,binding,getAccessToken,fetchImpl,timeoutMs});
  if(!(await signer.getPublicKey(s)).equals(spki))throw Error('EGS_PUBLIC_KEY_MISMATCH');
  const session=Object.freeze({
    at,issuerVat:credential.issuerVat,scope:s,get chainDer(){return chain.map(b=>Buffer.from(b));},
    async sign(purpose,bytes){
      // SDK4 signs the decoded invoice hash as message bytes, not as a prehashed input.
      // Keep DER confined to this purpose; all existing consumers retain P1363.
      const sdk4=purpose==='sdk4-invoice-hash';
      if(!['xades-signed-info','simplified-qr','pades-signed-attributes','sdk4-invoice-hash'].includes(purpose)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>512*1024||(sdk4&&bytes.length!==32))throw Error('PROTECTED_SIGNING_INPUT_INVALID');
      const encoding=sdk4?'der':'ieee-p1363';
      const original=Buffer.from(bytes);checkTrust();
      const signature=await signer.sign(s,{purpose,bytes:original,encoding});
      checkTrust();if(!verify('sha256',original,{key:leaf.publicKey,dsaEncoding:encoding},signature))throw Error('EGS_SIGNATURE_MISMATCH');
      return signature;
    }
  });sessions.add(session);return session;
}
