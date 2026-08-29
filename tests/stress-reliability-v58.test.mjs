import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument, duplicateDocument, convertToInvoice, paginateItems, validateDocument } from '../dist/src/lib/documents.js';
import { calculateTotals } from '../dist/src/lib/money.js';
import { customerSnapshotFrom, defaultCompany } from '../dist/src/lib/defaults.js';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

function customer() {
  const now = new Date().toISOString();
  return {
    id: 'stress-customer',
    companyNameEn: 'International Distribution and Commercial Trading Company Limited',
    companyNameAr: 'الشركة الدولية للتوزيع والتجارة التجارية المحدودة',
    contactPerson: 'Purchasing Department',
    addressEn: 'King Fahd Road, Building 117, Floor 8, Riyadh, Kingdom of Saudi Arabia',
    addressAr: 'طريق الملك فهد، مبنى 117، الطابق الثامن، الرياض، المملكة العربية السعودية',
    city: 'Riyadh', country: 'Saudi Arabia', phone: '+966500000000', email: 'purchasing@example.com',
    vatTaxNumber: '310000000000003', commercialRegistration: '1010000000', notes: '', createdAt: now, updatedAt: now
  };
}

function heavyDocument() {
  const company = defaultCompany();
  company.nameEn = 'LOUREX International General Trading and Distribution';
  company.nameAr = 'لوركس الدولية للتجارة العامة والتوزيع';
  company.addressEn = 'Industrial and Commercial District, Homs, Syrian Arab Republic';
  company.addressAr = 'المنطقة الصناعية والتجارية، حمص، الجمهورية العربية السورية';
  company.logoDataUrl = 'data:image/png;base64,AAAALOGO';
  company.signatureDataUrl = 'data:image/png;base64,AAAASIGNATURE';
  company.stampDataUrl = 'data:image/png;base64,AAAASTAMP';
  company.bank.bankName = 'International Trade Bank';
  company.bank.accountName = 'LOUREX';
  company.bank.iban = 'SA0000000000000000000000';
  company.bank.swift = 'TESTSARIXXX';
  company.bank.currency = 'USD';
  const doc = createBlankDocument('proforma', 'PI-2026-9999', company);
  doc.language = 'bilingual';
  doc.customerSnapshot = customerSnapshotFrom(customer());
  doc.appearance.showBank = true;
  doc.appearance.showSignature = true;
  doc.appearance.showStamp = true;
  doc.appearance.showHsCode = true;
  doc.appearance.showOrigin = true;
  doc.appearance.showPacking = true;
  doc.terms.incoterm = 'CIF';
  doc.terms.paymentTerms = '30% advance payment and 70% against shipping documents after inspection and approval.';
  doc.terms.packing = 'Export-grade cartons on fumigated pallets with stretch wrapping and corner protection.';
  doc.terms.deliveryTime = 'Within 21-30 working days from receipt of advance payment and final artwork approval.';
  doc.terms.portOfLoading = 'Mersin Port, Türkiye';
  doc.terms.finalDestination = 'Riyadh, Kingdom of Saudi Arabia';
  doc.terms.countryOfOrigin = 'Türkiye';
  doc.terms.validity = 'This quotation remains valid for seven calendar days from the issue date.';
  doc.terms.remarks = 'All banking charges outside the seller bank are for the buyer account. Partial shipment is allowed when commercially necessary.';
  doc.notes = 'Bilingual commercial document stress fixture. جميع البيانات الواردة للاختبار الآلي لضمان ثبات العرض والطباعة وتعدد الصفحات وعدم فقدان البنود.';
  doc.adjustments.discountEnabled = true;
  doc.adjustments.discountMode = 'percent';
  doc.adjustments.discountValue = '2.5';
  doc.adjustments.shippingEnabled = true;
  doc.adjustments.shipping = '1250.75';
  doc.adjustments.otherChargesEnabled = true;
  doc.adjustments.otherCharges = '199.25';
  doc.adjustments.taxEnabled = true;
  doc.adjustments.taxPercent = '15';
  doc.items = Array.from({ length: 50 }, (_, i) => ({
    id: `stress-item-${i + 1}`,
    descriptionEn: `Commercial export item ${i + 1}: premium packaged consumer goods with extended product specification, handling information and batch reference for reliable multi-page invoice rendering.`,
    descriptionAr: `الصنف التجاري للتصدير رقم ${i + 1}: بضائع استهلاكية معبأة بمواصفات موسعة ومعلومات مناولة ومرجع تشغيلة لضمان اختبار موثوق لعرض الفاتورة متعددة الصفحات.`,
    hsCode: `2202.${String(i % 10).padStart(2, '0')}`,
    origin: i % 2 ? 'Türkiye' : 'Syria',
    packing: '24 PCS / Carton',
    quantity: String((i % 7) + 1),
    unit: 'Carton',
    unitPrice: (12.5 + i / 10).toFixed(2)
  }));
  return doc;
}

