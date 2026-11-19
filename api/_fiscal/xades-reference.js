import {createHash,X509Certificate} from 'node:crypto';
import {verifyFiscalCertificateBinding,signCertificateBoundCandidate} from './certificate-binding.js';
import {verifyFiscalCanonicalBytes} from './fiscal-ecdsa.js';
import {requireProtectedSigningSession} from './protected-signing.js';
import {hashCanonicalInvoice,hashArtifact} from './fiscal-artifacts.js';

// Offline reference only. Never pass these candidates to the ledger/transport.
// Canonicalizer is a trusted C14N 1.1 implementation, not a browser callback.
const CAP=512*1024;
const C14N='http://www.w3.org/2006/12/xml-c14n11';
const DS='http://www.w3.org/2000/09/xmldsig#';
const XA='http://uri.etsi.org/01903/v1.3.2#';
const SHA='http://www.w3.org/2001/04/xmlenc#sha256';
const ECDSA='http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256';
const EXT='urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const SIG='urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
const SAC='urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2';
const SBC='urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2';
const root='<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">';
const hash=bytes=>createHash('sha256').update(bytes).digest('base64');
const enc=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function checkedBytes(value){if(!Buffer.isBuffer(value)||!value.length||value.length>CAP)throw Error('INVALID_XADES_BYTES');return value;}
function unsignedText(bytes){
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(checkedBytes(bytes));
  // Exact root from the existing UBL candidate writer; do not accept third-party XML.
  if(!xml.startsWith(root)||!xml.endsWith('</Invoice>')||/<[!?]/.test(xml.slice(root.length))||/<(?!\/?(?:cbc:|cac:|Invoice>))/.test(xml.slice(root.length))||/<cac:Signature\b|<cbc:ID>QR<\/cbc:ID>|xmlns(?::|\s*=)/.test(xml.slice(root.length)))throw Error('UNSUPPORTED_UNSIGNED_XML');
  if(!/<cbc:InvoiceTypeCode name="0200000">(?:388|381|383)<\/cbc:InvoiceTypeCode>/.test(xml))throw Error('SIMPLIFIED_CANDIDATE_ONLY');
  const marker='<cac:AccountingSupplierParty>';
  if(xml.split(marker).length!==2)throw Error('INVALID_SUPPLIER_POSITION');
  return xml;
}
function policyXml(policy){
  // No guessed official policy digest. Require caller-pinned policy document bytes.
  if(!policy||typeof policy.identifier!=='string'||policy.identifier.length>512||!/^https:\/\/(?:www\.)?zatca\.gov\.sa\/[A-Za-z0-9_./%-]+$/.test(policy.identifier)||typeof policy.sha256!=='string'||!/^[a-f0-9]{64}$/.test(policy.sha256))throw Error('INVALID_SIGNATURE_POLICY');
  const document=checkedBytes(policy.documentBytes);
  if(hashArtifact(document)!==policy.sha256)throw Error('SIGNATURE_POLICY_DIGEST_MISMATCH');
  return '<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId><xades:Identifier>'+enc(policy.identifier)+'</xades:Identifier></xades:SigPolicyId><xades:SigPolicyHash>'+digest(hash(document))+'</xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>';
}
function digest(value){return '<ds:DigestMethod Algorithm="'+SHA+'"/><ds:DigestValue>'+value+'</ds:DigestValue>';}
function properties(chain,at,policy){
  return '<ds:Object><xades:QualifyingProperties xmlns:xades="'+XA+'" Target="#signature"><xades:SignedProperties Id="xadesSignedProperties"><xades:SignedSignatureProperties><xades:SigningTime>'+at+'</xades:SigningTime><xades:SigningCertificateV2>'+chain.map(c=>'<xades:Cert><xades:CertDigest>'+digest(hash(c))+'</xades:CertDigest></xades:Cert>').join('')+'</xades:SigningCertificateV2>'+policyXml(policy)+'</xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#invoiceSignedData"><xades:MimeType>text/xml</xades:MimeType></xades:DataObjectFormat></xades:SignedDataObjectProperties></xades:SignedProperties></xades:QualifyingProperties></ds:Object>';
}
// XPath 1.0 conditions apply to the current node and its ancestors. SDK
// compatibility of these transforms and signature representation remains open.
function signedInfo(invoiceDigest,propertiesDigest){
  const filters=['not(ancestor-or-self::ext:UBLExtensions)','not(ancestor-or-self::cac:Signature)',"not(ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])"];
  const transform=filters.map(x=>'<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>'+x+'</ds:XPath></ds:Transform>').join('');
  return '<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="'+C14N+'"/><ds:SignatureMethod Algorithm="'+ECDSA+'"/><ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>'+transform+'<ds:Transform Algorithm="'+C14N+'"/></ds:Transforms>'+digest(invoiceDigest)+'</ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#xadesSignedProperties"><ds:Transforms><ds:Transform Algorithm="'+C14N+'"/></ds:Transforms>'+digest(propertiesDigest)+'</ds:Reference></ds:SignedInfo>';
}
function assemble(xml,chain,props,info,signature){
  const extension='<ext:UBLExtensions xmlns:ext="'+EXT+'"><ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent><sig:UBLDocumentSignatures xmlns:sig="'+SIG+'" xmlns:sac="'+SAC+'" xmlns:sbc="'+SBC+'"><sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID><sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID><ds:Signature xmlns:ds="'+DS+'" Id="signature">'+info+'<ds:SignatureValue>'+signature+'</ds:SignatureValue><ds:KeyInfo><ds:X509Data>'+chain.map(c=>'<ds:X509Certificate>'+c.toString('base64')+'</ds:X509Certificate>').join('')+'</ds:X509Data></ds:KeyInfo>'+props+'</ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>';
  const reference='<cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>';
  return checkedBytes(Buffer.from(root+extension+xml.slice(root.length).replace('<cac:AccountingSupplierParty>',reference+'<cac:AccountingSupplierParty>')));
}
function referenceParts(unsigned,chain,at,policy,canonicalize){
  if(typeof canonicalize!=='function')throw Error('CANONICALIZER_REQUIRED');
  const xml=unsignedText(unsigned),canonical=(bytes,mode)=>checkedBytes(canonicalize(bytes,mode));
  const original=canonical(unsigned,'invoice'),invoiceHash=hashCanonicalInvoice(original),props=properties(chain,at,policy);
  const empty=Buffer.alloc(32).toString('base64');
  const draft=assemble(xml,chain,props,signedInfo(invoiceHash,empty),'');
  if(!original.equals(canonical(draft,'invoice')))throw Error('INVOICE_TRANSFORM_MISMATCH');
  const propertiesDigest=hash(canonical(draft,'signed-properties'));
  const info=signedInfo(invoiceHash,propertiesDigest);
  const skeleton=assemble(xml,chain,props,info,'');
  const signedBytes=canonical(skeleton,'signed-info');
  return {xml,props,info,invoiceHash,propertiesDigest,signedBytes,canonical,original};
}
export function buildSimplifiedXadesReference({unsigned,certificateConfig,policy,canonicalize}){
  const {leaf}=verifyFiscalCertificateBinding(certificateConfig);
  const chain=certificateConfig.chainDer;
  const p=referenceParts(unsigned,chain,certificateConfig.at,policy,canonicalize);
  const signature=signCertificateBoundCandidate(certificateConfig,p.signedBytes,'ieee-p1363').signature;
  const bytes=assemble(p.xml,chain,p.props,p.info,signature.toString('base64'));
  if(!p.original.equals(p.canonical(bytes,'invoice'))||p.propertiesDigest!==hash(p.canonical(bytes,'signed-properties'))||!p.signedBytes.equals(p.canonical(bytes,'signed-info'))||!verifyFiscalCanonicalBytes(p.signedBytes,signature,leaf.publicKey,'ieee-p1363'))throw Error('XADES_REFERENCE_VERIFICATION_FAILED');
  return {status:'offline-xades-reference',bytes,invoiceHash:p.invoiceHash,propertiesDigest:p.propertiesDigest,artifactDigest:hashArtifact(bytes)};
}
// Independent comparison against the trusted original, policy, chain and time.
// Exact byte comparison intentionally rejects equivalent reserialized XML.
export function verifySimplifiedXadesReference({unsigned,bytes,chain,at,policy,canonicalize}){
  try{
    checkedBytes(bytes);
    if(!Array.isArray(chain)||chain.length<2||chain.length>8||chain.some(c=>!Buffer.isBuffer(c)||!c.length||c.length>32768)||typeof at!=='string'||!Number.isFinite(Date.parse(at))||new Date(at).toISOString()!==at)return false;
    const p=referenceParts(unsigned,chain,at,policy,canonicalize);
    const match=bytes.toString('utf8').match(/<ds:SignatureValue>([A-Za-z0-9+/]{86}==)<\/ds:SignatureValue>/g);
    if(!match||match.length!==1)return false;
    const value=match[0].slice('<ds:SignatureValue>'.length,-'</ds:SignatureValue>'.length);
    const signature=Buffer.from(value,'base64');
    if(signature.toString('base64')!==value||!bytes.equals(assemble(p.xml,chain,p.props,p.info,value)))return false;
    return p.original.equals(p.canonical(bytes,'invoice'))&&p.propertiesDigest===hash(p.canonical(bytes,'signed-properties'))&&p.signedBytes.equals(p.canonical(bytes,'signed-info'))&&verifyFiscalCanonicalBytes(p.signedBytes,signature,new X509Certificate(chain[0]).publicKey,'ieee-p1363');
  }catch{return false;}
}

