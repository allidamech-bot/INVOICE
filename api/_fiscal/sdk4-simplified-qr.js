import {X509Certificate,verify} from 'node:crypto';

// Independently observed Java SDK 4.0.0 simplified QR profile. This verifies
// the QR and signature against an already trusted invoice hash and leaf bytes;
// it does not verify the full XML stamp, chain, enrollment or authority result.
const need=ok=>{if(!ok)throw Error('SDK4_SIMPLIFIED_QR_INVALID');};
function decoded(value){
  need(typeof value==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(value));
  const bytes=Buffer.from(value,'base64');need(bytes.length>0&&bytes.toString('base64')===value);return bytes;
}
function element(b,start,tag){
  need(start+2<=b.length&&b[start]===tag);let p=start+1,n=b[p++];
  if(n&128){const width=n&127;need(width>0&&width<=3&&p+width<=b.length&&b[p]!==0);n=0;for(let j=0;j<width;j++)n=256*n+b[p++];need(n>=128);}
  need(p+n<=b.length);return {start:p,end:p+n};
}
function certificateSignature(raw){
  const outer=element(raw,0,48),tbs=element(raw,outer.start,48),algorithm=element(raw,tbs.end,48),signature=element(raw,algorithm.end,3);
  need(outer.end===raw.length&&signature.end===outer.end&&raw[signature.start]===0&&signature.end-signature.start>1);
  return raw.subarray(signature.start+1,signature.end);
}
export function verifySdk4SimplifiedQr({payload,invoiceHash,xmlSignature,leafDer,sellerName,vatNumber,timestamp,total,vat}){
  try{
    need(typeof payload==='string'&&payload.length<=700&&Buffer.isBuffer(leafDer)&&leafDer.length>0&&leafDer.length<=32768);
    const h=decoded(invoiceHash),sig=decoded(xmlSignature),leaf=new X509Certificate(leafDer);
    need(h.length===32&&sig.length>=8&&sig.length<=72&&leaf.raw.equals(leafDer)&&!leaf.ca&&leaf.publicKey.asymmetricKeyType==='ec'&&leaf.publicKey.asymmetricKeyDetails?.namedCurve==='secp256k1');
    need(typeof sellerName==='string'&&sellerName.trim().length>0&&typeof vatNumber==='string'&&/^3[0-9]{13}3$/.test(vatNumber));
    need(typeof timestamp==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)&&new Date(timestamp).toISOString()===timestamp.replace('Z','.000Z'));
    need([total,vat].every(v=>typeof v==='string'&&/^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/.test(v))&&BigInt(vat.replace('.',''))<=BigInt(total.replace('.','')));
    const raw=decoded(payload),fields=[];
    for(let i=0;i<raw.length;){need(i+2<=raw.length&&raw[i]===fields.length+1);const n=raw[i+1];i+=2;need(n>0&&i+n<=raw.length);fields.push(raw.subarray(i,i+n));i+=n;}
    const expected=[sellerName,vatNumber,timestamp.slice(0,-1),total,vat,invoiceHash,xmlSignature].map(v=>Buffer.from(v,'utf8'));
    expected.push(leaf.publicKey.export({format:'der',type:'spki'}),certificateSignature(leaf.raw));
    return fields.length===9&&expected.every((v,i)=>v.equals(fields[i]))&&verify('sha256',h,{key:leaf.publicKey,dsaEncoding:'der'},sig);
  }catch{return false;}
}

// Offline encoding boundary for an already issued XML signature. Does not sign,
// provision or trust a certificate, or permit transport without official validation.
export function buildSdk4SimplifiedQr(fields){
  need(fields&&Buffer.isBuffer(fields.leafDer)&&fields.leafDer.length>0&&fields.leafDer.length<=32768);
  const {leafDer,sellerName,vatNumber,timestamp,total,vat,invoiceHash,xmlSignature}=fields;
  need([sellerName,vatNumber,timestamp,total,vat,invoiceHash,xmlSignature].every(v=>typeof v==='string'&&v.length>0&&v.length<=255));
  const leaf=new X509Certificate(leafDer);
  const values=[sellerName,vatNumber,timestamp.slice(0,-1),total,vat,invoiceHash,xmlSignature].map(v=>Buffer.from(v,'utf8'));
  values.push(leaf.publicKey.export({format:'der',type:'spki'}),certificateSignature(leaf.raw));
  need(values.every(v=>v.length>0&&v.length<=255));
  const payload=Buffer.concat(values.map((v,i)=>Buffer.concat([Buffer.from([i+1,v.length]),v]))).toString('base64');
  need(verifySdk4SimplifiedQr({...fields,payload}));
  return payload;
}
