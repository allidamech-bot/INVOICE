import {createHash,X509Certificate} from 'node:crypto';
import {requireProtectedSigningSession} from './protected-signing.js';
import {buildSdk4SimplifiedQr,verifySdk4SimplifiedQr} from './sdk4-simplified-qr.js';

// Native managed signing candidate for the Java SDK profile. The actual SDK
// validator remains mandatory before queueing. No local private key or fallback.
const CAP=512*1024;
const DS='http://www.w3.org/2000/09/xmldsig#',XA='http://uri.etsi.org/01903/v1.3.2#',SHA='http://www.w3.org/2001/04/xmlenc#sha256',C14N='http://www.w3.org/2006/12/xml-c14n11';
const EXT='urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',SIG='urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',SAC='urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',SBC='urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2';
const ROOT='<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">';
const SUPPLIER='<cac:AccountingSupplierParty>',QR='<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">';
const need=ok=>{if(!ok)throw Error('SDK4_STAMP_INVALID');};
const sha=b=>createHash('sha256').update(b).digest();
const hex64=b=>Buffer.from(sha(b).toString('hex'),'ascii').toString('base64');
const xmlEscape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const unescape=s=>s.replace(/&(amp|lt|gt|quot|apos);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[x]);
const iso=at=>typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at;
function checked(b){need(Buffer.isBuffer(b)&&b.length>0&&b.length<=CAP);return b;}
function text(b){return new TextDecoder('utf-8',{fatal:true}).decode(checked(b));}
function one(s,r){const m=[...s.matchAll(r)];need(m.length===1);return m[0][1];}
function checkPolicy(policy){need(policy&&typeof policy.identifier==='string'&&policy.identifier.length<=512&&/^https:\/\/(?:www\.)?zatca\.gov\.sa\/[A-Za-z0-9_./%-]+$/.test(policy.identifier)&&/^[a-f0-9]{64}$/.test(policy.sha256??'')&&sha(checked(policy.documentBytes)).toString('hex')===policy.sha256);}
function invoiceFacts(unsigned){
 const xml=text(unsigned);need(xml.startsWith(ROOT)&&xml.endsWith('</Invoice>'));
 const body=xml.slice(ROOT.length);need(!/<[!?]/.test(body)&&!/<(?!\/?(?:cbc:|cac:|Invoice>))/.test(body)&&!/<cac:Signature\b|<cbc:ID>QR<\/cbc:ID>|xmlns(?::|\s*=)/.test(body));
 const head=body.slice(0,body.indexOf('<cac:'));need(/<cbc:InvoiceTypeCode name="0200000">(?:388|381|383|386)<\/cbc:InvoiceTypeCode>/.test(head)&&head.includes('<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>'));
 const date=one(head,/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/g),time=one(head,/<cbc:IssueTime>([^<]+)<\/cbc:IssueTime>/g);
 const seller=one(body,/<cac:AccountingSupplierParty>([\s\S]+?)<\/cac:AccountingSupplierParty>/g),encodedName=one(seller,/<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/g),sellerName=unescape(encodedName);
 need(xmlEscape(sellerName)===encodedName&&!/[\u0000-\u001f\u007f]/.test(sellerName));
 const vatNumber=one(seller,/<cac:PartyTaxScheme><cbc:CompanyID>(3[0-9]{13}3)<\/cbc:CompanyID>/g);
 const monetary=one(body,/<cac:LegalMonetaryTotal>([\s\S]+?)<\/cac:LegalMonetaryTotal>/g),total=one(monetary,/<cbc:TaxInclusiveAmount currencyID="SAR">([^<]+)<\/cbc:TaxInclusiveAmount>/g);
 const top=body.slice(0,body.indexOf('<cac:LegalMonetaryTotal>'));
 const vat=one(top,/<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">([^<]+)<\/cbc:TaxAmount><\/cac:TaxTotal>/g),reported=one(top,/<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">([^<]+)<\/cbc:TaxAmount><cac:TaxSubtotal>/g);
 need(vat===reported);
 const timestamp=date+'T'+time;need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)&&iso(timestamp.replace('Z','.000Z'))&&[total,vat].every(x=>/^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/.test(x))&&BigInt(vat.replace('.',''))<=BigInt(total.replace('.','')));
 return {xml,fields:{sellerName,vatNumber,timestamp,total,vat}};
}
function leafFacts(leafDer){
 need(Buffer.isBuffer(leafDer)&&leafDer.length>0&&leafDer.length<=32768);const leaf=new X509Certificate(leafDer);
 need(leaf.raw.equals(leafDer)&&!leaf.ca&&leaf.publicKey.asymmetricKeyType==='ec'&&leaf.publicKey.asymmetricKeyDetails?.namedCurve==='secp256k1');
 const names=leaf.issuer.split('\n');need(names.length>0&&names.every(s=>/^[A-Za-z][A-Za-z0-9.]*=[^,\n+"\\<>;=]+$/.test(s))&&/^[a-fA-F0-9]+$/.test(leaf.serialNumber));
 const cert=leafDer.toString('base64');return {cert,digest:hex64(cert),issuer:xmlEscape(names.reverse().join(', ')),serial:BigInt('0x'+leaf.serialNumber).toString()};
}
// SDK4 serializes the detached SignedProperties subtree: namespace declarations
// are restored and the opening indentation is excluded. Not generic C14N.
function propertiesDigest(props){
 return hex64(props.trimStart().replace('<xades:SignedProperties Id=','<xades:SignedProperties xmlns:xades="'+XA+'" Id=').replace(/<ds:(DigestMethod|DigestValue|X509IssuerName|X509SerialNumber)(?=[ >])/g,'<ds:$1 xmlns:ds="'+DS+'"'));
}
function properties(f,at){
 need(iso(at));const stamp=at.slice(0,19);
 const rows=[[0,'<xades:SignedProperties Id="xadesSignedProperties">'],[1,'<xades:SignedSignatureProperties>'],[2,'<xades:SigningTime>'+stamp+'</xades:SigningTime>'],[2,'<xades:SigningCertificate>'],[3,'<xades:Cert>'],[4,'<xades:CertDigest>'],[5,'<ds:DigestMethod Algorithm="'+SHA+'"/>'],[5,'<ds:DigestValue>'+f.digest+'</ds:DigestValue>'],[4,'</xades:CertDigest>'],[4,'<xades:IssuerSerial>'],[5,'<ds:X509IssuerName>'+f.issuer+'</ds:X509IssuerName>'],[5,'<ds:X509SerialNumber>'+f.serial+'</ds:X509SerialNumber>'],[4,'</xades:IssuerSerial>'],[3,'</xades:Cert>'],[2,'</xades:SigningCertificate>'],[1,'</xades:SignedSignatureProperties>'],[0,'</xades:SignedProperties>']];
 return rows.map(([depth,line])=>' '.repeat(32+depth*4)+line).join('\n');
}
function digest(value){return '<ds:DigestMethod Algorithm="'+SHA+'"/><ds:DigestValue>'+value+'</ds:DigestValue>';}
function assemble(xml,f,props,invoiceHash,signature,payload){
 const xpath=['ext:UBLExtensions','cac:Signature',"cac:AdditionalDocumentReference[cbc:ID='QR']"].map(x=>'<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::'+x+')</ds:XPath></ds:Transform>').join('');
 const info='<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="'+C14N+'"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/><ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>'+xpath+'<ds:Transform Algorithm="'+C14N+'"/></ds:Transforms>'+digest(invoiceHash)+'</ds:Reference><ds:Reference Type="'+DS+'SignatureProperties" URI="#xadesSignedProperties">'+digest(propertiesDigest(props))+'</ds:Reference></ds:SignedInfo>';
 const extension='<ext:UBLExtensions xmlns:ext="'+EXT+'"><ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent><sig:UBLDocumentSignatures xmlns:sig="'+SIG+'" xmlns:sac="'+SAC+'" xmlns:sbc="'+SBC+'"><sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID><sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID><ds:Signature xmlns:ds="'+DS+'" Id="signature">'+info+'<ds:SignatureValue>'+signature+'</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>'+f.cert+'</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties xmlns:xades="'+XA+'" Target="signature">\n'+props+'\n</xades:QualifyingProperties></ds:Object></ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>';
 const reference=QR+payload+'</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference><cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>';
 return checked(Buffer.from(ROOT+extension+xml.slice(ROOT.length).replace(SUPPLIER,reference+SUPPLIER)));
}
export function sdk4StampSigningTime(bytes){const t=one(text(bytes),/<xades:SigningTime>(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})<\/xades:SigningTime>/g)+'.000Z';need(iso(t));return t;}
export function verifySdk4SimplifiedStamp({unsigned,bytes,leafDer,at,policy,canonicalize}){
 try{
  checkPolicy(policy);need(typeof canonicalize==='function');const {xml,fields}=invoiceFacts(unsigned),f=leafFacts(leafDer),props=properties(f,at);
  const original=checked(canonicalize(Buffer.from(unsigned),'invoice')),invoiceHash=sha(original).toString('base64'),signed=text(bytes);
  const signature=one(signed,/<ds:SignatureValue>([A-Za-z0-9+/]+={0,2})<\/ds:SignatureValue>/g),payload=one(signed,/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text\/plain">([^<]+)<\/cbc:EmbeddedDocumentBinaryObject>/g);
  return verifySdk4SimplifiedQr({...fields,payload,invoiceHash,xmlSignature:signature,leafDer})&&bytes.equals(assemble(xml,f,props,invoiceHash,signature,payload))&&original.equals(checked(canonicalize(Buffer.from(bytes),'invoice')));
 }catch{return false;}
}
export async function buildManagedSdk4SimplifiedStamp({unsigned,session,policy,canonicalize}){
 const s=requireProtectedSigningSession(session);checkPolicy(policy);need(typeof canonicalize==='function');
 unsigned=Buffer.from(checked(unsigned));const {xml,fields}=invoiceFacts(unsigned);need(fields.vatNumber===s.issuerVat);
 const leafDer=s.chainDer[0],f=leafFacts(leafDer),props=properties(f,s.at),original=checked(canonicalize(Buffer.from(unsigned),'invoice')),hash=sha(original),invoiceHash=hash.toString('base64');
 const signature=(await s.sign('sdk4-invoice-hash',hash)).toString('base64');
 const payload=buildSdk4SimplifiedQr({...fields,invoiceHash,xmlSignature:signature,leafDer}),bytes=assemble(xml,f,props,invoiceHash,signature,payload);
 need(verifySdk4SimplifiedStamp({unsigned,bytes,leafDer,at:s.at,policy,canonicalize}));
 return {status:'sdk4-managed-candidate',bytes,payload,invoiceHash,propertiesDigest:propertiesDigest(props),artifactDigest:sha(bytes).toString('hex')};
}
