import java.io.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import javax.xml.crypto.*;
import javax.xml.crypto.dom.*;
import javax.xml.crypto.dsig.*;
import javax.xml.crypto.dsig.spec.TransformParameterSpec;
import org.w3c.dom.*;

/** Offline, independently parsed content-binding check. Not an authority trust verifier. */
class ClearanceContent extends CanonicalInvoice {
    static final String DS="http://www.w3.org/2000/09/xmldsig#";
    static Element one(Element parent,String ns,String name) {
        Element result=null;
        for(Node n=parent.getFirstChild();n!=null;n=n.getNextSibling())if(named(n,ns,name)){
            if(result!=null)throw new IllegalArgumentException();result=(Element)n;
        }
        if(result==null)throw new IllegalArgumentException();return result;
    }
    static String scalar(Element e) {
        for(Node n=e.getFirstChild();n!=null;n=n.getNextSibling())if(n.getNodeType()!=Node.TEXT_NODE)throw new IllegalArgumentException();
        String s=e.getTextContent();if(s.isEmpty()||s.length()>4096||!s.equals(s.strip()))throw new IllegalArgumentException();return s;
    }
    static void business(Node n,int depth) {
        if(depth>128)throw new IllegalArgumentException();
        if(n instanceof Element e){
            if(excluded(e)||DS.equals(e.getNamespaceURI())||EXT.equals(e.getNamespaceURI()))throw new IllegalArgumentException();
        }
        if(n.getNodeType()==Node.PROCESSING_INSTRUCTION_NODE||n.getNodeType()==Node.ENTITY_REFERENCE_NODE)throw new IllegalArgumentException();
        for(Node c=n.getFirstChild();c!=null;c=c.getNextSibling())business(c,depth+1);
    }
    static byte[] filtered(Document d,boolean cleared,String uuid)throws Exception {
        Element root=d.getDocumentElement();if(!named(root,UBL,"Invoice"))throw new IllegalArgumentException();
        if(!uuid.equals(scalar(one(root,CBC,"UUID"))))throw new IllegalArgumentException();
        Element type=one(root,CBC,"InvoiceTypeCode");
        if(!Set.of("388","381","383").contains(scalar(type))||!type.getAttribute("name").matches("01[01]{5}"))throw new IllegalArgumentException();
        scalar(one(root,CBC,"ID"));
        int extensions=0,signatures=0,qrs=0;Element extension=null;
        for(Node n=root.getFirstChild();n!=null;n=n.getNextSibling()){
            if(n instanceof Element e&&excluded(e)){
                if(named(e,EXT,"UBLExtensions")){extensions++;extension=e;}
                else if(named(e,CAC,"Signature")){signatures++;}
                else {qrs++;if(!"QR".equals(scalar(one(e,CBC,"ID"))))throw new IllegalArgumentException();
                    scalar(one(one(e,CAC,"Attachment"),CBC,"EmbeddedDocumentBinaryObject"));}
            }else business(n,0);
        }
        if(extensions>1||signatures>1||qrs>1)throw new IllegalArgumentException();
        if(cleared&&(extensions!=1||signatures!=1||qrs!=1||d.getElementsByTagNameNS(DS,"Signature").getLength()!=1||extension.getElementsByTagNameNS(DS,"Signature").getLength()!=1))throw new IllegalArgumentException();
        // Reject processing instructions outside the document root too.
        for(Node n=d.getFirstChild();n!=null;n=n.getNextSibling())if(n.getNodeType()==Node.PROCESSING_INSTRUCTION_NODE)throw new IllegalArgumentException();
        List<Node> nodes=new ArrayList<>();collect(d,nodes,true,0);
        NodeSetData<Node> data=()->nodes.iterator();
        TransformService service=TransformService.getInstance(C14N,"DOM");service.init((TransformParameterSpec)null);
        var holder=parse("<Transform/>".getBytes(StandardCharsets.UTF_8));var context=new DOMCryptoContext(){};
        service.marshalParams(new DOMStructure(holder.getDocumentElement()),context);
        var output=new ByteArrayOutputStream();service.transform(data,context,output);
        if(output.size()==0||output.size()>524288)throw new IllegalArgumentException();return output.toByteArray();
    }
    static byte[] read(DataInputStream in)throws IOException {
        int size=in.readInt();if(size<1||size>524288)throw new IllegalArgumentException();
        byte[] bytes=in.readNBytes(size);if(bytes.length!=size)throw new IllegalArgumentException();return bytes;
    }
    public static void main(String[] args)throws Exception {
        try{
            if(args.length!=2||!args[0].matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))throw new IllegalArgumentException();
            var input=new DataInputStream(System.in);byte[] a=read(input),b=read(input);if(input.read()!=-1)throw new IllegalArgumentException();
            byte[] original=filtered(parse(a),false,args[0]),returned=filtered(parse(b),true,args[0]);
            String hash=Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(original));
            if(!hash.equals(args[1])||!MessageDigest.isEqual(original,returned))throw new IllegalArgumentException();
            System.out.print("CONTENT_MATCH");
        }catch(Exception e){System.err.println("CLEARANCE_CONTENT_NOT_VERIFIED");System.exit(1);}
    }
}
