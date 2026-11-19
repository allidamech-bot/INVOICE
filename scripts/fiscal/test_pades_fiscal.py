import unittest
from datetime import datetime, timezone, timedelta
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives.serialization import Encoding
from test_render_fiscal import fixture, UUID, QR
from render_fiscal import render_fiscal
from package_pdfa import embed_invoice, sha
from pades_fiscal import prepare, signed_attributes, finish, verify_signature, prove_preserved, prepare_managed, finish_managed
from pades_cli import verify_archive, encode
from unittest.mock import patch

class PadesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.at=datetime.now(timezone.utc)
        root_key=ec.generate_private_key(ec.SECP256K1()); cls.key=ec.generate_private_key(ec.SECP256K1())
        root_name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Synthetic Root')]); leaf_name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Synthetic EGS')])
        def cert(subject,public_key,serial,ca):
            return x509.CertificateBuilder().subject_name(subject).issuer_name(root_name).public_key(public_key).serial_number(serial).not_valid_before(cls.at-timedelta(days=1)).not_valid_after(cls.at+timedelta(days=2)).add_extension(x509.BasicConstraints(ca=ca,path_length=0 if ca else None),critical=True).sign(root_key,hashes.SHA256()).public_bytes(Encoding.DER)
        cls.certs=[cert(leaf_name,cls.key.public_key(),2,False),cert(root_name,root_key.public_key(),1,True)]
        cls.xml=fixture('02'); cls.pdf=embed_invoice(render_fiscal(cls.xml),cls.xml,UUID,cls.at)
        cls.staged=prepare(cls.pdf,cls.at); cls.attrs=signed_attributes(cls.staged,cls.certs); cls.signature=cls.key.sign(cls.attrs,ec.ECDSA(hashes.SHA256()))
        cls.signed=finish(cls.staged,cls.certs,cls.signature)
    def test_real_signature_and_preserved_embedded_xml(self):
        self.assertTrue(verify_signature(self.signed,self.certs))
        self.assertTrue(prove_preserved(self.pdf,self.signed,self.xml,self.certs,self.at))
    def test_tamper_coverage_certificate_signature_or_reference(self):
        for bad in (self.signed+b'\n',self.signed.replace(b'/ETSI.CAdES.detached',b'/adbe.pkcs7.detached',1),self.signed[:35]+bytes([self.signed[35]^1])+self.signed[36:]):
            with self.assertRaises(Exception): verify_signature(bad,self.certs)
        with self.assertRaises(Exception): verify_signature(self.signed,list(reversed(self.certs)))
        with self.assertRaises(Exception): finish(self.staged,self.certs,self.key.sign(b'different',ec.ECDSA(hashes.SHA256())))
        with self.assertRaises(Exception): prove_preserved(self.pdf,self.signed,self.xml+b' ',self.certs,self.at)
    def test_no_validation_tool_no_statutory_candidate(self):
        manifest={'uuid':UUID,'mode':'simplified','status':'reported','xmlDigest':sha(self.xml),'generatedAt':self.at.isoformat(),'environment':'simulation'}
        with self.assertRaisesRegex(ValueError,'VERAPDF_UNAVAILABLE'): prepare_managed(self.xml,manifest,self.certs,self.at,'/missing/verapdf','300000000000003')
        with self.assertRaisesRegex(ValueError,'PADES_SCOPE_MISMATCH'): prepare_managed(self.xml,manifest,self.certs,self.at,'/missing/verapdf','311111111111113')
        r,s=utils.decode_dss_signature(self.signature); raw=r.to_bytes(32,'big')+s.to_bytes(32,'big')
        with self.assertRaisesRegex(ValueError,'VERAPDF_UNAVAILABLE'): finish_managed(self.staged,self.xml,self.certs,self.at,len(self.pdf),{'status':'offline-pdfa-package-candidate','pdfDigest':sha(self.pdf),'xmlDigest':sha(self.xml)},raw,'/missing/verapdf')
    def test_independent_archive_gate_binds_visible_pdf_and_signature(self):
        # Structural XML certificate fixture only, not an authority-signed XML.
        from defusedxml import ElementTree
        import xml.etree.ElementTree as ET
        root=ElementTree.fromstring(self.xml)
        ds='http://www.w3.org/2000/09/xmldsig#'
        sig=ET.SubElement(root,'{'+ds+'}Signature')
        ET.SubElement(ET.SubElement(ET.SubElement(sig,'{'+ds+'}KeyInfo'),'{'+ds+'}X509Data'),'{'+ds+'}X509Certificate').text=encode(self.certs[0])
        xml=ET.tostring(root,encoding='utf-8')
        original=embed_invoice(render_fiscal(xml),xml,UUID,self.at)
        staged=prepare(original,self.at)
        signed=finish(staged,self.certs,self.key.sign(signed_attributes(staged,self.certs),ec.ECDSA(hashes.SHA256())))
        d={'xml':encode(xml),'pdf':encode(signed),'certs':[encode(x) for x in self.certs],'at':self.at.isoformat(),'validator':'/missing/verapdf','mode':'simplified','uuid':UUID}
        with self.assertRaisesRegex(ValueError,'VERAPDF_UNAVAILABLE'): verify_archive(d)
        # Structural regression only; mock validation does not prove PDF/A.
        with patch('pades_cli.validate_pdfa3b',return_value='a'*64):
            self.assertEqual(verify_archive(d)['pdfDigest'],sha(signed))
            for bad in ({**d,'pdf':encode(original)},{**d,'pdf':encode(signed+b'\n')},{**d,'certs':[encode(self.certs[1]),encode(self.certs[0])]},{**d,'xml':encode(self.xml)},{**d,'uuid':'00000000-0000-0000-0000-000000000000'},{**d,'at':(self.at+timedelta(seconds=10)).isoformat()}):
                with self.assertRaises(Exception): verify_archive(bad)
    def test_standard_invoice_not_stamped_by_egs(self):
        xml=fixture('01'); manifest={'uuid':UUID,'mode':'standard','status':'cleared','xmlDigest':sha(xml),'generatedAt':self.at.isoformat(),'environment':'simulation'}
        with self.assertRaisesRegex(ValueError,'PADES_SCOPE_MISMATCH'): prepare_managed(xml,manifest,self.certs,self.at,'/missing/verapdf','300000000000003')

if __name__=='__main__': unittest.main()
