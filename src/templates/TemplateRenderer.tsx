import type { DocumentItem, LourexDocument, TemplateId } from '../types.js';
import { calculateTotals, formatMoney, lineTotal } from '../lib/money.js';
import { displayDate } from '../lib/id.js';
import { paginateItems } from '../lib/documents.js';
import { resolvedAccent, resolvedAccentInk, resolvedArabicFont, resolvedLatinFont } from '../lib/appearance.js';
import { documentCurrency, documentDisplayValue, type DocumentValueKind } from '../lib/document-language.js';

interface Props { document: LourexDocument; scale?: number; compact?: boolean; }
interface PageProps { document: LourexDocument; items: DocumentItem[]; pageIndex: number; totalPages: number; finalPage: boolean; variant: TemplateId; compact?: boolean; }
interface DeferredPreviewState { active:boolean; }

const MODERN_TEMPLATES: TemplateId[] = ['obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];
function isModernTemplate(variant: TemplateId): boolean { return MODERN_TEMPLATES.includes(variant); }

function localized(doc: LourexDocument, en: string, ar: string): any {
  if (doc.language === 'en') return <span>{en}</span>;
  if (doc.language === 'ar') return <span dir="rtl">{ar}</span>;
  return <span className="bi-label"><span>{en}</span><span dir="rtl">{ar}</span></span>;
}
function valuePair(doc: LourexDocument, en: string, ar: string): any {
  if (doc.language === 'en') return <span>{documentDisplayValue(en,'en') || '—'}</span>;
  if (doc.language === 'ar') return <span dir="rtl">{documentDisplayValue(ar,'ar') || '—'}</span>;
  return <span className="bi-value"><span>{en || '—'}</span>{ar ? <span dir="rtl">{ar}</span> : null}</span>;
}
function identityPair(doc: LourexDocument, en: string, ar: string): any {
  const english=en.trim(); const arabic=ar.trim();
  if(doc.language==='en')return <span dir="auto">{english||arabic||'—'}</span>;
  if(doc.language==='ar')return <span dir="auto">{arabic||english||'—'}</span>;
  return <span className="bi-value">{english?<span dir="auto">{english}</span>:null}{arabic?<span dir="rtl">{arabic}</span>:null}{!english&&!arabic?<span>—</span>:null}</span>;
}
function companyName(doc: LourexDocument): any { return identityPair(doc, doc.companySnapshot.nameEn, doc.companySnapshot.nameAr); }
function customerName(doc: LourexDocument): any { const c = doc.customerSnapshot; return identityPair(doc, c?.companyNameEn ?? '', c?.companyNameAr ?? ''); }
function safeValue(doc:LourexDocument,value:string|undefined|null,kind:DocumentValueKind='prose'):string{return documentDisplayValue(value,doc.language,kind);}
function termKind(key:string):DocumentValueKind{return key==='Incoterm'?'technical':key==='Country of Origin'?'country':key==='Port of Loading'||key==='Final Destination'?'neutral':'prose';}

function LogoBlock({ document: doc, inverse = false }: { document: LourexDocument; inverse?: boolean }): any {
  const src = doc.companySnapshot.logoDataUrl;
  if (!src || src.includes('lourex-logo.svg')) return null;
  return <div className={`doc-logo ${inverse ? 'inverse' : ''}`}><img src={src} alt={doc.companySnapshot.nameEn || doc.companySnapshot.nameAr || 'Company logo'} /></div>;
}
function DocumentTitle({ document: doc, inverse = false }: { document: LourexDocument; inverse?: boolean }): any {
  const typeEn = doc.role==='credit-note' ? 'CREDIT NOTE' : doc.kind === 'proforma' ? 'QUOTATION' : 'INVOICE';
  const typeAr = doc.role==='credit-note' ? 'إشعار دائن' : doc.kind === 'proforma' ? 'عرض سعر' : 'فاتورة';
  return <div className={`doc-title ${inverse ? 'inverse' : ''}`}>{doc.language === 'en' ? <span>{typeEn}</span> : doc.language === 'ar' ? <span className="doc-title-primary-ar" dir="rtl">{typeAr}</span> : <><span>{typeEn}</span><em dir="rtl">{typeAr}</em></>}</div>;
}
function MetaBlock({ document: doc }: { document: LourexDocument }): any {
  const currency=documentCurrency(doc);
  return <div className="doc-meta"><div className="meta-number"><b>{localized(doc, 'No.', 'الرقم')}</b><span>{doc.number}</span></div>{doc.revision>1?<div className="meta-revision"><b>{localized(doc,'Revision','المراجعة')}</b><span>R{doc.revision}</span></div>:null}{doc.creditForNumber?<div className="meta-source"><b>{localized(doc,'Source Invoice','الفاتورة الأصلية')}</b><span>{doc.creditForNumber}</span></div>:null}<div className="meta-issue"><b>{localized(doc, 'Issue Date', 'تاريخ الإصدار')}</b><span>{displayDate(doc.issueDate, doc.language)}</span></div>{doc.dueDate ? <div className="meta-due"><b>{localized(doc, doc.kind === 'proforma' ? 'Valid Until' : 'Due Date', doc.kind === 'proforma' ? 'صالح حتى' : 'تاريخ الاستحقاق')}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div> : null}<div className="meta-currency"><b>{localized(doc, 'Currency', 'العملة')}</b><span>{currency}</span></div></div>;
}
function PartyBlock({ document: doc, type }: { document: LourexDocument; type: 'seller' | 'customer' }): any {
  const c = doc.customerSnapshot; const isSeller = type === 'seller'; const name = isSeller ? companyName(doc) : customerName(doc);
  const addressEn = isSeller ? doc.companySnapshot.addressEn : (c?.addressEn ?? ''); const addressAr = isSeller ? doc.companySnapshot.addressAr : (c?.addressAr ?? '');
  const cityRaw = isSeller ? doc.companySnapshot.city : (c?.city ?? ''); const countryRaw = isSeller ? doc.companySnapshot.country : (c?.country ?? '');
  const city=safeValue(doc,cityRaw,'neutral');const country=safeValue(doc,countryRaw,'country');
  const phone = isSeller ? doc.companySnapshot.phone : (c?.phone ?? ''); const email = isSeller ? doc.companySnapshot.email : (c?.email ?? ''); const website=isSeller?doc.companySnapshot.website:'';
  const identifiers:Array<[string,string,string]>=isSeller
    ? [['VAT No.','رقم ضريبة القيمة المضافة',doc.companySnapshot.vatNumber],['Tax No.','الرقم الضريبي',doc.companySnapshot.taxNumber],['Commercial Registration','السجل التجاري',doc.companySnapshot.commercialRegistration]]
    : [['VAT / Tax','الضريبة',c?.vatTaxNumber??''],['Commercial Registration','السجل التجاري',c?.commercialRegistration??'']];
  const visibleIdentifiers=identifiers.filter(([, ,value],index,array)=>Boolean(value.trim())&&array.findIndex(row=>row[2].trim()===value.trim())===index);
  return <section className={`party-block party-${type}`}><div className="section-kicker">{localized(doc, isSeller ? 'Seller / From' : 'Bill To / Customer', isSeller ? 'البائع / من' : 'إلى / العميل')}</div><div className="party-name">{name}</div>{(addressEn || addressAr) ? <div className="party-address">{identityPair(doc, addressEn, addressAr)}</div> : null}{(city || country) ? <div className="party-location">{city?<bdi>{city}</bdi>:null}{city&&country?', ':null}{country?<bdi>{country}</bdi>:null}</div> : null}{(phone || email || website) ? <div className="party-contact">{[phone, email, website].filter(Boolean).join(' • ')}</div> : null}{visibleIdentifiers.length?<div className="party-identifiers">{visibleIdentifiers.map(([en,ar,value])=><div key={`${en}-${value}`}><b>{localized(doc,en,ar)}</b><span>{value}</span></div>)}</div>:null}</section>;
}
function ItemsTable({ document: doc, items, continued }: { document: LourexDocument; items: DocumentItem[]; continued: boolean }): any {
  const currency=documentCurrency(doc);
  const showHs = doc.appearance.showHsCode && doc.items.some(i => i.hsCode.trim()); const showOrigin = doc.appearance.showOrigin && doc.items.some(i => safeValue(doc,i.origin,'country')); const showPacking = doc.appearance.showPacking && doc.items.some(i => safeValue(doc,i.packing));
  return <div className="items-wrap">{continued ? <div className="continued-label">{localized(doc, 'Items — continued', 'البنود — تابع')}</div> : null}<table className="items-table"><colgroup><col className="col-index"/><col className="col-description"/>{showHs?<col className="col-hs"/>:null}{showOrigin?<col className="col-origin"/>:null}{showPacking?<col className="col-packing"/>:null}<col className="col-qty"/><col className="col-unit"/><col className="col-price"/><col className="col-total"/></colgroup><thead><tr><th className="col-num">#</th><th>{localized(doc, 'Description', 'الوصف')}</th>{showHs ? <th>{localized(doc, 'HS Code', 'الرمز الجمركي')}</th> : null}{showOrigin ? <th>{localized(doc, 'Origin', 'المنشأ')}</th> : null}{showPacking ? <th>{localized(doc, 'Packing', 'التعبئة')}</th> : null}<th className="numeric-heading">{localized(doc, 'Qty', 'الكمية')}</th><th>{localized(doc, 'Unit', 'الوحدة')}</th><th className="numeric-heading">{localized(doc, 'Unit Price', 'سعر الوحدة')}<small>{currency}</small></th><th className="numeric-heading">{localized(doc, 'Total', 'الإجمالي')}<small>{currency}</small></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td className="col-num">{doc.items.findIndex(source => source.id === item.id) + 1}</td><td className="description-cell">{valuePair(doc, item.descriptionEn, item.descriptionAr)}</td>{showHs ? <td className="trade-cell">{item.hsCode || '—'}</td> : null}{showOrigin ? <td className="trade-cell">{safeValue(doc,item.origin,'country') || '—'}</td> : null}{showPacking ? <td className="trade-cell">{safeValue(doc,item.packing) || '—'}</td> : null}<td className="quantity-cell">{item.quantity}</td><td className="unit-cell">{safeValue(doc,item.unit,'unit') || '—'}</td><td className="money-cell">{item.unitPrice}</td><td className="money-cell strong">{lineTotal(item.quantity, item.unitPrice)}</td></tr>)}</tbody></table></div>;
}
function Terms({ document: doc }: { document: LourexDocument }): any {
  const t = doc.terms; const rawRows: Array<[string,string,string]> = [['Incoterm','الإنكوترم',t.incoterm],['Payment Terms','شروط الدفع',t.paymentTerms],['Packing','التعبئة',t.packing],['Delivery Time','مدة التسليم',t.deliveryTime],['Port of Loading','ميناء التحميل',t.portOfLoading],['Final Destination','الوجهة النهائية',t.finalDestination],['Country of Origin','بلد المنشأ',t.countryOfOrigin],['Validity','الصلاحية',t.validity],['Remarks','ملاحظات تجارية',t.remarks]];
  const rows=rawRows.map(([en,ar,value])=>[en,ar,safeValue(doc,value,termKind(en))] as [string,string,string]).filter((row): row is [string,string,string] => Boolean(row[2]?.trim()));
  if (!rows.length) return null; return <section className="terms-block"><h3>{localized(doc,'Commercial Terms','الشروط التجارية')}</h3><div className="terms-grid">{rows.map(row => <div className="term-row" data-term={row[0].toLowerCase().replaceAll(' ','-')} key={row[0]}><b>{localized(doc,row[0],row[1])}</b><span dir="auto">{row[2]}</span></div>)}</div></section>;
}
function Totals({ document: doc }: { document: LourexDocument }): any {
  const currency=documentCurrency(doc);const t = calculateTotals(doc.items, doc.adjustments); const taxRate=doc.adjustments.taxEnabled?`${doc.adjustments.taxPercent}%`:''; const rows: Array<[string,string,string,boolean]> = [['Subtotal','المجموع الفرعي',t.subtotal,true],['Discount','الخصم',t.discount,doc.adjustments.discountEnabled],['Shipping','الشحن',t.shipping,doc.adjustments.shippingEnabled],['Other Charges','رسوم أخرى',t.otherCharges,doc.adjustments.otherChargesEnabled],[`Tax ${taxRate}`,`الضريبة ${taxRate}`.trim(),t.tax,doc.adjustments.taxEnabled]];
  return <section className="totals-block">{rows.filter(r => r[3]).map(r => <div className="total-row" data-total={r[0].toLowerCase().replaceAll(' ','-')} key={r[0]}><span>{localized(doc,r[0],r[1])}</span><strong>{formatMoney(r[2],currency)}</strong></div>)}<div className="grand-total"><span>{localized(doc,doc.role==='credit-note'?'Credit Total':'Grand Total',doc.role==='credit-note'?'إجمالي الإشعار الدائن':'الإجمالي النهائي')}</span><strong>{formatMoney(t.grandTotal,currency)}</strong></div></section>;
}
function Bank({ document: doc }: { document: LourexDocument }): any {
  if (!doc.appearance.showBank) return null; const b = doc.companySnapshot.bank; const rawRows = ([['Bank Name','اسم البنك',b.bankName,'neutral'],['Account Name','اسم الحساب',b.accountName,'neutral'],['IBAN','آيبان',b.iban,'neutral'],['SWIFT / BIC','سويفت',b.swift,'neutral'],['Currency','العملة',b.currency,'currency']] as Array<[string,string,string,DocumentValueKind]>);const rows=rawRows.map(([en,ar,value,kind])=>[en,ar,safeValue(doc,value,kind)] as [string,string,string]).filter((r): r is [string,string,string] => Boolean(r[2]?.trim())); if (!rows.length) return null;
  return <section className="bank-block"><h3>{localized(doc,'Bank Details','التفاصيل البنكية')}</h3>{rows.map(r => <div data-bank={r[0].toLowerCase().replaceAll(' ','-')} key={r[0]}><b>{localized(doc,r[0],r[1])}</b><span dir="auto">{r[2]}</span></div>)}</section>;
}
function Signature({ document: doc }: { document: LourexDocument }): any {
  const showSig = doc.appearance.showSignature && doc.companySnapshot.signatureDataUrl;
  const showStamp = doc.appearance.showStamp && doc.companySnapshot.stampDataUrl;
  if (!showSig && !showStamp) return null;
  return <section className="signature-block"><h3>{localized(doc,'Authorized Signature','التوقيع المعتمد')}</h3><div className="signature-media">{showSig ? <img className="signature-image" src={doc.companySnapshot.signatureDataUrl} alt="Signature" /> : null}{showStamp ? <img className="stamp-image" src={doc.companySnapshot.stampDataUrl} alt="Stamp" /> : null}</div></section>;
}
function FinalDetails({ document: doc }: { document: LourexDocument }): any { const notes=safeValue(doc,doc.notes);return <div className="final-details"><div className="lower-grid"><Terms document={doc}/><Totals document={doc}/></div>{notes ? <section className="notes-block"><h3>{localized(doc,'Notes','ملاحظات')}</h3><p>{notes}</p></section> : null}<div className="bottom-grid"><Bank document={doc}/><Signature document={doc}/></div></div>; }

function ModernHeader({ document: doc, variant }: { document: LourexDocument; variant: TemplateId }): any {
  const darkBrand = variant === 'obsidian' || variant === 'cobalt' || variant === 'split' || variant === 'aurora' || variant === 'noir' || variant === 'midnight' || variant === 'blackivory' || variant === 'carbon';
  return <header className={`header-modern modern-header-${variant}`}>
    <div className="modern-geometry" aria-hidden="true"/>
    <div className="modern-brand"><LogoBlock document={doc} inverse={darkBrand}/></div>
    <div className="modern-title"><small>{localized(doc,'COMMERCIAL DOCUMENT','مستند تجاري')}</small><DocumentTitle document={doc}/></div>
    <div className="modern-meta"><MetaBlock document={doc}/></div>
  </header>;
}

function ContinuationHeader({ document: doc }: { document: LourexDocument }): any {
  return <header className="continuation-header"><div className="continuation-company"><LogoBlock document={doc}/><strong>{companyName(doc)}</strong></div><div className="continuation-document"><DocumentTitle document={doc}/><span>{doc.number}</span></div></header>;
}

function footerText(doc:LourexDocument):string{
  const custom=safeValue(doc,doc.companySnapshot.footerText);
  if(custom)return custom;
  if(doc.language==='en')return doc.companySnapshot.nameEn.trim()||doc.companySnapshot.nameAr.trim()||'LOUREX';
  if(doc.language==='ar')return doc.companySnapshot.nameAr.trim()||doc.companySnapshot.nameEn.trim()||'LOUREX';
  return doc.companySnapshot.nameEn||doc.companySnapshot.nameAr||'LOUREX';
}

function Page({ document: doc, items, pageIndex, totalPages, finalPage, variant, compact }: PageProps): any {
  const accent=resolvedAccent(doc.appearance);
  const paletteMode=doc.appearance.paletteMode??'auto';
  const detailsOnly=finalPage&&pageIndex>0&&items.length===0;
  const style={ '--accent':accent, '--accent-ink':resolvedAccentInk(accent), '--font-latin':resolvedLatinFont(doc.appearance), '--font-arabic':resolvedArabicFont(doc.appearance) } as any;
  const firstPage=pageIndex===0;
  return <article dir={doc.language==='ar'?'rtl':'ltr'} className={`invoice-page template-${variant} kind-${doc.kind} role-${doc.role} lifecycle-${doc.lifecycleStatus} lang-${doc.language} palette-${paletteMode} document-tone-light ${firstPage?'page-first':'page-continued'} ${detailsOnly?'details-only':''} ${compact ? 'compact-preview' : ''}`} data-template={variant} data-page={pageIndex+1} data-palette={paletteMode} data-kind={doc.kind} data-role={doc.role} data-tone="light" style={style}><div className="page-accent" />{doc.lifecycleStatus==='voided'?<div className="document-void-watermark">{doc.kind==='proforma'?localized(doc,'CANCELLED','ملغى'):localized(doc,'VOID','ملغى')}</div>:null}{!firstPage?<ContinuationHeader document={doc}/>:null}{firstPage&&variant === 'executive' ? <header className="header-executive"><LogoBlock document={doc} inverse={true}/><DocumentTitle document={doc} inverse/><MetaBlock document={doc}/></header> : null}{firstPage&&variant === 'minimal' ? <header className="header-minimal"><LogoBlock document={doc}/><div><DocumentTitle document={doc}/><MetaBlock document={doc}/></div></header> : null}{firstPage&&variant === 'trade' ? <header className="header-trade"><div className="trade-bar"><LogoBlock document={doc} inverse={true}/></div><div className="trade-title"><DocumentTitle document={doc}/><MetaBlock document={doc}/></div></header> : null}{firstPage&&variant === 'signature' ? <header className="header-signature"><LogoBlock document={doc}/><div className="signature-title"><small>{localized(doc,'COMMERCIAL DOCUMENT','مستند تجاري')}</small><DocumentTitle document={doc}/></div><MetaBlock document={doc}/></header> : null}{firstPage&&isModernTemplate(variant) ? <ModernHeader document={doc} variant={variant}/> : null}<main className="doc-body">{firstPage ? <div className="party-grid"><PartyBlock document={doc} type="seller"/><PartyBlock document={doc} type="customer"/></div> : null}{items.length ? <ItemsTable document={doc} items={items} continued={!firstPage}/> : null}{finalPage ? <FinalDetails document={doc}/> : null}</main><footer className="doc-footer"><span>{footerText(doc)}</span><span>{pageIndex + 1} / {totalPages}</span></footer></article>;
}
function firstPageItemCapacity(doc:LourexDocument):number{
  const c=doc.customerSnapshot;
  const values=[
    doc.companySnapshot.nameEn,doc.companySnapshot.nameAr,doc.companySnapshot.addressEn,doc.companySnapshot.addressAr,doc.companySnapshot.city,doc.companySnapshot.country,
    doc.companySnapshot.phone,doc.companySnapshot.email,doc.companySnapshot.website,doc.companySnapshot.vatNumber,doc.companySnapshot.taxNumber,doc.companySnapshot.commercialRegistration,
    c?.companyNameEn??'',c?.companyNameAr??'',c?.addressEn??'',c?.addressAr??'',c?.city??'',c?.country??'',c?.phone??'',c?.email??'',c?.vatTaxNumber??'',c?.commercialRegistration??''
  ].map(value=>value.trim()).filter(Boolean);
  const chars=values.reduce((sum,value)=>sum+value.length,0);
  const pressure=chars+values.length*18+(doc.language==='bilingual'?120:0);
  if(pressure>1050)return 2;
  if(pressure>780)return 3;
  if(pressure>560)return 4;
  if(pressure>380)return 5;
  return 7;
}
function docItemText(doc:LourexDocument,item:DocumentItem):string{
  if(doc.language==='en')return item.descriptionEn.trim();
  if(doc.language==='ar')return item.descriptionAr.trim();
  return `${item.descriptionEn} ${item.descriptionAr}`.trim();
}
function wrappedCellWeight(value:string,charactersPerLine:number):number{return value.trim()?Math.max(1,Math.ceil(value.trim().length/charactersPerLine)):0;}
function itemWeight(doc:LourexDocument,item:DocumentItem):number{
  const description=wrappedCellWeight(docItemText(doc,item),95);
  const hs=doc.appearance.showHsCode?wrappedCellWeight(item.hsCode,26):0;
  const origin=doc.appearance.showOrigin?wrappedCellWeight(safeValue(doc,item.origin,'country'),20):0;
  const packing=doc.appearance.showPacking?wrappedCellWeight(safeValue(doc,item.packing),24):0;
  const unit=wrappedCellWeight(safeValue(doc,item.unit,'unit'),14);
  return Math.max(1,description,hs,origin,packing,unit);
}
function displayedClosingValues(doc:LourexDocument):string[]{
  const t=doc.terms;
  return [
    safeValue(doc,t.incoterm,'technical'),safeValue(doc,t.paymentTerms),safeValue(doc,t.packing),safeValue(doc,t.deliveryTime),safeValue(doc,t.portOfLoading,'neutral'),safeValue(doc,t.finalDestination,'neutral'),safeValue(doc,t.countryOfOrigin,'country'),safeValue(doc,t.validity),safeValue(doc,t.remarks)
  ].filter(Boolean);
}
function shouldUseDetailsPage(doc: LourexDocument): boolean {
  const values=displayedClosingValues(doc);
  const termsCount=values.length;
  const notes=safeValue(doc,doc.notes);
  const detailsChars=values.reduce((sum,value)=>sum+value.length,0)+notes.length;
  const bank = doc.appearance.showBank && Object.values(doc.companySnapshot.bank).some(value => value.trim());
  const signing = (doc.appearance.showSignature && Boolean(doc.companySnapshot.signatureDataUrl)) || (doc.appearance.showStamp && Boolean(doc.companySnapshot.stampDataUrl));
  const adjustments = [doc.adjustments.discountEnabled, doc.adjustments.shippingEnabled, doc.adjustments.otherChargesEnabled, doc.adjustments.taxEnabled].filter(Boolean).length;
  const score = termsCount + (notes ? 3 : 0) + (bank ? 4 : 0) + (signing ? 3 : 0) + adjustments;
  const hardOverflow=detailsChars>1400||values.some(value=>value.length>520)||notes.length>900;
  if(hardOverflow)return true;
  const complexClosing=score>=10||detailsChars>700||values.some(value=>value.length>260)||notes.length>420;
  if(!complexClosing)return false;
  const tentative=paginateItems(doc.items,true,firstPageItemCapacity(doc),doc.language,item=>itemWeight(doc,item));
  const last=tentative[tentative.length-1]??[];
  const lastWeight=last.reduce((sum,item)=>sum+itemWeight(doc,item),0);
  const allowedLastWeight=score>=16?2:score>=13?3:5;
  return lastWeight>allowedLastWeight;
}

function renderDocument({ document: doc, scale = 1, compact = false }: Props):any{
  const separateDetails = shouldUseDetailsPage(doc);
  const itemPages = paginateItems(doc.items, !separateDetails, firstPageItemCapacity(doc),doc.language,item=>itemWeight(doc,item));
  const pages = separateDetails ? [...itemPages, [] as DocumentItem[]] : itemPages;
  return <div className="invoice-pages" style={{ '--preview-scale': String(scale) } as any}>{pages.map((items,index) => <Page key={`${doc.id}-${index}`} document={doc} items={items} pageIndex={index} totalPages={pages.length} finalPage={index === pages.length - 1} variant={doc.appearance.templateId} compact={compact}/>)}</div>;
}

// The mobile preview overlay stays mounted while hidden. Defer its expensive A4
// subtree until the overlay is actually open so normal document editing does not
// keep a second full multi-page invoice in memory.
class DeferredMobilePreview extends React.Component<Props,DeferredPreviewState>{
  state:DeferredPreviewState={active:false};
  private observer:MutationObserver|null=null;
  private screen:Element|null=null;

  componentDidMount():void{
    this.screen=document.querySelector('.editor-screen');
    this.sync();
    if(this.screen){
      this.observer=new MutationObserver(this.sync);
      this.observer.observe(this.screen,{attributes:true,attributeFilter:['class']});
    }
  }
  componentWillUnmount():void{this.observer?.disconnect();this.observer=null;this.screen=null;}
  private sync=()=>{
    const active=Boolean(this.screen?.classList.contains('mobile-preview-open'));
    if(active!==this.state.active)this.setState({active});
  };
  render():any{return this.state.active?renderDocument(this.props):<div className="invoice-pages deferred-mobile-preview" aria-hidden="true"/>;}
}

export function TemplateRenderer(props:Props): any {
  const scale=props.scale??1;
  if(scale===0.48&&!props.compact)return <DeferredMobilePreview {...props}/>;
  return renderDocument(props);
}
