"""Offline PAdES B-B reference for a prepared fiscal PDF; not an issuance path.
Private keys are never accepted. Supply a trusted signer of canonical CMS attributes.
"""
import io
import re
import hashlib
import subprocess
import tempfile
from datetime import datetime, timezone
from defusedxml import ElementTree
from package_pdfa import CAC, CBC, one
from pathlib import Path
from asn1crypto import cms, tsp, x509
from cryptography import x509 as crypto_x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives.serialization import Encoding
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, ByteStringObject, DictionaryObject, NameObject, NumberObject, TextStringObject
from package_pdfa import checked_reader, MAX_PDF, sha, page_digests, invoice_identity, check_attachment, check_attachment_root, validate_pdfa3b

CAP=16384
PLACEHOLDER=bytes([0xa5])*CAP
MARKERS=[0,999999991,999999992,999999993]

def require(value, message='INVALID_PADES'):
    if not value: raise ValueError(message)

def digest(data): return hashlib.sha256(data).digest()

def chain(certs):
    require(isinstance(certs,list) and 2<=len(certs)<=8 and all(isinstance(c,bytes) and 1<=len(c)<=32768 for c in certs))
    parsed=[x509.Certificate.load(c,strict=True) for c in certs]
    require(len(set(map(sha,certs)))==len(certs) and all(p.dump()==c for p,c in zip(parsed,certs)))
    key=crypto_x509.load_der_x509_certificate(certs[0]).public_key()
    require(isinstance(key,ec.EllipticCurvePublicKey) and key.curve.name=='secp256k1')
    return parsed

def stamp_date(at):
    require(isinstance(at,datetime) and at.tzinfo is not None and at.utcoffset()==timezone.utc.utcoffset(at))
    return at.strftime('D:%Y%m%d%H%M%SZ')

def prepare(pdf, at):
    checked_reader(pdf)
    writer=PdfWriter(io.BytesIO(pdf),incremental=True)
    sig=DictionaryObject({NameObject('/Type'):NameObject('/Sig'),NameObject('/Filter'):NameObject('/Adobe.PPKLite'),NameObject('/SubFilter'):NameObject('/ETSI.CAdES.detached'),NameObject('/M'):TextStringObject(stamp_date(at)),NameObject('/ByteRange'):ArrayObject([NumberObject(i) for i in MARKERS]),NameObject('/Contents'):ByteStringObject(PLACEHOLDER)})
    sig_ref=writer._add_object(sig)
    page=writer.pages[0]
    widget=DictionaryObject({NameObject('/Type'):NameObject('/Annot'),NameObject('/Subtype'):NameObject('/Widget'),NameObject('/FT'):NameObject('/Sig'),NameObject('/T'):TextStringObject('FiscalStamp'),NameObject('/Rect'):ArrayObject([NumberObject(0) for _ in range(4)]),NameObject('/V'):sig_ref,NameObject('/F'):NumberObject(132),NameObject('/P'):page.indirect_reference})
    widget_ref=writer._add_object(widget)
    page[NameObject('/Annots')]=ArrayObject([widget_ref])
    writer.root_object[NameObject('/AcroForm')]=DictionaryObject({NameObject('/Fields'):ArrayObject([widget_ref]),NameObject('/SigFlags'):NumberObject(3)})
    out=io.BytesIO(); writer.write(out); staged=out.getvalue()
    require(staged.startswith(pdf) and len(staged)<=MAX_PDF)
    gap=b'<'+PLACEHOLDER.hex().encode()+b'>'
    marker=b'[ 0 999999991 999999992 999999993 ]'
    require(staged.count(gap)==1 and staged.count(marker)==1 and staged.index(gap)>=len(pdf) and staged.index(marker)>=len(pdf))
    start=staged.index(gap); end=start+len(gap)
    actual=f'[ 0 {start} {end} {len(staged)-end} ]'.encode()
    require(len(actual)<=len(marker))
    return staged.replace(marker,actual.ljust(len(marker),b' '),1)

