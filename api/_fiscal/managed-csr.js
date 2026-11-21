import {createHash,createPublicKey,verify} from 'node:crypto';
import {ecdsaDerToP1363} from './managed-signing.js';
import {requiredComplianceChecks} from './onboarding.js';
import {STAGING_PROTECTION,isSoftHsmStagingSigner} from './softhsm-staging-signer.js';
// Environment-specific PKCS#10 candidate, signed by the existing non-exportable HSM.
// ZATCA developer manual extensionRequest layout; authority/SDK acceptance is
// an independent gate, never inferred from local signature verification.
const sha=b=>createHash('sha256').update(b).digest('hex');
const ID=/^[A-Za-z0-9_-]{1,128}$/;
function need(ok,code='INVALID_CSR_PROFILE'){if(!ok)throw Error(code);}
function tlv(tag,bytes){const b=Buffer.from(bytes);need(b.length<=65535,'CSR_SIZE');const n=b.length;return Buffer.concat([Buffer.from(n<128?[tag,n]:n<256?[tag,129,n]:[tag,130,n>>8,n&255]),b]);}
const seq=(...b)=>tlv(0x30,Buffer.concat(b)),set=(...b)=>tlv(0x31,Buffer.concat(b.sort(Buffer.compare)));
function oid(s){
  const a=s.split('.').map(Number);need(a.length>=2&&a.every(n=>Number.isSafeInteger(n)&&n>=0)&&a[0]<=2&&(a[0]===2||a[1]<40));
  const out=[];for(let n of [a[0]*40+a[1],...a.slice(2)]){const digits=[n%128];while(n>=128){n=Math.floor(n/128);digits.unshift((n%128)|128);}out.push(...digits);}
  return tlv(6,Buffer.from(out));
}
function string(v,tag=12,max=256){need(typeof v==='string'&&v.trim()===v&&v.length>0&&Buffer.byteLength(v)<=max&&!/[\x00-\x1f\x7f]/.test(v)&&Buffer.from(v).toString('utf8')===v);if(tag===19)need(/^[A-Za-z0-9 '()+,\-./:=?]+$/.test(v));return tlv(tag,Buffer.from(v));}
const rdn=(o,v,tag=12)=>set(seq(oid(o),string(v,tag)));
const ext=(id,value)=>seq(oid(id),tlv(4,value));
function fields(scope,issuer,unit,spki,binding,environment,softwareStaging=false){
  need(scope?.environment===environment&&['accountUid','workspaceId','egsId'].every(k=>typeof scope[k]==='string'&&ID.test(scope[k])&&binding?.[k]===scope[k])&&binding.environment===environment&&(softwareStaging?environment==='simulation'&&binding.protectionLevel===STAGING_PROTECTION:['HSM','HSM_SINGLE_TENANT'].includes(binding.protectionLevel))&&typeof binding.keyVersion==='string'&&binding.keyVersion&&binding.publicKeyDigest===sha(spki));
  need(issuer?.accountUid===scope.accountUid&&issuer.workspaceId===scope.workspaceId&&issuer.issuerCountry==='SA'&&issuer.saRegime==='phase-2'&&typeof issuer.vatNumber==='string'&&/^3\d{13}3$/.test(issuer.vatNumber));
  need(unit?.egsId===scope.egsId&&typeof unit.serialNumber==='string'&&/^1-[^|\r\n]+\|2-[^|\r\n]+\|3-[^|\r\n]+$/.test(unit.serialNumber));
  requiredComplianceChecks(unit.functionalityMap);
  if(issuer.vatNumber[10]==='1')need(/^\d{10}$/.test(unit.organizationUnit),'CSR_GROUP_TIN_REQUIRED');
  const subject=seq(rdn('2.5.4.6','SA',19),rdn('2.5.4.11',unit.organizationUnit),rdn('2.5.4.10',issuer.legalName),rdn('2.5.4.3',unit.commonName));
  const directory=seq(rdn('2.5.4.4',unit.serialNumber),rdn('0.9.2342.19200300.100.1.1',issuer.vatNumber),rdn('2.5.4.12',unit.functionalityMap),rdn('2.5.4.26',unit.registeredAddress),rdn('2.5.4.15',unit.businessCategory));
  const extensions=seq(ext('1.3.6.1.4.1.311.20.2',string(environment==='production'?'ZATCA-Code-Signing':'PREZATCA-Code-Signing',19)),ext('2.5.29.17',seq(tlv(0xa4,directory))));
  const requestAttribute=seq(oid('1.2.840.113549.1.9.14'),set(extensions));
  const key=createPublicKey({key:spki,format:'der',type:'spki'});
  need(key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails?.namedCurve==='secp256k1'&&key.export({format:'der',type:'spki'}).equals(spki),'CSR_KEY_INVALID');
  return {key,info:seq(tlv(2,Buffer.from([0])),subject,spki,tlv(0xa0,requestAttribute))};
}
function part(b,p,tag){need(p+2<=b.length&&b[p++]===tag,'CSR_DER_INVALID');let n=b[p++];if(n===129||n===130){const count=n-128;need(p+count<=b.length&&b[p]!==0,'CSR_DER_INVALID');n=0;for(let i=0;i<count;i++)n=n*256+b[p++];need(n>=(count===1?128:256),'CSR_DER_INVALID');}else need(n<128,'CSR_DER_INVALID');need(p+n<=b.length,'CSR_DER_INVALID');return {value:b.subarray(p,p+n),end:p+n};}
const algorithm=seq(oid('1.2.840.10045.4.3.2'));
function pem(der){return Buffer.from('-----BEGIN CERTIFICATE REQUEST-----\n'+der.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE REQUEST-----\n');}
function parsePem(bytes){need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=32768,'CSR_DER_INVALID');const m=/^-----BEGIN CERTIFICATE REQUEST-----\n([A-Za-z0-9+/=\n]+)-----END CERTIFICATE REQUEST-----\n$/.exec(bytes.toString('ascii'));need(m,'CSR_DER_INVALID');const der=Buffer.from(m[1].replace(/\n/g,''),'base64');need(pem(der).equals(bytes),'CSR_DER_INVALID');return der;}
async function createManagedCsr({scope,issuer,unit,binding,signer},environment,softwareStaging=false){
  if(softwareStaging)need(environment==='simulation'&&isSoftHsmStagingSigner(signer),'CSR_SIGNER_REQUIRED');
  need(typeof signer?.getPublicKey==='function'&&typeof signer?.sign==='function','CSR_SIGNER_REQUIRED');
  const spki=Buffer.from(await signer.getPublicKey(scope));const {info,key}=fields(scope,issuer,unit,spki,binding,environment,softwareStaging);
  const signature=Buffer.from(await signer.sign(scope,{purpose:'csr',bytes:Buffer.from(info),encoding:'der'}));
  ecdsaDerToP1363(signature);need(verify('sha256',info,key,signature),'CSR_SIGNATURE_INVALID');
  const der=seq(info,algorithm,tlv(3,Buffer.concat([Buffer.from([0]),signature]))),bytes=pem(der);
  return {csr:bytes.toString('base64'),csrDigest:sha(bytes),publicKey:spki.toString('base64')};
}
function verifyManagedCsr({scope,issuer,unit,binding,csr,publicKey},environment,softwareStaging=false){
  try{
    need(typeof publicKey==='string'&&publicKey.length<=2048);const spki=Buffer.from(publicKey,'base64');need(spki.toString('base64')===publicKey);
    const {key,info}=fields(scope,issuer,unit,spki,binding,environment,softwareStaging),der=parsePem(csr),outer=part(der,0,0x30);
    need(outer.end===der.length&&outer.value.subarray(0,info.length).equals(info),'CSR_PROFILE_MISMATCH');
    let p=info.length;need(outer.value.subarray(p,p+algorithm.length).equals(algorithm),'CSR_DER_INVALID');p+=algorithm.length;
    const sig=part(outer.value,p,3);need(sig.end===outer.value.length&&sig.value[0]===0,'CSR_DER_INVALID');
    const bytes=sig.value.subarray(1);ecdsaDerToP1363(bytes);return verify('sha256',info,key,bytes);
  }catch{return false;}
}

export const createManagedSimulationCsr=input=>createManagedCsr(input,'simulation');
export const verifyManagedSimulationCsr=input=>verifyManagedCsr(input,'simulation');
export const createManagedProductionCsr=input=>createManagedCsr(input,'production');
export const verifyManagedProductionCsr=input=>verifyManagedCsr(input,'production');

// Explicit software staging path; existing managed and production paths remain unchanged.
export const createSoftHsmStagingCsr=input=>createManagedCsr(input,'simulation',true);
export const verifySoftHsmStagingCsr=input=>verifyManagedCsr(input,'simulation',true);
