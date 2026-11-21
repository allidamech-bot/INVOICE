"""Private local IPC bridge; no HTTP route, private key, or authority request."""
import base64
import json
import sys
from datetime import datetime
from pades_fiscal import prepare_managed, finish_managed, signature_parts, verify_signature, stamp_date
from package_pdfa import invoice_identity, checked_reader, check_attachment_root, page_digests, validate_pdfa3b, sha
from render_fiscal import render_fiscal
from pathlib import Path
from defusedxml import ElementTree
from package_pdfa import one
import tempfile

CAP=48*1024*1024

def decode(s,limit):
    if not isinstance(s,str) or len(s)>4*((limit+2)//3): raise ValueError('IPC_SIZE')
    value=base64.b64decode(s,validate=True)
    if not 1<=len(value)<=limit or base64.b64encode(value).decode()!=s: raise ValueError('IPC_ENCODING')
    return value

def encode(value): return base64.b64encode(value).decode('ascii')

def verify_archive(d):
    if set(d)!={'xml','pdf','certs','at','validator','mode','uuid'} or not isinstance(d['certs'],list): raise ValueError('IPC_FIELDS')
    xml=decode(d['xml'],512*1024); pdf=decode(d['pdf'],2*1024*1024)
    uuid,mode,qr=invoice_identity(xml)
    if uuid!=d['uuid'] or mode!=d['mode']: raise ValueError('ARCHIVE_IDENTITY_MISMATCH')
    if mode=='simplified':
        if not 2<=len(d['certs'])<=8 or not isinstance(d['at'],str): raise ValueError('ARCHIVE_SIGNATURE_REQUIRED')
        certs=[decode(c,32768) for c in d['certs']]
        at=datetime.fromisoformat(d['at'].replace('Z','+00:00'))
        # The PDF signer must be the exact EGS leaf embedded in the independently
        # accepted XML, not merely another certificate from the same CA.
        root=ElementTree.fromstring(xml,forbid_dtd=True,forbid_entities=True,forbid_external=True)
        ds='http://www.w3.org/2000/09/xmldsig#'
        signatures=root.findall('.//{'+ds+'}Signature')
        if len(signatures)!=1: raise ValueError('ARCHIVE_XML_SIGNER_MISMATCH')
        cert_nodes=one(one(signatures[0],ds,'KeyInfo'),ds,'X509Data').findall('{'+ds+'}X509Certificate')
        if not cert_nodes or not isinstance(cert_nodes[0].text,str) or decode(''.join(cert_nodes[0].text.split()),32768)!=certs[0]: raise ValueError('ARCHIVE_XML_SIGNER_MISMATCH')
        reader,_,_,_,_=signature_parts(pdf)
        if reader.get_fields()['FiscalStamp']['/V']['/M']!=stamp_date(at) or not verify_signature(pdf,certs): raise ValueError('ARCHIVE_SIGNATURE_REQUIRED')
    elif mode=='standard':
        if d['certs'] or d['at'] is not None: raise ValueError('ARCHIVE_STANDARD_POLICY')
        reader=checked_reader(pdf)
    else: raise ValueError('ARCHIVE_IDENTITY_MISMATCH')
    check_attachment_root(reader.trailer['/Root'],xml,uuid)
    if page_digests(render_fiscal(xml),qr)!=page_digests(pdf,qr): raise ValueError('ARCHIVE_RENDER_MISMATCH')
    with tempfile.TemporaryDirectory(prefix='fiscal-archive-check-') as directory:
        path=Path(directory)/'archive.pdf'; path.write_bytes(pdf)
        validation=validate_pdfa3b(path,d['validator'])
    return {'status':'independent-archive-verified','uuid':uuid,'mode':mode,'xmlDigest':sha(xml),'pdfDigest':sha(pdf),'validationDigest':validation}

def run(op,d):
    if op=='verify-archive': return verify_archive(d)
    common={'xml','certs','at','validator'}
    expected=common|({'manifest','issuerVat'} if op=='prepare' else {'staged','originalSize','evidence','signature'})
    if set(d)!=expected or op not in ('prepare','finish') or not isinstance(d['certs'],list) or not 2<=len(d['certs'])<=8: raise ValueError('IPC_FIELDS')
    xml=decode(d['xml'],512*1024); certs=[decode(c,32768) for c in d['certs']]; at=datetime.fromisoformat(d['at'].replace('Z','+00:00'))
    if op=='prepare':
        staged,attrs,size,evidence=prepare_managed(xml,d['manifest'],certs,at,d['validator'],d['issuerVat'])
        return {'staged':encode(staged),'attrs':encode(attrs),'originalSize':size,'evidence':evidence}
    pdf,evidence=finish_managed(decode(d['staged'],32*1024*1024),xml,certs,at,d['originalSize'],d['evidence'],decode(d['signature'],64),d['validator'])
    return {'pdf':encode(pdf),'evidence':evidence}

if __name__=='__main__':
    try:
        data=sys.stdin.buffer.read(CAP+1)
        if len(sys.argv)!=2 or len(data)>CAP: raise ValueError('IPC_SIZE')
        output=json.dumps(run(sys.argv[1],json.loads(data)),separators=(',',':')).encode()
        if len(output)>CAP: raise ValueError('IPC_SIZE')
        sys.stdout.buffer.write(output)
    except Exception:
        sys.stderr.write('FISCAL_PADES_PIPELINE_FAILED\n');sys.exit(1)
