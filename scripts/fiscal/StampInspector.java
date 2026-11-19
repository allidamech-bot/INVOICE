import java.io.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import javax.xml.crypto.*;
import javax.xml.crypto.dom.*;
import javax.xml.crypto.dsig.*;
import javax.xml.crypto.dsig.spec.TransformParameterSpec;
import org.w3c.dom.*;

/** Strict, independently parsed XMLDSIG/XAdES subset. No external references. */
class StampInspector extends CanonicalInvoice {
    static final String DS="http://www.w3.org/2000/09/xmldsig#", XA="http://uri.etsi.org/01903/v1.3.2#";
    static final String SIG="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2", SAC="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2", SBC="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2";
    static final String SHA="http://www.w3.org/2001/04/xmlenc#sha256", ECDSA="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256", XPATH="http://www.w3.org/TR/1999/REC-xpath-19991116";
    static final String METHOD="urn:oasis:names:specification:ubl:dsig:enveloped:xades";
    static void require(boolean b){if(!b)throw new IllegalArgumentException();}
    static List<Element> children(Element e){var list=new ArrayList<Element>();for(Node n=e.getFirstChild();n!=null;n=n.getNextSibling()){if(n instanceof Element x)list.add(x);else require(n.getNodeType()==Node.TEXT_NODE&&n.getTextContent().isBlank());}return list;}
    static List<Element> all(Element e,String ns,String local){var list=new ArrayList<Element>();for(Node n=e.getFirstChild();n!=null;n=n.getNextSibling())if(named(n,ns,local))list.add((Element)n);return list;}
    static Element one(Element e,String ns,String local){var list=all(e,ns,local);require(list.size()==1);return list.get(0);}
    static Element unique(Document d,String ns,String local){var n=d.getElementsByTagNameNS(ns,local);require(n.getLength()==1);return (Element)n.item(0);}
    static String scalar(Element e){String s=e.getTextContent();require(!s.isBlank()&&s.equals(s.strip())&&s.length()<=65536);for(Node n=e.getFirstChild();n!=null;n=n.getNextSibling())require(n.getNodeType()==Node.TEXT_NODE);return s;}
    static String val(Element e,String ns,String local){return scalar(one(e,ns,local));}
    static void attrs(Element e,String... allowed){var a=e.getAttributes();for(int i=0;i<a.getLength();i++){Node n=a.item(i);if(!"http://www.w3.org/2000/xmlns/".equals(n.getNamespaceURI()))require(n.getNamespaceURI()==null&&Arrays.asList(allowed).contains(n.getNodeName()));}}
    static void algo(Element e,String value){attrs(e,"Algorithm");require(value.equals(e.getAttribute("Algorithm"))&&children(e).isEmpty());}
    static String id(Element e){String s=e.getAttribute("Id");require(s.matches("[A-Za-z_][A-Za-z0-9_.-]{0,127}"));return s;}
    static void inspectTree(Node n,Set<String> ids,int depth){require(depth<=128);require(n.getNodeType()!=Node.PROCESSING_INSTRUCTION_NODE&&n.getNodeType()!=Node.ENTITY_REFERENCE_NODE);
        if(n instanceof Element e){var a=e.getAttributes();for(int i=0;i<a.getLength();i++){Node x=a.item(i);if("id".equalsIgnoreCase(x.getLocalName()))require(ids.add(x.getNodeValue()));}}
        for(Node c=n.getFirstChild();c!=null;c=c.getNextSibling())inspectTree(c,ids,depth+1);
    }
    static byte[] b64(String s,int max){byte[] b=Base64.getDecoder().decode(s);require(b.length>0&&b.length<=max&&Base64.getEncoder().encodeToString(b).equals(s));return b;}
    static byte[] sha(byte[] b)throws Exception{return MessageDigest.getInstance("SHA-256").digest(b);}
    static byte[] canonical(Node node,boolean invoice)throws Exception{
        var nodes=new ArrayList<Node>();collect(node,nodes,invoice,0);NodeSetData<Node> data=()->nodes.iterator();
        TransformService service=TransformService.getInstance(C14N,"DOM");service.init((TransformParameterSpec)null);
        var holder=parse("<Transform/>".getBytes(StandardCharsets.UTF_8));var ctx=new DOMCryptoContext(){};
        service.marshalParams(new DOMStructure(holder.getDocumentElement()),ctx);var out=new ByteArrayOutputStream();service.transform(data,ctx,out);
        require(out.size()>0&&out.size()<=524288);return out.toByteArray();
    }
    static byte[] digest(Element parent){algo(one(parent,DS,"DigestMethod"),SHA);return b64(val(parent,DS,"DigestValue"),32);}
    static void emit(DataOutputStream out,byte[] b)throws Exception{out.writeInt(b.length);out.write(b);}
    static void emit(DataOutputStream out,String s)throws Exception{emit(out,s.getBytes(StandardCharsets.UTF_8));}
    static void business(Node n){if(n instanceof Element e)require(!excluded(e)&&!DS.equals(e.getNamespaceURI())&&!XA.equals(e.getNamespaceURI()));for(Node c=n.getFirstChild();c!=null;c=c.getNextSibling())business(c);}
    static Element path(Element e,String... nsName){for(int i=0;i<nsName.length;i+=2)e=one(e,nsName[i],nsName[i+1]);return e;}
    public static void main(String[] args){try{
        require(args.length==0);byte[] xml=System.in.readNBytes(524289);require(xml.length>0&&xml.length<=524288);
        Document d=parse(xml);inspectTree(d,new HashSet<>(),0);Element root=d.getDocumentElement();require(named(root,UBL,"Invoice"));
        Element type=one(root,CBC,"InvoiceTypeCode");require(Set.of("388","381","383","386").contains(scalar(type))&&type.getAttribute("name").matches("0[12][01]{5}"));
        Element extension=one(root,EXT,"UBLExtensions"),ref=one(root,CAC,"Signature");Element qr=null;
        for(Node n=root.getFirstChild();n!=null;n=n.getNextSibling()){if(n==extension||n==ref)continue;if(n instanceof Element e&&excluded(e)){require(qr==null&&named(e,CAC,"AdditionalDocumentReference"));qr=e;}else business(n);}
        require(qr!=null&&"QR".equals(val(qr,CBC,"ID")));require("urn:oasis:names:specification:ubl:signature:Invoice".equals(val(ref,CBC,"ID"))&&METHOD.equals(val(ref,CBC,"SignatureMethod")));
        Element ext=one(extension,EXT,"UBLExtension");require(METHOD.equals(val(ext,EXT,"ExtensionURI")));
        Element si=path(ext,EXT,"ExtensionContent",SIG,"UBLDocumentSignatures",SAC,"SignatureInformation");
        require("urn:oasis:names:specification:ubl:signature:1".equals(val(si,CBC,"ID"))&&"urn:oasis:names:specification:ubl:signature:Invoice".equals(val(si,SBC,"ReferencedSignatureID")));
        Element sig=unique(d,DS,"Signature");require(sig==one(si,DS,"Signature"));attrs(sig,"Id");String sigId=id(sig);
        Element info=unique(d,DS,"SignedInfo");require(info==one(sig,DS,"SignedInfo"));algo(one(info,DS,"CanonicalizationMethod"),C14N);algo(one(info,DS,"SignatureMethod"),ECDSA);
        var refs=all(info,DS,"Reference");require(refs.size()==2&&children(info).size()==4);Element inv=refs.get(0),prop=refs.get(1);attrs(inv,"Id","URI");attrs(prop,"URI","Type");require(inv.hasAttribute("URI")&&inv.getAttribute("URI").isEmpty());String invId=id(inv);
        require("http://uri.etsi.org/01903#SignedProperties".equals(prop.getAttribute("Type")));
        var transforms=children(one(inv,DS,"Transforms"));require(transforms.size()==4);
        // Accept only node-relative XPath semantics; never rewrite an absolute
        // or unknown expression into a different signed meaning.
        String[] expressions={"not(ancestor-or-self::ext:UBLExtensions)","not(ancestor-or-self::cac:Signature)","not(ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])"};
        for(int i=0;i<3;i++){Element t=transforms.get(i);attrs(t,"Algorithm");require(named(t,DS,"Transform")&&XPATH.equals(t.getAttribute("Algorithm"))&&children(t).size()==1);Element x=one(t,DS,"XPath");require(expressions[i].equals(scalar(x))&&EXT.equals(x.lookupNamespaceURI("ext"))&&CAC.equals(x.lookupNamespaceURI("cac"))&&CBC.equals(x.lookupNamespaceURI("cbc")));}
        require(named(transforms.get(3),DS,"Transform"));algo(transforms.get(3),C14N);
        require(children(inv).size()==3&&children(prop).size()==3);var pt=children(one(prop,DS,"Transforms"));require(pt.size()==1&&named(pt.get(0),DS,"Transform"));algo(pt.get(0),C14N);
        Element properties=unique(d,XA,"SignedProperties"),qualifying=path(sig,DS,"Object",XA,"QualifyingProperties");require(properties==one(qualifying,XA,"SignedProperties"));
        attrs(properties,"Id");require(("#"+sigId).equals(qualifying.getAttribute("Target"))&&("#"+id(properties)).equals(prop.getAttribute("URI")));
        byte[] invoice=canonical(d,true),signed=canonical(info,false);require(MessageDigest.isEqual(sha(invoice),digest(inv))&&MessageDigest.isEqual(sha(canonical(properties,false)),digest(prop)));
        Element sp=one(properties,XA,"SignedSignatureProperties"),format=path(properties,XA,"SignedDataObjectProperties",XA,"DataObjectFormat");
        require(("#"+invId).equals(format.getAttribute("ObjectReference"))&&"text/xml".equals(val(format,XA,"MimeType")));
        Element policy=path(sp,XA,"SignaturePolicyIdentifier",XA,"SignaturePolicyId");String policyId=val(one(policy,XA,"SigPolicyId"),XA,"Identifier");byte[] policyHash=digest(one(policy,XA,"SigPolicyHash"));
        var certs=children(path(sig,DS,"KeyInfo",DS,"X509Data"));var certDigests=children(one(sp,XA,"SigningCertificateV2"));require(certs.size()>=2&&certs.size()<=8&&certs.size()==certDigests.size());
        var chain=new ArrayList<byte[]>();for(int i=0;i<certs.size();i++){Element c=certs.get(i), cd=certDigests.get(i);require(named(c,DS,"X509Certificate")&&named(cd,XA,"Cert"));byte[] b=b64(scalar(c),32768);require(MessageDigest.isEqual(sha(b),digest(one(cd,XA,"CertDigest"))));chain.add(b);}
        Element seller=path(root,CAC,"AccountingSupplierParty",CAC,"Party"), money=one(root,CAC,"LegalMonetaryTotal");String currency=val(root,CBC,"DocumentCurrencyCode");
        Element gross=one(money,CBC,"TaxInclusiveAmount");require(currency.equals(gross.getAttribute("currencyID")));Element vat=null;
        for(Element t:all(root,CAC,"TaxTotal"))if(!all(t,CAC,"TaxSubtotal").isEmpty()){require(vat==null);vat=one(t,CBC,"TaxAmount");}
        require(vat!=null&&currency.equals(vat.getAttribute("currencyID")));
        var out=new DataOutputStream(System.out);emit(out,invoice);emit(out,signed);emit(out,b64(val(sig,DS,"SignatureValue"),80));emit(out,policyId);emit(out,policyHash);emit(out,val(sp,XA,"SigningTime"));
        out.writeInt(chain.size());for(byte[] c:chain)emit(out,c);
        emit(out,val(root,CBC,"UUID"));emit(out,type.getAttribute("name"));emit(out,val(one(seller,CAC,"PartyLegalEntity"),CBC,"RegistrationName"));emit(out,val(one(seller,CAC,"PartyTaxScheme"),CBC,"CompanyID"));emit(out,val(root,CBC,"IssueDate"));emit(out,val(root,CBC,"IssueTime"));emit(out,scalar(gross));emit(out,scalar(vat));emit(out,val(one(qr,CAC,"Attachment"),CBC,"EmbeddedDocumentBinaryObject"));out.flush();
    }catch(Exception e){System.err.println("STAMP_STRUCTURE_OR_DIGEST_INVALID");System.exit(1);}}
}