// Managed alternative to the local-key reference. The protected session is
// created only after enrollment key, certificate policy and CRL checks.
export async function buildManagedSimplifiedXadesReference({unsigned,session,policy,canonicalize}){
  const protectedSession=requireProtectedSigningSession(session),chain=protectedSession.chainDer,at=protectedSession.at;
  const p=referenceParts(unsigned,chain,at,policy,canonicalize);
  // The known domestic UBL writer emits one supplier VAT identity. Reject
  // a mismatched supplier before requesting any managed signature.
  const supplier=p.xml.split('<cac:AccountingSupplierParty>');
  const seller=supplier.length===2?supplier[1].split('</cac:AccountingSupplierParty>')[0]:'';
  const vat=seller.match(/<cac:PartyTaxScheme><cbc:CompanyID>(3[0-9]{13}3)<\/cbc:CompanyID>/g);
  if(!vat||vat.length!==1||vat[0]!=='<cac:PartyTaxScheme><cbc:CompanyID>'+protectedSession.issuerVat+'</cbc:CompanyID>')throw Error('EGS_ISSUER_MISMATCH');
  const signature=await protectedSession.sign('xades-signed-info',p.signedBytes);
  const bytes=assemble(p.xml,chain,p.props,p.info,signature.toString('base64'));
  if(!verifySimplifiedXadesReference({unsigned,bytes,chain,at,policy,canonicalize}))throw Error('MANAGED_XADES_VERIFICATION_FAILED');
  return {status:'offline-xades-reference',bytes,invoiceHash:p.invoiceHash,propertiesDigest:p.propertiesDigest,artifactDigest:hashArtifact(bytes)};
}
