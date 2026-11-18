import io
import unittest
from datetime import datetime, timezone

import qrcode
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

from package_pdfa import check_attachment, embed_invoice, invoice_identity, package_candidate, page_digests, sha

UUID = "11111111-1111-4111-8111-111111111111"
QR = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo="
XML = (f'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"><cbc:UUID>{UUID}</cbc:UUID><cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode><cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject>{QR}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference></Invoice>').encode()
AT = datetime.now(timezone.utc)


def pdf(qr=QR):
    png = io.BytesIO()
    qrcode.make(qr).save(png, format="PNG")
    out = io.BytesIO()
    page = Canvas(out, pagesize=(595, 842))
    page.drawString(72, 770, "Synthetic fiscal fixture")
    png.seek(0)
    page.drawImage(ImageReader(png), 72, 554, 188, 188)
    page.showPage()
    page.save()
    return out.getvalue()


class PackagingTest(unittest.TestCase):
    def test_exact_attachment_relationship_metadata_and_page_pixels(self):
        before = pdf()
        after = embed_invoice(before, XML, UUID, AT)
        check_attachment(after, XML, UUID)
        self.assertEqual(page_digests(before, QR), page_digests(after, QR))
        self.assertEqual(invoice_identity(XML), (UUID, "standard", QR))

    def test_missing_duplicate_or_mismatched_original_is_rejected(self):
        before = pdf()
        with self.assertRaises(ValueError):
            embed_invoice(before, XML, "wrong", AT)
        with self.assertRaises(ValueError):
            embed_invoice(embed_invoice(before, XML, UUID, AT), XML, UUID, AT)
        with self.assertRaises(ValueError):
            check_attachment(embed_invoice(before, XML, UUID, AT), XML + b" ", UUID)
        with self.assertRaises(Exception):
            invoice_identity(b'<!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + XML)
        with self.assertRaises(ValueError):
            invoice_identity(XML.replace(b"</cbc:ID>", b"</cbc:ID><cbc:ID>QR</cbc:ID>"))

    def test_reject_wrong_printed_qr_or_association(self):
        with self.assertRaisesRegex(ValueError, "PRINTED_QR_NOT_VERIFIED"):
            page_digests(pdf("DIFFERENT"), QR)
        writer = PdfWriter(clone_from=PdfReader(io.BytesIO(embed_invoice(pdf(), XML, UUID, AT))))
        writer.root_object["/AF"][0].get_object()[NameObject("/AFRelationship")] = NameObject("/Unspecified")
        out = io.BytesIO()
        writer.write(out)
        with self.assertRaisesRegex(ValueError, "ATTACHMENT_METADATA_MISMATCH"):
            check_attachment(out.getvalue(), XML, UUID)

    def test_full_packaging_fails_closed_without_actual_verapdf(self):
        before = pdf()
        manifest = {"uuid": UUID, "mode": "standard", "status": "cleared", "pdfDigest": sha(before), "xmlDigest": sha(XML), "generatedAt": AT.isoformat(), "environment": "simulation"}
        with self.assertRaisesRegex(ValueError, "VERAPDF_UNAVAILABLE"):
            package_candidate(before, XML, manifest=manifest, validator="/nonexistent/verapdf")
        with self.assertRaisesRegex(ValueError, "PACKAGING_ARTIFACT_MISMATCH"):
            package_candidate(before, XML, manifest={**manifest, "status": "uncertain"}, validator="/nonexistent/verapdf")
        with self.assertRaisesRegex(ValueError, "PACKAGING_ARTIFACT_MISMATCH"):
            package_candidate(before, XML, manifest={**manifest, "pdfDigest": "0" * 64}, validator="/nonexistent/verapdf")


if __name__ == "__main__":
    unittest.main()
