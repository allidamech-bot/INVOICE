import type { DocumentItem, LourexDocument, TemplateId } from '../types.js';
import { calculateTotals, formatMoney, lineTotal } from '../lib/money.js';
import { displayDate } from '../lib/id.js';
import { paginateItems } from '../lib/documents.js';

interface Props { document: LourexDocument; scale?: number; compact?: boolean; }
interface PageProps { document: LourexDocument; items: DocumentItem[]; pageIndex: number; totalPages: number; finalPage: boolean; variant: TemplateId; compact?: boolean; }

const MODERN_TEMPLATES: TemplateId[] = ['obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger'];
function isModernTemplate(variant: TemplateId): boolean { return MODERN_TEMPLATES.includes(variant); }

function localized(doc: LourexDocument, en: string, ar: string): any {
  if (doc.language === 'en') return <span>{en}</span>;
  if (doc.language === 'ar') return <span dir="rtl">{ar}</span>;
  return <span className="bi-label"><span>{en}</span><span dir="rtl">{ar}</span></span>;
}
function valuePair(doc: LourexDocument, en: string, ar: string): any {
  if (doc.language === 'en') return <span>{en || '—'}</span>;
  if (doc.language === 'ar') return <span dir="rtl">{ar || en || '—'}</span>;
  return <span className="bi-value"><span>{en || '—'}</span>{ar ? <span dir="rtl">{ar}</span> : null}</span>;
}
function companyName(doc: LourexDocument): any { return valuePair(doc, doc.companySnapshot.nameEn, doc.companySnapshot.nameAr); }
function customerName(doc: LourexDocument): any { const c = doc.customerSnapshot; return valuePair(doc, c?.companyNameEn ?? '', c?.companyNameAr ?? ''); }

