import {createHash} from 'node:crypto';

// Isolated artifact primitives. Do not call these proof of SDK compliance.
// XML hashing requires separately verified ZATCA transforms and C14N 1.1.
export function hashCanonicalInvoice(canonicalBytes){
  if(!Buffer.isBuffer(canonicalBytes)||!canonicalBytes.length||canonicalBytes.length>512*1024)throw Error('INVALID_CANONICAL_XML');
  return createHash('sha256').update(canonicalBytes).digest('base64');
}
export function hashArtifact(bytes){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>512*1024)throw Error('INVALID_ARTIFACT');
  return createHash('sha256').update(bytes).digest('hex');
}
const money=/^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/;
function text(value){
  if(typeof value!=='string'||!value.trim()||/[\u0000-\u001f\u007f]/.test(value)||Buffer.from(value,'utf8').toString('utf8')!==value)throw Error('INVALID_QR_TEXT');
  return Buffer.from(value,'utf8');
}
function fields1to5(data){
  if(!data||typeof data.vatNumber!=='string'||!/^3[0-9]{13}3$/.test(data.vatNumber))throw Error('INVALID_VAT');
  if(typeof data.timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(data.timestamp)
    ||!Number.isFinite(Date.parse(data.timestamp))||new Date(data.timestamp).toISOString()!==data.timestamp.replace('Z','.000Z'))throw Error('INVALID_TIMESTAMP');
  if(typeof data.total!=='string'||typeof data.vat!=='string'||!money.test(data.total)||!money.test(data.vat)
    ||BigInt(data.vat.replace('.',''))>BigInt(data.total.replace('.','')))throw Error('INVALID_TOTALS');
  return [data.sellerName,data.vatNumber,data.timestamp,data.total,data.vat].map(text);
}
function encode(fields){
  const bytes=[];
  for(let i=0;i<fields.length;i++){
    const value=fields[i];
    if(!Buffer.isBuffer(value)||!value.length||value.length>255)throw Error('INVALID_TLV_LENGTH');
    bytes.push(Buffer.from([i+1,value.length]),value);
  }
  const payload=Buffer.concat(bytes).toString('base64');
  if(payload.length>700)throw Error('QR_TOO_LARGE');
  return payload;
}
export function phase1QrPayload(data){
  return encode(fields1to5(data));
}
// Phase 2 candidate only: cryptographic fields are exact bytes supplied by a
// trusted signing/SDK adapter. The official document describes a 32-byte hash;
// SDK-specific representation must be verified against official test vectors.
export function phase2QrCandidate(data,{mode,invoiceHash,signature,publicKey,caSignature}){
  if(mode!=='simplified'&&mode!=='standard')throw Error('INVALID_QR_MODE');
  if(!Buffer.isBuffer(invoiceHash)||invoiceHash.length!==32)throw Error('INVALID_INVOICE_HASH');
  if(mode==='standard'&&caSignature!==undefined)throw Error('UNEXPECTED_CA_SIGNATURE');
  return encode([...fields1to5(data),invoiceHash,signature,publicKey,...(mode==='simplified'?[caSignature]:[])]);
}
export function decodeFiscalQr(payload,mode){
  const count=mode==='phase1'?5:mode==='standard'?8:mode==='simplified'?9:0;
  if(!count||typeof payload!=='string'||!payload.length||payload.length>700||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload))throw Error('INVALID_QR');
  const bytes=Buffer.from(payload,'base64');
  if(bytes.toString('base64')!==payload)throw Error('INVALID_QR');
  const fields=[];
  for(let i=0;i<bytes.length;){
    if(i+2>bytes.length||bytes[i]!==fields.length+1)throw Error('INVALID_TLV_TAG');
    const length=bytes[i+1];i+=2;
    if(!length||i+length>bytes.length)throw Error('INVALID_TLV_LENGTH');
    fields.push(Buffer.from(bytes.subarray(i,i+length)));i+=length;
  }
  if(fields.length!==count)throw Error('INVALID_FIELD_COUNT');
  const [sellerName,vatNumber,timestamp,total,vat]=fields.slice(0,5).map(value=>new TextDecoder('utf-8',{fatal:true}).decode(value));
  const expected=fields1to5({sellerName,vatNumber,timestamp,total,vat});
  if(!expected.every((value,i)=>value.equals(fields[i])))throw Error('INVALID_QR_TEXT');
  if(count>5&&fields[5].length!==32)throw Error('INVALID_INVOICE_HASH');
  return fields.map((value,i)=>({tag:i+1,value}));
}
