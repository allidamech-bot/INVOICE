import base64
import io
import unittest
from datetime import datetime, timezone
from pypdf import PdfReader
from package_pdfa import embed_invoice, check_attachment, page_digests, sha
from render_fiscal import render_fiscal, render_and_package

UUID='11111111-1111-4111-8111-111111111111'
QR=base64.b64encode(bytes(range(256))*2).decode()
def fixture(mode='01',code='388',currency='SAR',count=1):
    def amount(name,value,c=currency): return f'<cbc:{name} currencyID="{c}">{value}</cbc:{name}>'
    def party(role):
        return f'<cac:{role}><cac:Party><cac:PartyIdentification><cbc:ID schemeID="CRN">1000000000</cbc:ID></cac:PartyIdentification><cac:PostalAddress><cbc:StreetName>شارع الاختبار</cbc:StreetName><cbc:BuildingNumber>1234</cbc:BuildingNumber><cbc:CityName>الرياض</cbc:CityName><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>300000000000003</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>شركة اختبار &amp; شركاء</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:{role}>'
    cat='<cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15</cbc:Percent></cac:TaxCategory>'
    lines=''.join(f'<cac:InvoiceLine><cbc:ID>{i+1}</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>{amount("LineExtensionAmount","100.00")}<cac:TaxTotal>{amount("TaxAmount","15.00")}{amount("RoundingAmount","115.00")}</cac:TaxTotal><cac:Item><cbc:Name>منتج اختبار &lt;A&gt;</cbc:Name>{cat.replace("TaxCategory","ClassifiedTaxCategory")}</cac:Item><cac:Price>{amount("PriceAmount","100.00")}</cac:Price></cac:InvoiceLine>' for i in range(count))
    totals=''.join(amount(k,f'{v*count}.00') for k,v in [('LineExtensionAmount',100),('TaxExclusiveAmount',100),('TaxInclusiveAmount',115),('PayableAmount',115)])
    return f'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"><cbc:ID>QA-123</cbc:ID><cbc:UUID>{UUID}</cbc:UUID><cbc:IssueDate>2026-11-18</cbc:IssueDate><cbc:IssueTime>10:00:00Z</cbc:IssueTime><cbc:InvoiceTypeCode name="{mode}00000">{code}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>{currency}</cbc:DocumentCurrencyCode><cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject>{QR}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>{party("AccountingSupplierParty")}{party("AccountingCustomerParty")}<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode></cac:PaymentMeans><cac:TaxTotal>{amount("TaxAmount",f"{15*count}.00","SAR")}</cac:TaxTotal><cac:TaxTotal>{amount("TaxAmount",f"{15*count}.00")}<cac:TaxSubtotal>{amount("TaxableAmount",f"{100*count}.00")}{amount("TaxAmount",f"{15*count}.00")}{cat}</cac:TaxSubtotal></cac:TaxTotal><cac:LegalMonetaryTotal>{totals}</cac:LegalMonetaryTotal>{lines}</Invoice>'.encode()

class RenderTest(unittest.TestCase):
    def test_render_and_embed_long_qr(self):
        xml=fixture(); before=render_fiscal(xml); after=embed_invoice(before,xml,UUID,datetime.now(timezone.utc)); check_attachment(after,xml,UUID)
        self.assertEqual(page_digests(before,QR),page_digests(after,QR))
        text=' '.join(p.extract_text() for p in PdfReader(io.BytesIO(after)).pages)
        for s in ['QA-123','115.00','300000000000003','Tax invoice','VAT in SAR']:
            self.assertIn(s,text)
        self.assertIn(b'pdfaid:part="3"',PdfReader(io.BytesIO(after)).trailer['/Root']['/Metadata'].get_data())
    def test_multipage_and_foreign_currency(self):
        pdf=render_fiscal(fixture('02','381','USD',30)); reader=PdfReader(io.BytesIO(pdf));self.assertGreater(len(reader.pages),1)
        text=' '.join(p.extract_text() for p in reader.pages)
        for s in ['Credit note','3450.00','USD','SAR']: self.assertIn(s.lower(),text.lower())
        self.assertTrue(page_digests(pdf,QR))
    def test_no_silent_wrong_currency_or_missing_validator(self):
        xml=fixture(); bad=xml.replace(b'currencyID="SAR"',b'currencyID="EUR"',1)
        with self.assertRaises(ValueError): render_fiscal(bad)
        manifest={'uuid':UUID,'mode':'standard','status':'cleared','xmlDigest':sha(xml),'generatedAt':datetime.now(timezone.utc).isoformat(),'environment':'simulation'}
        with self.assertRaisesRegex(ValueError,'VERAPDF_UNAVAILABLE'): render_and_package(xml,manifest=manifest,validator='/missing/verapdf')
        with self.assertRaisesRegex(ValueError,'RENDER_SOURCE_MISMATCH'): render_and_package(xml,manifest={**manifest,'xmlDigest':'0'*64},validator='/missing/verapdf')

if __name__=='__main__': unittest.main()