function LogoBlock({ document: doc, inverse = false }: { document: LourexDocument; inverse?: boolean }): any {
  const src = doc.companySnapshot.logoDataUrl || './brand/lourex-logo.svg';
  const official = src.includes('lourex-logo.svg');
  return <div className={`doc-logo ${inverse ? 'inverse' : ''} ${official ? 'official-doc-logo' : ''}`}>{official ? <span className="official-doc-logo-inner"><span className="doc-logo-mark"><img src={src} alt="" /></span><span className="doc-logo-words"><strong>{doc.companySnapshot.nameEn || 'LOUREX'}</strong><small>IMPORT • EXPORT • INTERNATIONAL TRADE</small></span></span> : <img src={src} alt={doc.companySnapshot.nameEn || 'LOUREX'} />}</div>;
}
function MetaBlock({ document: doc }: { document: LourexDocument }): any {
  return <div className="doc-meta"><div><b>{localized(doc, 'No.', 'الرقم')}</b><span>{doc.number}</span></div><div><b>{localized(doc, 'Issue Date', 'تاريخ الإصدار')}</b><span>{displayDate(doc.issueDate, doc.language)}</span></div>{doc.dueDate ? <div><b>{localized(doc, doc.kind === 'proforma' ? 'Valid Until' : 'Due Date', doc.kind === 'proforma' ? 'صالح حتى' : 'تاريخ الاستحقاق')}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div> : null}<div><b>{localized(doc, 'Currency', 'العملة')}</b><span>{doc.currency}</span></div></div>;
}
function PartyBlock({ document: doc, type }: { document: LourexDocument; type: 'seller' | 'customer' }): any {
  const c = doc.customerSnapshot; const isSeller = type === 'seller'; const name = isSeller ? companyName(doc) : customerName(doc);
  const addressEn = isSeller ? doc.companySnapshot.addressEn : (c?.addressEn ?? ''); const addressAr = isSeller ? doc.companySnapshot.addressAr : (c?.addressAr ?? '');
  const city = isSeller ? doc.companySnapshot.city : (c?.city ?? ''); const country = isSeller ? doc.companySnapshot.country : (c?.country ?? '');
  const phone = isSeller ? doc.companySnapshot.phone : (c?.phone ?? ''); const email = isSeller ? doc.companySnapshot.email : (c?.email ?? '');
  const tax = isSeller ? (doc.companySnapshot.vatNumber || doc.companySnapshot.taxNumber) : (c?.vatTaxNumber ?? '');
  return <section className={`party-block party-${type}`}><div className="section-kicker">{localized(doc, isSeller ? 'Seller / From' : 'Buyer / Customer', isSeller ? 'البائع / من' : 'المشتري / العميل')}</div><div className="party-name">{name}</div>{(addressEn || addressAr) ? <div className="party-address">{valuePair(doc, addressEn, addressAr)}</div> : null}{(city || country) ? <div>{[city, country].filter(Boolean).join(', ')}</div> : null}{(phone || email) ? <div>{[phone, email].filter(Boolean).join(' • ')}</div> : null}{tax ? <div className="party-tax">{localized(doc, 'VAT / Tax', 'الضريبة')} <span>{tax}</span></div> : null}</section>;
}
function ItemsTable({ document: doc, items, continued }: { document: LourexDocument; items: DocumentItem[]; continued: boolean }): any {
  const showHs = doc.appearance.showHsCode && doc.items.some(i => i.hsCode.trim()); const showOrigin = doc.appearance.showOrigin && doc.items.some(i => i.origin.trim()); const showPacking = doc.appearance.showPacking && doc.items.some(i => i.packing.trim());
  return <div className="items-wrap">{continued ? <div className="continued-label">{localized(doc, 'Items — continued', 'البنود — تابع')}</div> : null}<table className="items-table"><thead><tr><th className="col-num">#</th><th>{localized(doc, 'Description', 'الوصف')}</th>{showHs ? <th>{localized(doc, 'HS Code', 'الرمز الجمركي')}</th> : null}{showOrigin ? <th>{localized(doc, 'Origin', 'المنشأ')}</th> : null}{showPacking ? <th>{localized(doc, 'Packing', 'التعبئة')}</th> : null}<th>{localized(doc, 'Qty', 'الكمية')}</th><th>{localized(doc, 'Unit', 'الوحدة')}</th><th>{localized(doc, 'Unit Price', 'سعر الوحدة')}<small>{doc.currency}</small></th><th>{localized(doc, 'Total', 'الإجمالي')}<small>{doc.currency}</small></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td className="col-num">{doc.items.findIndex(source => source.id === item.id) + 1}</td><td className="description-cell">{valuePair(doc, item.descriptionEn, item.descriptionAr)}</td>{showHs ? <td>{item.hsCode || '—'}</td> : null}{showOrigin ? <td>{item.origin || '—'}</td> : null}{showPacking ? <td>{item.packing || '—'}</td> : null}<td>{item.quantity}</td><td>{item.unit}</td><td className="money-cell">{item.unitPrice}</td><td className="money-cell strong">{lineTotal(item.quantity, item.unitPrice)}</td></tr>)}</tbody></table></div>;
}
function Terms({ document: doc }: { document: LourexDocument }): any {
  const t = doc.terms; const rows: Array<[string,string,string]> = [['Incoterm','الإنكوترم',t.incoterm],['Payment Terms','شروط الدفع',t.paymentTerms],['Packing','التعبئة',t.packing],['Delivery Time','مدة التسليم',t.deliveryTime],['Port of Loading','ميناء التحميل',t.portOfLoading],['Final Destination','الوجهة النهائية',t.finalDestination],['Country of Origin','بلد المنشأ',t.countryOfOrigin],['Validity','الصلاحية',t.validity],['Remarks','ملاحظات تجارية',t.remarks]].filter((row): row is [string,string,string] => Boolean(row[2]?.trim()));
  if (!rows.length) return null; return <section className="terms-block"><h3>{localized(doc,'Commercial Terms','الشروط التجارية')}</h3><div className="terms-grid">{rows.map(row => <div className="term-row" key={row[0]}><b>{localized(doc,row[0],row[1])}</b><span>{row[2]}</span></div>)}</div></section>;
}
function Totals({ document: doc }: { document: LourexDocument }): any {
  const t = calculateTotals(doc.items, doc.adjustments); const rows: Array<[string,string,string,boolean]> = [['Subtotal','المجموع الفرعي',t.subtotal,true],['Discount','الخصم',t.discount,doc.adjustments.discountEnabled],['Shipping','الشحن',t.shipping,doc.adjustments.shippingEnabled],['Other Charges','رسوم أخرى',t.otherCharges,doc.adjustments.otherChargesEnabled],[`Tax ${doc.adjustments.taxEnabled ? doc.adjustments.taxPercent + '%' : ''}`,'الضريبة',t.tax,doc.adjustments.taxEnabled]];
  return <section className="totals-block">{rows.filter(r => r[3]).map(r => <div className="total-row" key={r[0]}><span>{localized(doc,r[0],r[1])}</span><strong>{formatMoney(r[2],doc.currency)}</strong></div>)}<div className="grand-total"><span>{localized(doc,'Grand Total','الإجمالي النهائي')}</span><strong>{formatMoney(t.grandTotal,doc.currency)}</strong></div></section>;
}
function Bank({ document: doc }: { document: LourexDocument }): any {
  if (!doc.appearance.showBank) return null; const b = doc.companySnapshot.bank; const rows = ([['Bank Name','اسم البنك',b.bankName],['Account Name','اسم الحساب',b.accountName],['IBAN','آيبان',b.iban],['SWIFT / BIC','سويفت',b.swift],['Currency','العملة',b.currency]] as Array<[string,string,string]>).filter((r): r is [string,string,string] => Boolean(r[2]?.trim())); if (!rows.length) return null;
  return <section className="bank-block"><h3>{localized(doc,'Bank Details','التفاصيل البنكية')}</h3>{rows.map(r => <div key={r[0]}><b>{localized(doc,r[0],r[1])}</b><span>{r[2]}</span></div>)}</section>;
}
function Signature({ document: doc }: { document: LourexDocument }): any { const showSig = doc.appearance.showSignature && doc.companySnapshot.signatureDataUrl; const showStamp = doc.appearance.showStamp && doc.companySnapshot.stampDataUrl; if (!showSig && !showStamp) return null; return <section className="signature-block"><h3>{localized(doc,'Authorized Signature','التوقيع المعتمد')}</h3><div className="signature-media">{showSig ? <img src={doc.companySnapshot.signatureDataUrl} alt="Signature" /> : null}{showStamp ? <img src={doc.companySnapshot.stampDataUrl} alt="Stamp" /> : null}</div></section>; }
function FinalDetails({ document: doc }: { document: LourexDocument }): any { return <div className="final-details"><div className="lower-grid"><Terms document={doc}/><Totals document={doc}/></div>{doc.notes.trim() ? <section className="notes-block"><h3>{localized(doc,'Notes','ملاحظات')}</h3><p>{doc.notes}</p></section> : null}<div className="bottom-grid"><Bank document={doc}/><Signature document={doc}/></div></div>; }

