"""Offline fiscal PDF renderer. No commercial PDF changes or release authority."""
import base64
import io

from html import escape
from datetime import datetime
import re
import qrcode
from weasyprint import HTML
from defusedxml import ElementTree
from package_pdfa import CAC, CBC, invoice_identity, one, sha, package_candidate


def opt(node, ns, name):
    values = node.findall(f'{{{ns}}}{name}')
    if len(values) > 1:
        raise ValueError('AMBIGUOUS_RENDER_FIELD')
    return values[0] if values else None


def txt(node, ns, name, optional=False):
    el = opt(node, ns, name) if optional else one(node, ns, name)
    if el is None:
        return ''
    if len(el) or not el.text or len(el.text) > 512 or any(ord(c) < 32 for c in el.text):
        raise ValueError('INVALID_RENDER_FIELD')
    return el.text


def amount(node, name, currency, optional=False):
    el = opt(node, CBC, name) if optional else one(node, CBC, name)
    if el is None:
        return ''
    value = txt(node, CBC, name)
    if el.get('currencyID') != currency or not re.fullmatch(r'(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?', value):
        raise ValueError('INVALID_RENDER_AMOUNT')
    return value


def label(ar, en):
    return f'{ar} <small>{en}</small>'


def field(ar, en, value):
    return f'<div class="field">{label(ar,en)}<b dir="auto">{escape(value)}</b></div>' if value else ''


def party(root, role, anonymous=False):
    p = one(one(root, CAC, role), CAC, 'Party')
    if not len(p) and anonymous:
        return field('المشتري', 'Buyer', 'مستهلك غير مسمى / Anonymous retail')
    legal = one(p, CAC, 'PartyLegalEntity')
    ident = one(p, CAC, 'PartyIdentification')
    ident_id = one(ident, CBC, 'ID')
    address = one(p, CAC, 'PostalAddress')
    tax = opt(p, CAC, 'PartyTaxScheme')
    return ''.join([field('الاسم', 'Name', txt(legal,CBC,'RegistrationName')),field('المعرف', 'Identifier', (ident_id.get('schemeID') or '')+' '+txt(ident,CBC,'ID')),field('الرقم الضريبي','VAT ID',txt(tax,CBC,'CompanyID') if tax is not None else ''),field('العنوان','Address','، '.join(filter(None,[txt(address,CBC,k,True) for k in ('StreetName','BuildingNumber','CitySubdivisionName','CityName','PostalZone')]+[txt(one(address,CAC,'Country'),CBC,'IdentificationCode')])) )])