test('50-item bilingual stress document validates and keeps exact pagination order', () => {
  const doc = heavyDocument();
  assert.deepEqual(validateDocument(doc), {});
  const pages = paginateItems(doc.items, true, 2);
  const flattened = pages.flat();
  assert.equal(flattened.length, 50);
  assert.deepEqual(flattened.map(item => item.id), doc.items.map(item => item.id));
  assert.equal(new Set(flattened.map(item => item.id)).size, 50);
  assert.ok(pages.length >= 8, `expected a genuinely multi-page document, got ${pages.length}`);
  assert.ok(pages.every(page => page.length > 0));
});

test('final-details reservation never drops or duplicates stress rows', () => {
  const doc = heavyDocument();
  const reserved = paginateItems(doc.items, true, 7);
  const unreserved = paginateItems(doc.items, false, 7);
  assert.deepEqual(reserved.flat().map(item => item.id), doc.items.map(item => item.id));
  assert.deepEqual(unreserved.flat().map(item => item.id), doc.items.map(item => item.id));
  assert.ok(reserved.length >= unreserved.length);
  assert.ok(reserved.at(-1).length <= unreserved.at(-1).length || reserved.length > unreserved.length);
});

test('heavy media snapshots survive duplicate and proforma-to-invoice conversion without shared item identity', () => {
  const source = heavyDocument();
  const duplicate = duplicateDocument(source, 'PI-2026-10000');
  const invoice = convertToInvoice(source, 'INV-2026-10000');
  for (const doc of [duplicate, invoice]) {
    assert.equal(doc.companySnapshot.logoDataUrl, source.companySnapshot.logoDataUrl);
    assert.equal(doc.companySnapshot.signatureDataUrl, source.companySnapshot.signatureDataUrl);
    assert.equal(doc.companySnapshot.stampDataUrl, source.companySnapshot.stampDataUrl);
    assert.equal(doc.items.length, 50);
    assert.notEqual(doc.items[0].id, source.items[0].id);
    assert.equal(doc.items[49].descriptionAr, source.items[49].descriptionAr);
  }
  assert.equal(invoice.kind, 'invoice');
  assert.equal(invoice.convertedFromId, source.id);
  assert.match(invoice.terms.remarks, /PI-2026-9999/);
});

test('fixed-precision totals remain stable under 50 priced lines and commercial adjustments', () => {
  const doc = heavyDocument();
  const totals = calculateTotals(doc.items, doc.adjustments);
  for (const key of ['subtotal','discount','shipping','otherCharges','tax','grandTotal']) {
    assert.match(totals[key], /^\d+\.\d{2}$/, `${key}: ${totals[key]}`);
  }
  assert.ok(Number(totals.subtotal) > 0);
  assert.ok(Number(totals.grandTotal) > Number(totals.subtotal));
});

test('renderer keeps heavy final details on a dedicated page and hidden mobile preview deferred', async () => {
  const renderer = await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer, /shouldUseDetailsPage/);
  assert.match(renderer, /score >= 10 \|\| detailsChars > 700/);
  assert.match(renderer, /separateDetails \? \[\.\.\.itemPages, \[\] as DocumentItem\[\]\] : itemPages/);
  assert.match(renderer, /finalPage=\{index === pages\.length - 1\}/);
  assert.match(renderer, /DeferredMobilePreview/);
  assert.match(renderer, /this\.state\.active\?renderDocument\(this\.props\)/);
  assert.match(renderer, /deferred-mobile-preview/);
});

test('print and A4 guardrails remain isolated from application editor chrome under stress release', async () => {
  const appCss = await read('src/styles/app.css');
  const docCss = await read('src/styles/document.css');
  const editorCss = await read('src/styles/editor-system.css');
  assert.match(appCss, /@media print/);
  assert.match(appCss, /\.app-ui\{display:none!important\}/);
  assert.match(docCss, /width:210mm;height:297mm/);
  assert.match(docCss, /page-break-after:always/);
  assert.doesNotMatch(editorCss, /\.invoice-page/);
  assert.doesNotMatch(editorCss, /\.document-page/);
}));
