import {KeyObject,createPublicKey,sign,verify} from 'node:crypto';

// Primitive only: XML transforms, XAdES SignedProperties, certificate chain,
// and official SDK acceptance are separate required gates. Input must be the
// exact canonical bytes of the signed XML structure, never a prehashed digest.
function key(value,type){
  if(!(value instanceof KeyObject)||value.type!==type||value.asymmetricKeyType!=='ec'||value.asymmetricKeyDetails?.namedCurve!=='secp256k1')throw Error('INVALID_FISCAL_EC_KEY');
  return value;
}
function bytes(value){
  if(!Buffer.isBuffer(value)||!value.length||value.length>512*1024)throw Error('INVALID_SIGNED_BYTES');
  return value;
}
function encoding(value){
  if(value!=='der'&&value!=='ieee-p1363')throw Error('INVALID_SIGNATURE_ENCODING');
  return value;
}
export function fiscalPublicKeyDer(privateKey){
  return createPublicKey(key(privateKey,'private')).export({type:'spki',format:'der'});
}
export function signFiscalCanonicalBytes(canonicalBytes,privateKey,format){
  return sign('sha256',bytes(canonicalBytes),{key:key(privateKey,'private'),dsaEncoding:encoding(format)});
}
export function verifyFiscalCanonicalBytes(canonicalBytes,signature,publicKey,format){
  bytes(canonicalBytes);key(publicKey,'public');encoding(format);
  if(!Buffer.isBuffer(signature)||!signature.length||signature.length>80||(format==='ieee-p1363'&&signature.length!==64))return false;
  try{return verify('sha256',canonicalBytes,{key:publicKey,dsaEncoding:format},signature);}catch{return false;}
}