def signature_parts(pdf):
    require(isinstance(pdf,bytes) and 1<=len(pdf)<=MAX_PDF)
    reader=PdfReader(io.BytesIO(pdf),strict=True)
    require(not reader.is_encrypted and 1<=len(reader.pages)<=20)
    root=reader.trailer['/Root']; form=root['/AcroForm']; fields=form['/Fields']
    require(len(fields)==1 and not any(k in form for k in ('/XFA','/AA','/CO','/NeedAppearances')) and not any(k in root for k in ('/OpenAction','/AA','/Collection')))
    field=fields[0].get_object()
    require(field['/FT']=='/Sig' and field['/T']=='FiscalStamp' and field['/Subtype']=='/Widget' and list(field['/Rect'])==[0,0,0,0] and not any(k in field for k in ('/A','/AA','/Kids','/AP')))
    for i,page in enumerate(reader.pages):
        require('/AA' not in page and (page['/Annots']==fields if i==0 else '/Annots' not in page))
    sig=field['/V']; require(sig['/Type']=='/Sig' and sig['/Filter']=='/Adobe.PPKLite' and sig['/SubFilter']=='/ETSI.CAdES.detached' and re.fullmatch(r'D:\d{14}Z',str(sig['/M'])))
    ranges=sig['/ByteRange']; require(len(ranges)==4 and all(isinstance(v,NumberObject) for v in ranges))
    a,start,end,tail=map(int,ranges)
    require(a==0 and 0<start<end<len(pdf) and end+tail==len(pdf) and end-start==2*CAP+2)
    raw=sig['/Contents'].original_bytes
    require(len(raw)==CAP and pdf[start:end]==b'<'+raw.hex().encode()+b'>')
    return reader,raw,pdf[:start]+pdf[end:],start,end

def signed_attributes(staged, certs):
    chain(certs); _,raw,signed,_,_=signature_parts(staged); require(raw==PLACEHOLDER)
    return cms.CMSAttributes([{'type':'content_type','values':['data']},{'type':'message_digest','values':[digest(signed)]},{'type':'signing_certificate_v2','values':[{'certs':[{'cert_hash':digest(certs[0])}]}]}]).dump()

def finish(staged, certs, signature):
    parsed=chain(certs); attrs=cms.CMSAttributes.load(signed_attributes(staged,certs),strict=True)
    require(isinstance(signature,bytes) and 8<=len(signature)<=72)
    signer={'version':'v1','sid':{'issuer_and_serial_number':{'issuer':parsed[0].issuer,'serial_number':parsed[0].serial_number}},'digest_algorithm':{'algorithm':'sha256'},'signed_attrs':attrs,'signature_algorithm':{'algorithm':'sha256_ecdsa'},'signature':signature}
    der=cms.ContentInfo({'content_type':'signed_data','content':{'version':'v1','digest_algorithms':[{'algorithm':'sha256'}],'encap_content_info':{'content_type':'data'},'certificates':parsed,'signer_infos':[signer]}}).dump()
    require(len(der)<=CAP)
    _,_,_,start,end=signature_parts(staged)
    result=staged[:start]+b'<'+der.ljust(CAP,b'\0').hex().encode()+b'>'+staged[end:]
    verify_signature(result,certs)
    return result