function ModernHeader({ document: doc, variant }: { document: LourexDocument; variant: TemplateId }): any {
  const typeEn = doc.kind === 'proforma' ? 'PROFORMA INVOICE' : 'INVOICE';
  const typeAr = doc.kind === 'proforma' ? 'عرض سعر' : 'فاتورة';
  const darkBrand = variant === 'obsidian' || variant === 'cobalt' || variant === 'split' || variant === 'aurora';
  return <header className={`header-modern modern-header-${variant}`}>
    <div className="modern-geometry" aria-hidden="true"/>
    <div className="modern-brand"><LogoBlock document={doc} inverse={darkBrand}/></div>
    <div className="modern-title"><small>{localized(doc,'COMMERCIAL DOCUMENT','مستند تجاري')}</small><div className="doc-title"><span>{typeEn}</span>{doc.language !== 'en' ? <em dir="rtl">{typeAr}</em> : null}</div></div>
    <div className="modern-meta"><MetaBlock document={doc}/></div>
  </header>;
}

function Page({ document: doc, items, pageIndex, totalPages, finalPage, variant, compact }: PageProps): any {
  const typeEn = doc.kind === 'proforma' ? 'PROFORMA INVOICE' : 'INVOICE'; const typeAr = doc.kind === 'proforma' ? 'عرض سعر' : 'فاتورة';
  return <article className={`invoice-page template-${variant} lang-${doc.language} ${compact ? 'compact-preview' : ''}`} style={{ '--accent': doc.appearance.accentColor } as any}><div className="page-accent" />{variant === 'executive' ? <header className="header-executive"><LogoBlock document={doc} inverse={true}/><div className="doc-title inverse"><span>{typeEn}</span>{doc.language !== 'en' ? <em dir="rtl">{typeAr}</em> : null}</div><MetaBlock document={doc}/></header> : null}{variant === 'minimal' ? <header className="header-minimal"><LogoBlock document={doc}/><div><div className="doc-title"><span>{typeEn}</span>{doc.language !== 'en' ? <em dir="rtl">{typeAr}</em> : null}</div><MetaBlock document={doc}/></div></header> : null}{variant === 'trade' ? <header className="header-trade"><div className="trade-bar"><LogoBlock document={doc} inverse={true}/></div><div className="trade-title"><div className="doc-title"><span>{typeEn}</span>{doc.language !== 'en' ? <em dir="rtl">{typeAr}</em> : null}</div><MetaBlock document={doc}/></div></header> : null}{variant === 'signature' ? <header className="header-signature"><LogoBlock document={doc}/><div className="signature-title"><small>{localized(doc,'COMMERCIAL DOCUMENT','مستند تجاري')}</small><div className="doc-title"><span>{typeEn}</span>{doc.language !== 'en' ? <em dir="rtl">{typeAr}</em> : null}</div></div><MetaBlock document={doc}/></header> : null}{isModernTemplate(variant) ? <ModernHeader document={doc} variant={variant}/> : null}<main className="doc-body">{pageIndex === 0 ? <div className="party-grid"><PartyBlock document={doc} type="seller"/><PartyBlock document={doc} type="customer"/></div> : null}{items.length ? <ItemsTable document={doc} items={items} continued={pageIndex > 0}/> : null}{finalPage ? <FinalDetails document={doc}/> : null}</main><footer className="doc-footer"><span>{doc.companySnapshot.footerText || doc.companySnapshot.nameEn}</span><span>{pageIndex + 1} / {totalPages}</span></footer></article>;
}
function shouldUseDetailsPage(doc: LourexDocument): boolean { const termsCount = Object.values(doc.terms).filter(value => value.trim()).length; const bank = doc.appearance.showBank && Object.values(doc.companySnapshot.bank).some(value => value.trim()); const signing = (doc.appearance.showSignature && Boolean(doc.companySnapshot.signatureDataUrl)) || (doc.appearance.showStamp && Boolean(doc.companySnapshot.stampDataUrl)); const adjustments = [doc.adjustments.discountEnabled, doc.adjustments.shippingEnabled, doc.adjustments.otherChargesEnabled, doc.adjustments.taxEnabled].filter(Boolean).length; const score = termsCount + (doc.notes.trim() ? 3 : 0) + (bank ? 4 : 0) + (signing ? 3 : 0) + adjustments; return score >= 10; }
export function TemplateRenderer({ document: doc, scale = 1, compact = false }: Props): any { const separateDetails = shouldUseDetailsPage(doc); const itemPages = paginateItems(doc.items, !separateDetails); const pages = separateDetails ? [...itemPages, [] as DocumentItem[]] : itemPages; return <div className="invoice-pages" style={{ '--preview-scale': String(scale) } as any}>{pages.map((items,index) => <Page key={`${doc.id}-${index}`} document={doc} items={items} pageIndex={index} totalPages={pages.length} finalPage={index === pages.length - 1} variant={doc.appearance.templateId} compact={compact}/>)}</div>; }