def render_fiscal(xml):
    uuid, mode, qr = invoice_identity(xml)
    root = ElementTree.fromstring(xml, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    cur = txt(root,CBC,'DocumentCurrencyCode')
    if cur not in {'SAR','USD','EUR','GBP','TRY','AED','QAR'}:
        raise ValueError('UNSUPPORTED_RENDER_CURRENCY')
    code = txt(root,CBC,'InvoiceTypeCode')
    ar,en = {'388':('فاتورة ضريبية','Tax invoice'),'381':('إشعار دائن','Credit note'),'383':('إشعار مدين','Debit note'),'386':('فاتورة دفعة مقدمة','Advance payment invoice')}[code]
    if mode == 'simplified':
        ar += ' مبسطة'; en = 'Simplified '+en
    meta = field('الرقم','Number',txt(root,CBC,'ID'))+field('المعرف الفريد','UUID',uuid)+field('تاريخ الإصدار','Issued',txt(root,CBC,'IssueDate')+' '+txt(root,CBC,'IssueTime'))+field('العملة','Currency',cur)
    delivery=opt(root,CAC,'Delivery')
    if delivery is not None:
        meta+=field('تاريخ التوريد','Supply date',txt(delivery,CBC,'ActualDeliveryDate'))
    payment=one(root,CAC,'PaymentMeans')
    meta+=field('طريقة الدفع','Payment code',txt(payment,CBC,'PaymentMeansCode'))+field('سبب التصحيح','Correction reason',txt(payment,CBC,'InstructionNote',True))
    for ref in root.findall(f'{{{CAC}}}BillingReference'):
        original=one(ref,CAC,'InvoiceDocumentReference')
        meta+=field('الفاتورة الأصلية','Original invoice',txt(original,CBC,'ID')+' / '+txt(original,CBC,'IssueDate'))
    def tr(values):
        return '<tr>'+''.join('<td dir="auto">'+escape(v)+'</td>' for v in values)+'</tr>'
    rows=[]; advances=[]
    for line in root.findall(f'{{{CAC}}}InvoiceLine'):
        item=one(line,CAC,'Item'); cat=one(item,CAC,'ClassifiedTaxCategory'); tax=one(line,CAC,'TaxTotal'); qty=one(line,CBC,'InvoicedQuantity')
        discounts=line.findall(f'{{{CAC}}}AllowanceCharge')
        discount=' / '.join(amount(d,'Amount',cur)+' '+txt(d,CBC,'AllowanceChargeReason') for d in discounts)
        rows.append(tr([txt(line,CBC,'ID'),txt(item,CBC,'Name'),txt(line,CBC,'InvoicedQuantity')+' '+qty.get('unitCode',''),amount(one(line,CAC,'Price'),'PriceAmount',cur),discount,amount(line,'LineExtensionAmount',cur),txt(cat,CBC,'ID')+' '+txt(cat,CBC,'Percent')+'%',amount(tax,'TaxAmount',cur),amount(tax,'RoundingAmount',cur)]))
        for ref in line.findall(f'{{{CAC}}}DocumentReference'):
            for sub in tax.findall(f'{{{CAC}}}TaxSubtotal'):
                advances.append(tr([txt(ref,CBC,'ID'),txt(ref,CBC,'UUID'),txt(ref,CBC,'IssueDate')+' '+txt(ref,CBC,'IssueTime'),amount(sub,'TaxableAmount',cur),amount(sub,'TaxAmount',cur)]))
    if not 1 <= len(rows) <= 600:
        raise ValueError('INVALID_RENDER_LINES')
    adjustments=[]
    for adj in root.findall(f'{{{CAC}}}AllowanceCharge'):
        adjustments.append(tr([txt(adj,CBC,'ChargeIndicator'),txt(adj,CBC,'AllowanceChargeReason'),txt(one(adj,CAC,'TaxCategory'),CBC,'ID'),amount(adj,'Amount',cur)]))
    breakdown=[]; document_tax=None; sar_tax=None
    for tax in root.findall(f'{{{CAC}}}TaxTotal'):
        subs=tax.findall(f'{{{CAC}}}TaxSubtotal')
        if subs:
            if document_tax is not None: raise ValueError('AMBIGUOUS_TAX')
            document_tax=amount(tax,'TaxAmount',cur)
        else:
            if sar_tax is not None: raise ValueError('AMBIGUOUS_TAX')
            sar_tax=amount(tax,'TaxAmount','SAR')
        for sub in subs:
            cat=one(sub,CAC,'TaxCategory')
            breakdown.append(tr([txt(cat,CBC,'ID'),txt(cat,CBC,'Percent')+'%',amount(sub,'TaxableAmount',cur),amount(sub,'TaxAmount',cur),txt(cat,CBC,'TaxExemptionReasonCode',True)+' '+txt(cat,CBC,'TaxExemptionReason',True)]))
    if document_tax is None or sar_tax is None: raise ValueError('MISSING_TAX')
    total=one(root,CAC,'LegalMonetaryTotal')
    totals=''.join(field(a,e,amount(total,k,cur,o)+' '+cur if amount(total,k,cur,o) else '') for a,e,k,o in [('صافي البنود','Line net','LineExtensionAmount',False),('الخصومات','Allowances','AllowanceTotalAmount',True),('الرسوم','Charges','ChargeTotalAmount',True),('قبل الضريبة','Excluding VAT','TaxExclusiveAmount',False),('الإجمالي','Including VAT','TaxInclusiveAmount',False),('المدفوع مقدماً','Prepaid','PrepaidAmount',True),('المستحق','Payable','PayableAmount',False)])
    totals+=field('ضريبة الفاتورة','Invoice VAT',document_tax+' '+cur)+field('الضريبة بالريال','VAT in SAR',sar_tax+' SAR')
    def table(headers, body):
        return '<table><thead><tr>'+''.join('<th>'+label(*h)+'</th>' for h in headers)+'</tr></thead><tbody>'+''.join(body)+'</tbody></table>' if body else ''
    png=io.BytesIO(); qrcode.make(qr,error_correction=qrcode.constants.ERROR_CORRECT_L).save(png,format='PNG')
    qr_image=base64.b64encode(png.getvalue()).decode('ascii')
    page=f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>{escape(ar)} / {escape(en)}</title><style>
    @page {{size:A4;margin:12mm;@bottom-center{{content:counter(page) " / " counter(pages)}}}} body{{font:8pt "Noto Sans Arabic","DejaVu Sans",sans-serif;color:#172322;line-height:1.2}} h1{{font-size:20pt;margin:0}} small{{display:inline;font-size:7pt;color:#476060;direction:ltr;display:inline}} .meta,.totals{{display:grid;grid-template-columns:repeat(3,1fr);gap:5pt}} .field{{padding:3pt;border-bottom:1px solid #ddd;overflow-wrap:anywhere}} b{{display:block}} .parties{{display:flex;gap:12pt}} .party{{width:50%;padding:6pt;border:1px solid #ddd}} table{{width:100%;border-collapse:collapse;table-layout:fixed;margin:8pt 0}} th,td{{border:1px solid #ccc;padding:4pt;overflow-wrap:anywhere}} th{{background:#edf3f2}} tr{{break-inside:avoid}} .qr{{width:70mm;height:70mm;image-rendering:pixelated}} .end{{break-inside:auto}} h2{{font-size:10pt;margin:4pt 0}}</style></head><body><h1>{label(ar,en)}</h1><div class="meta">{meta}</div><div class="parties"><div class="party"><h2>{label('البائع','Seller')}</h2>{party(root,'AccountingSupplierParty')}</div><div class="party"><h2>{label('المشتري','Buyer')}</h2>{party(root,'AccountingCustomerParty',mode=='simplified')}</div></div>
    {table([('م','No.'),('الصنف','Item'),('الكمية','Qty'),('السعر','Price'),('الخصم','Discount'),('الصافي','Net'),('الفئة','VAT class'),('الضريبة','VAT'),('الإجمالي','Gross')],rows)}
    {table([('رسوم؟','Charge?'),('السبب','Reason'),('الفئة','Class'),('المبلغ','Amount')],adjustments)}
    {table([('مرجع الدفعة','Advance'),('المعرف','UUID'),('التاريخ','Date'),('الصافي السابق','Prior net'),('الضريبة السابقة','Prior VAT')],advances)}
    {table([('الفئة','Class'),('النسبة','Rate'),('الأساس','Taxable'),('الضريبة','VAT'),('سبب الإعفاء','Exemption')],breakdown)}
    <div class="end"><h2>{label('الإجماليات','Totals')}</h2><div class="totals">{totals}</div><img class="qr" alt="Statutory QR" src="data:image/png;base64,{qr_image}"></div></body></html>'''
    return HTML(string=page, url_fetcher=lambda url: __import__('weasyprint').default_url_fetcher(url) if url.startswith('data:image/png;base64,') else (_ for _ in ()).throw(ValueError('EXTERNAL_RENDER_RESOURCE'))).write_pdf(pdf_variant='pdf/a-3b')


def render_and_package(xml, *, manifest, validator):
    if manifest.get('xmlDigest') != sha(xml) or 'pdfDigest' in manifest:
        raise ValueError('RENDER_SOURCE_MISMATCH')
    pdf=render_fiscal(xml)
    return package_candidate(pdf,xml,manifest={**manifest,'pdfDigest':sha(pdf)},validator=validator)
