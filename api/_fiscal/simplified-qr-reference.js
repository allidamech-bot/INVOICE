import {X509Certificate} from 'node:crypto';
import {buildDomesticFiscalCandidate} from './ubl-draft.js';
import {buildSimplifiedXadesReference,verifySimplifiedXadesReference} from './xades-reference.js';
import {verifyFiscalCertificateBinding} from './certificate-binding.js';
import {signFiscalCanonicalBytes,verifyFiscalCanonicalBytes} from './fiscal-ecdsa.js';
import {phase2QrCandidate,decodeFiscalQr,hashCanonicalInvoice,hashArtifact} from './fiscal-artifacts.js';

// Offline reference only: obtain fields from the same UBL model, not separately
// supplied UI totals. Official SDK representation of tags 7-9 is still a gate.
const MARK='<cac:Signature>';
const BEGIN='<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">';
const END='</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>';
const MAX=512*1024;
function text(bytes){if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX)throw Error('INVALID_QR_XML');return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
function model(invoice){if(invoice?.mode!=='simplified')throw Error('SIMPLIFIED_ONLY');const out=buildDomesticFiscalCandidate(invoice);return {unsigned:out.bytes,fields:{sellerName:invoice.seller.name,vatNumber:invoice.seller.vatNumber,timestamp:invoice.issueDate+'T'+invoice.issueTime+'Z',total:out.totals.taxInclusiveTotal,vat:out.totals.vatTotal}};}
// Only read the outer Certificate SEQUENCE's three DER elements. The leaf
// signatureValue is the CA signature BIT STRING, not a caller-supplied blob.
function derElement(buf,start,tag){
  if(start+2>buf.length||buf[start]!==tag)throw Error('INVALID_CERTIFICATE_DER');
  let p=start+1,n=buf[p++];
  if(n&128){const count=n&127;if(!count||count>3||p+count>buf.length||buf[p]===0)throw Error('INVALID_CERTIFICATE_DER');n=0;for(let i=0;i<count;i++)n=n*256+buf[p++];if(n<128)throw Error('INVALID_CERTIFICATE_DER');}
  if(p+n>buf.length)throw Error('INVALID_CERTIFICATE_DER');return {start:p,end:p+n};
}
function certParts(chain){
  if(!Array.isArray(chain)||chain.length<2||chain.length>8)throw Error('INVALID_CERTIFICATE_CHAIN');
  const leaf=new X509Certificate(chain[0]),issuer=new X509Certificate(chain[1]);
  if(!Buffer.isBuffer(chain[0])||!leaf.raw.equals(chain[0])||leaf.ca||!issuer.ca||!leaf.checkIssued(issuer)||!leaf.verify(issuer.publicKey)||leaf.publicKey.asymmetricKeyType!=='ec'||leaf.publicKey.asymmetricKeyDetails?.namedCurve!=='secp256k1'||issuer.publicKey.asymmetricKeyType!=='ec')throw Error('INVALID_QR_CERTIFICATE');
  const raw=leaf.raw,outer=derElement(raw,0,48);if(outer.end!==raw.length)throw Error('INVALID_CERTIFICATE_DER');
  const tbs=derElement(raw,outer.start,48),alg=derElement(raw,tbs.end,48),sig=derElement(raw,alg.end,3);
  if(sig.end!==outer.end||raw[sig.start]!==0||sig.end-sig.start<2||sig.end-sig.start>81)throw Error('INVALID_CA_SIGNATURE');
  return {leaf,publicKey:leaf.publicKey.export({format:'der',type:'spki'}),caSignature:Buffer.from(raw.subarray(sig.start+1,sig.end))};
}
function insert(signed,payload){
  const xml=text(signed);if(xml.split(MARK).length!==2||xml.includes('<cbc:ID>QR</cbc:ID>'))throw Error('INVALID_QR_POSITION');
  const bytes=Buffer.from(xml.replace(MARK,BEGIN+payload+END+MARK));text(bytes);return bytes;
}
function split(bytes){
  const xml=text(bytes),start=xml.indexOf(BEGIN),end=xml.indexOf(END,start+BEGIN.length);
  if(start<0||end<0||xml.indexOf(BEGIN,start+1)!==-1||xml.split('<cbc:ID>QR</cbc:ID>').length!==2||!xml.startsWith(MARK,end+END.length))throw Error('INVALID_QR_POSITION');
  const payload=xml.slice(start+BEGIN.length,end);
  return {payload,signed:Buffer.from(xml.slice(0,start)+xml.slice(end+END.length))};
}
export function buildSimplifiedQrReference({invoice,certificateConfig,policy,canonicalize}){
  const {unsigned,fields}=model(invoice);verifyFiscalCertificateBinding(certificateConfig);
  const stamped=buildSimplifiedXadesReference({unsigned,certificateConfig,policy,canonicalize});
  const canonical=canonicalize(stamped.bytes,'invoice');
  const {publicKey,caSignature}=certParts(certificateConfig.chainDer);
  // Tag 7 reference: SHA-256/ECDSA over canonical invoice bytes (one hash),
  // distinct from the XAdES signature over canonical SignedInfo. Do not infer
  // that the SDK uses this representation until official fixtures pass.
  const signature=signFiscalCanonicalBytes(canonical,certificateConfig.privateKey,'ieee-p1363');
  const payload=phase2QrCandidate(fields,{mode:'simplified',invoiceHash:Buffer.from(stamped.invoiceHash,'base64'),signature,publicKey,caSignature});
  const bytes=insert(stamped.bytes,payload);
  if(!verifySimplifiedQrReference({invoice,bytes,chain:certificateConfig.chainDer,at:certificateConfig.at,policy,canonicalize}))throw Error('QR_REFERENCE_VERIFICATION_FAILED');
  return {status:'offline-xades-qr-reference',bytes,payload,invoiceHash:stamped.invoiceHash,artifactDigest:hashArtifact(bytes)};
}
export function verifySimplifiedQrReference({invoice,bytes,chain,at,policy,canonicalize}){
  try{
    const {unsigned,fields}=model(invoice),{payload,signed}=split(bytes),{leaf,publicKey,caSignature}=certParts(chain);
    if(!verifySimplifiedXadesReference({unsigned,bytes:signed,chain,at,policy,canonicalize}))return false;
    const canonical=canonicalize(signed,'invoice');if(!canonical.equals(canonicalize(bytes,'invoice')))return false;
    if(!canonicalize(signed,'signed-info').equals(canonicalize(bytes,'signed-info'))||!canonicalize(signed,'signed-properties').equals(canonicalize(bytes,'signed-properties')))return false;
    const decoded=decodeFiscalQr(payload,'simplified'),signature=decoded[6].value;
    if(!verifyFiscalCanonicalBytes(canonical,signature,leaf.publicKey,'ieee-p1363'))return false;
    const expected=phase2QrCandidate(fields,{mode:'simplified',invoiceHash:Buffer.from(hashCanonicalInvoice(canonical),'base64'),signature,publicKey,caSignature});
    return expected===payload&&bytes.equals(insert(signed,expected));
  }catch{return false;}
}