def verify_signature(pdf, certs):
    parsed=chain(certs); _,raw,signed,_,_=signature_parts(pdf)
    ci=cms.ContentInfo.load(raw); der=ci.dump(); require(raw==der.ljust(CAP,b'\0') and ci['content_type'].native=='signed_data')
    sd=ci['content']; require(sd['encap_content_info']['content_type'].native=='data' and sd['encap_content_info']['content'].native is None and len(sd['signer_infos'])==1 and len(sd['digest_algorithms'])==1 and sd['digest_algorithms'][0]['algorithm'].native=='sha256')
    require(sorted(c.chosen.dump() for c in sd['certificates'])==sorted(certs))
    s=sd['signer_infos'][0]; require(s['digest_algorithm']['algorithm'].native=='sha256' and s['signature_algorithm']['algorithm'].native=='sha256_ecdsa')
    attrs=s['signed_attrs']; expected={'content_type','message_digest','signing_certificate_v2'}
    require(len(attrs)==3 and {a['type'].native for a in attrs}==expected and all(len(a['values'])==1 for a in attrs))
    values={a['type'].native:a['values'][0] for a in attrs}
    require(values['content_type'].native=='data' and values['message_digest'].native==digest(signed))
    ess=values['signing_certificate_v2']['certs']; require(len(ess)==1 and ess[0]['hash_algorithm']['algorithm'].native=='sha256' and ess[0]['cert_hash'].native==digest(certs[0]))
    require(s['sid'].name=='issuer_and_serial_number' and s['sid'].chosen['issuer'].dump()==parsed[0].issuer.dump() and s['sid'].chosen['serial_number'].native==parsed[0].serial_number)
    crypto_x509.load_der_x509_certificate(certs[0]).public_key().verify(s['signature'].native, attrs.untag().dump(), ec.ECDSA(hashes.SHA256()))
    # Verify CMS and chain against only the caller-pinned root. The server must
    # also enforce enrollment, certificate policy and revocation independently.
    with tempfile.TemporaryDirectory(prefix='fiscal-pades-') as directory:
        d=Path(directory); (d/'sig.der').write_bytes(der); (d/'signed').write_bytes(signed)
        (d/'root.pem').write_bytes(crypto_x509.load_der_x509_certificate(certs[-1]).public_bytes(Encoding.PEM))
        result=subprocess.run(['openssl','cms','-verify','-binary','-cades','-inform','DER','-in',str(d/'sig.der'),'-content',str(d/'signed'),'-CAfile',str(d/'root.pem'),'-no-CApath','-no-CAstore','-purpose','any','-out',str(d/'verified')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20)
        require(result.returncode==0 and (d/'verified').read_bytes()==signed,'PADES_CMS_NOT_VERIFIED')
    return True


def prove_preserved(original, signed, xml, certs, at):
    uuid, mode, qr=invoice_identity(xml)
    require(mode=='simplified' and signed.startswith(original),'PADES_SOURCE_MISMATCH')
    check_attachment(original,xml,uuid)
    reader,_,_,_,_=signature_parts(signed)
    check_attachment_root(reader.trailer['/Root'],xml,uuid)
    require(reader.get_fields()['FiscalStamp']['/V']['/M']==stamp_date(at),'PADES_TIME_MISMATCH')
    require(verify_signature(signed,certs) and page_digests(original,qr)==page_digests(signed,qr),'PADES_RENDER_CHANGED')
    return True


def from_p1363(raw):
    require(isinstance(raw,bytes) and len(raw)==64,'INVALID_MANAGED_SIGNATURE')
    return utils.encode_dss_signature(int.from_bytes(raw[:32],'big'),int.from_bytes(raw[32:],'big'))


def prepare_managed(xml, manifest, certs, at, validator, issuer_vat):
    """Trusted offline preparation; real veraPDF required before signing."""
    from render_fiscal import render_and_package
    uuid,mode,_=invoice_identity(xml)
    root=ElementTree.fromstring(xml,forbid_dtd=True,forbid_entities=True,forbid_external=True)
    seller=one(one(root,CAC,'AccountingSupplierParty'),CAC,'Party')
    vat=one(one(seller,CAC,'PartyTaxScheme'),CBC,'CompanyID').text
    require(mode=='simplified' and manifest.get('status')=='reported' and manifest.get('uuid')==uuid and vat==issuer_vat,'PADES_SCOPE_MISMATCH')
    original,evidence=render_and_package(xml,manifest=manifest,validator=validator)
    staged=prepare(original,at)
    return staged,signed_attributes(staged,certs),len(original),evidence


def finish_managed(staged, xml, certs, at, original_size, evidence, signature, validator):
    require(type(original_size) is int and 0<original_size<len(staged),'PADES_SOURCE_MISMATCH')
    original=staged[:original_size]
    require(evidence.get('status')=='offline-pdfa-package-candidate' and evidence.get('pdfDigest')==sha(original) and evidence.get('xmlDigest')==sha(xml),'PADES_SOURCE_MISMATCH')
    signed=finish(staged,certs,from_p1363(signature))
    prove_preserved(original,signed,xml,certs,at)
    with tempfile.TemporaryDirectory(prefix='fiscal-pades-final-') as directory:
        path=Path(directory)/'signed.pdf'; path.write_bytes(signed)
        final_report=validate_pdfa3b(path,validator)
    return signed,{**evidence,'status':'offline-pades-reference','pdfDigest':sha(signed),'unsignedPdfDigest':sha(original),'padesRequired':False,'finalValidationDigest':final_report}
