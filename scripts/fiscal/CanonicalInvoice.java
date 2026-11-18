import java.io.*;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.crypto.*;
import javax.xml.crypto.dom.DOMStructure;
import javax.xml.crypto.dsig.*;
import javax.xml.crypto.dom.DOMCryptoContext;
import javax.xml.crypto.dsig.spec.TransformParameterSpec;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;
import org.w3c.dom.*;

/** Offline reference CLI only. Java JSR-105 supplies C14N 1.1; no custom XML canonicalizer. */
class CanonicalInvoice {
    static final String UBL = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
    static final String CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
    static final String CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
    static final String EXT = "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2";
    static final String C14N = "http://www.w3.org/2006/12/xml-c14n11";
    static boolean named(Node n,String ns,String name) { return ns.equals(n.getNamespaceURI())&&name.equals(n.getLocalName()); }
    static boolean excluded(Element e) {
        if(named(e,EXT,"UBLExtensions")||named(e,CAC,"Signature"))return true;
        if(!named(e,CAC,"AdditionalDocumentReference"))return false;
        for(Node c=e.getFirstChild();c!=null;c=c.getNextSibling())if(named(c,CBC,"ID")&&"QR".equals(c.getTextContent()))return true;
        return false;
    }
    static void collect(Node n,List<Node> nodes,boolean invoice,int depth) {
        if(depth>128||nodes.size()>100000)throw new IllegalArgumentException();
        if(n.getNodeType()==Node.ELEMENT_NODE){
            if(invoice&&excluded((Element)n))return;
            nodes.add(n);NamedNodeMap a=n.getAttributes();for(int i=0;i<a.getLength();i++)nodes.add(a.item(i));
        }else if(n.getNodeType()!=Node.COMMENT_NODE)nodes.add(n);
        for(Node c=n.getFirstChild();c!=null;c=c.getNextSibling())collect(c,nodes,invoice,depth+1);
    }
    static Document parse(byte[] bytes)throws Exception {
        var f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(true);f.setXIncludeAware(false);
        f.setExpandEntityReferences(false);f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
        f.setFeature("http://xml.org/sax/features/external-general-entities",false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
        f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
        var builder=f.newDocumentBuilder();
        builder.setErrorHandler(new DefaultHandler(){
            @Override public void error(SAXParseException e)throws SAXParseException{throw e;}
            @Override public void fatalError(SAXParseException e)throws SAXParseException{throw e;}
        });
        return builder.parse(new ByteArrayInputStream(bytes));
    }
    public static void main(String[] args)throws Exception {
        try {
            if(args.length!=1||!"invoice".equals(args[0]))throw new IllegalArgumentException();
            byte[] bytes=System.in.readNBytes(524289);if(bytes.length==0||bytes.length>524288)throw new IllegalArgumentException();
            Document d=parse(bytes);if(!named(d.getDocumentElement(),UBL,"Invoice"))throw new IllegalArgumentException();
            List<Node> nodes=new ArrayList<>();collect(d,nodes,true,0);
            NodeSetData<Node> data=()->nodes.iterator();
            TransformService service=TransformService.getInstance(C14N,"DOM");service.init((TransformParameterSpec)null);
            Document holder=parse("<Transform/>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            var context=new DOMCryptoContext(){};
            service.marshalParams(new DOMStructure(holder.getDocumentElement()),context);
            ByteArrayOutputStream output=new ByteArrayOutputStream();
            service.transform(data,context,output);
            if(output.size()==0||output.size()>524288)throw new IllegalArgumentException();
            System.out.write(output.toByteArray());
        }catch(Exception e){System.err.println("FISCAL_CANONICALIZATION_FAILED");System.exit(1);}
    }
}
