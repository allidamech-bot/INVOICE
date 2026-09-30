import type { LourexDocument } from '../types.js';
import type { DocumentQualityIssue } from '../lib/document-quality.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { documentDisplayValue } from '../lib/document-language.js';
import { documentBankAllowed, documentKindLabel, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';
import { buildAccountingGuardianReview, type AccountingGuardianCode, type AccountingGuardianReview } from '../lib/accounting-guardian.js';
import { resumeVaultSession } from '../storage/vault.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, Modal } from './UI.js';

export type ReviewMode='issue'|'print'|'pdf'|'share';

function issueText(issue:DocumentQualityIssue):string{
  switch(issue.code){
    case 'company-name-missing':return t('Company name is missing from the document snapshot.','اسم الشركة غير موجود في نسخة المستند.');
    case 'logo-missing':return t('No company logo will be shown.','لن يظهر شعار للشركة.');
    case 'bank-incomplete':return t('Bank details are enabled but look incomplete.','بيانات البنك مفعلة لكنها تبدو غير مكتملة.');
    case 'signature-missing':return t('Signature is enabled but no signature image is available.','التوقيع مفعل لكن لا توجد صورة توقيع.');
    case 'stamp-missing':return t('Stamp is enabled but no stamp image is available.','الختم مفعل لكن لا توجد صورة ختم.');
    case 'zero-price':return t('One or more items have a zero price.','يوجد صنف واحد أو أكثر بسعر صفر.');
    case 'language-mismatch':return t('Some document values use a different language than the selected document language. They are suppressed in output until corrected.','بعض قيم المستند مكتوبة بلغة مختلفة عن لغة المستند المختارة. سيتم إخفاؤها من الإخراج حتى يتم تصحيحها.');
    case 'multi-page':return t('This document will use multiple A4 pages.','هذا المستند سيستخدم عدة صفحات A4.');
    case 'long-description':return t('A long item description may need a quick preview check.','يوجد وصف طويل لصنف ويُفضّل مراجعته في المعاينة.');
  }
}

function guardianText(code:AccountingGuardianCode):string{
  switch(code){
    case 'missing-customer':return t('Customer identity is missing.','هوية العميل مفقودة.');
    case 'missing-supplier':return t('Supplier identity is missing.','هوية المورد مفقودة.');
    case 'missing-currency':return t('Document currency is missing. Price, cost, margin and credit comparisons are withheld until it is supplied.','عملة المستند مفقودة. تم إيقاف مقارنات السعر والتكلفة والهامش والائتمان حتى يتم تحديدها.');
    case 'zero-quantity':return t('Quantity is zero and needs explicit review.','الكمية صفر وتحتاج مراجعة صريحة.');
    case 'zero-price':return t('Selling price is zero and needs explicit review.','سعر البيع صفر ويحتاج مراجعة صريحة.');
    case 'duplicate-line':return t('A duplicate product line was detected.','تم اكتشاف سطر منتج مكرر.');
    case 'missing-commercial-data':return t('Some commercial terms are missing.','بعض البيانات التجارية مفقودة.');
    case 'extreme-discount':return t('The discount reached the Guardian review threshold.','بلغ الخصم حد المراجعة لدى الحارس.');
    case 'suspicious-price-change':return t('The selling price changed materially from the saved selling price.','تغير سعر البيع بشكل ملحوظ عن سعر البيع المحفوظ.');
    case 'missing-cost':return t('Comparable cost is missing, so LOUREX cannot verify margin for this line.','التكلفة القابلة للمقارنة مفقودة، لذلك لا يستطيع LOUREX التحقق من هامش هذا السطر.');
    case 'cost-currency-mismatch':return t('The saved cost uses a different currency. LOUREX will not perform an FX conversion.','التكلفة المحفوظة بعملة مختلفة. لن يقوم LOUREX بتحويل عملات تلقائي.');
    case 'below-cost':return t('Selling price is below the comparable unit cost.','سعر البيع أقل من تكلفة الوحدة القابلة للمقارنة.');
    case 'below-pricing-policy':return t('Selling price is below the current company pricing-policy suggestion.','سعر البيع أقل من السعر المقترح حسب سياسة التسعير الحالية للشركة.');
    case 'credit-limit-exceeded':return t('Projected customer exposure exceeds the saved credit limit.','التعرض الائتماني المتوقع للعميل يتجاوز حد الائتمان المحفوظ.');
    case 'credit-currency-mismatch':return t('The customer credit limit and this invoice use different currencies, so no automatic comparison is made.','حد ائتمان العميل وهذه الفاتورة بعملتين مختلفتين، لذلك لا تتم مقارنة تلقائية.');
  }
}
function guardianSeverity(value:'info'|'warning'|'critical'):string{
  if(value==='critical')return t('Critical','حرج');
  if(value==='warning')return t('Warning','تحذير');
  return t('Info','معلومة');
}

function actionLabel(mode:ReviewMode,final:boolean):string{
  if(mode==='issue')return final?t('Already Final','نهائي بالفعل'):t('Confirm & Issue','تأكيد وإصدار');
  if(mode==='pdf')return final?t('Continue to PDF','متابعة إلى PDF'):t('Confirm, Issue & PDF','تأكيد وإصدار PDF');
  if(mode==='share')return final?t('Continue to Share','متابعة للمشاركة'):t('Confirm, Issue & Share','تأكيد وإصدار ومشاركة');
  return final?t('Continue to Print','متابعة إلى الطباعة'):t('Confirm, Issue & Print','تأكيد وإصدار وطباعة');
}

function modePurpose(mode:ReviewMode,final:boolean):string{
  if(final){
    if(mode==='pdf')return t('The final document will stay locked and a PDF will be created.','سيبقى المستند النهائي مقفلًا وسيتم إنشاء PDF.');
    if(mode==='share')return t('The final document will stay locked and continue to sharing.','سيبقى المستند النهائي مقفلًا وسيتم الانتقال للمشاركة.');
    if(mode==='print')return t('The final document will stay locked and continue to printing.','سيبقى المستند النهائي مقفلًا وسيتم الانتقال للطباعة.');
    return t('This document is already final and locked.','هذا المستند نهائي ومقفل بالفعل.');
  }
  if(mode==='pdf')return t('Confirming will save this exact version as Final, lock it against accidental edits, then create the PDF.','عند التأكيد سيتم حفظ هذه النسخة نفسها كنسخة نهائية وقفلها ضد التعديل غير المقصود ثم إنشاء PDF.');
  if(mode==='share')return t('Confirming will save this exact version as Final, lock it against accidental edits, then continue to sharing.','عند التأكيد سيتم حفظ هذه النسخة نفسها كنسخة نهائية وقفلها ضد التعديل غير المقصود ثم الانتقال للمشاركة.');
  if(mode==='print')return t('Confirming will save this exact version as Final, lock it against accidental edits, then continue to printing.','عند التأكيد سيتم حفظ هذه النسخة نفسها كنسخة نهائية وقفلها ضد التعديل غير المقصود ثم الانتقال للطباعة.');
  return t('Confirming will save this exact version as Final and lock it against accidental edits. You can explicitly unlock it later if a correction is required.','عند التأكيد سيتم حفظ هذه النسخة نفسها كمستند نهائي وقفلها ضد التعديل غير المقصود. ويمكن فتحها لاحقًا بشكل صريح إذا احتجت إلى تصحيح.');
}

function reviewIdentityName(language:LourexDocument['language'],english:string,arabic:string):string{
  const en=english.trim();const ar=arabic.trim();
  if(language==='en')return documentDisplayValue(en,'en');
  if(language==='ar')return ar||en;
  return [en,ar].filter(Boolean).join(' / ');
}

function reviewParty(doc:LourexDocument):{name:string;label:string}{
  if(isSupplierDocumentKind(doc.kind)){
    const supplier=doc.supplierSnapshot;
    return {
      name:reviewIdentityName(doc.language,supplier?.nameEn??'',supplier?.nameAr??''),
      label:t('Supplier','المورد')
    };
  }
  const customer=doc.customerSnapshot;
  return {
    name:reviewIdentityName(doc.language,customer?.companyNameEn??'',customer?.companyNameAr??''),
    label:t('Customer','العميل')
  };
}

export function DocumentReviewModal({document:doc,mode,issues,working,onClose,onConfirm}:{document:LourexDocument;mode:ReviewMode|null;issues:DocumentQualityIssue[];working:boolean;onClose:()=>void;onConfirm:()=>void}):any{
  const [guardian,setGuardian]=React.useState<AccountingGuardianReview|null>(null);
  const [guardianLoading,setGuardianLoading]=React.useState(false);
  React.useEffect(()=>{
    let alive=true;
    if(!mode){setGuardian(null);setGuardianLoading(false);return()=>{alive=false;};}
    setGuardianLoading(true);
    void resumeVaultSession().then(resumed=>{
      if(!alive)return;
      if(!resumed){setGuardian(null);setGuardianLoading(false);return;}
      const vault=resumed.vault;
      setGuardian(buildAccountingGuardianReview(doc,vault.company,vault.savedItems,vault.customers,vault.documents,vault.payments));
      setGuardianLoading(false);
    }).catch(()=>{if(alive){setGuardian(null);setGuardianLoading(false);}});
    return()=>{alive=false;};
  },[mode,doc.id,doc.updatedAt]);

  if(!mode)return null;
  const totals=calculateTotals(doc.items,doc.adjustments);
  const party=reviewParty(doc);
  const company=reviewIdentityName(doc.language,doc.companySnapshot.nameEn,doc.companySnapshot.nameAr);
  const final=doc.status==='final';
  const identityReady=Boolean(party.name&&company);
  const nonFinancial=documentPriceOptional(doc.kind);
  const kind=documentKindLabel(doc.kind,doc.role);
  const bank=doc.companySnapshot.bank;
  const bankAllowed=documentBankAllowed(doc.kind,doc.role);
  const bankShown=bankAllowed&&doc.appearance.showBank&&[bank.bankName,bank.accountName,bank.iban,bank.swift].some(value=>value.trim());
  const signatureShown=doc.appearance.showSignature&&Boolean(doc.companySnapshot.signatureDataUrl);
  const stampShown=doc.appearance.showStamp&&Boolean(doc.companySnapshot.stampDataUrl);
  const warningCount=issues.filter(issue=>issue.level==='warning').length;
  const blocked=!final&&!identityReady;
  const identityMissingCopy=isSupplierDocumentKind(doc.kind)
    ?t('Add company and supplier names that are visible in the selected document language before issuing.','أضف اسم الشركة واسم المورد بحيث يظهرا في لغة المستند المختارة قبل الإصدار.')
    :t('Add company and customer names that are visible in the selected document language before issuing.','أضف اسم الشركة واسم العميل بحيث يظهرا في لغة المستند المختارة قبل الإصدار.');
  return <Modal open title={final?t('Final document action','إجراء على مستند نهائي'):t('Final check before issue','الفحص النهائي قبل الإصدار')} size="md" onClose={onClose} footer={<div className="modal-footer-actions"><Button onClick={onClose}>{t('Back to document','العودة للمستند')}</Button><Button icon={mode==='pdf'?'download':mode==='share'?'share':mode==='print'?'printer':'check'} variant="primary" disabled={working||blocked||mode==='issue'&&final} onClick={onConfirm}>{working?t('Working…','جارٍ التنفيذ…'):actionLabel(mode,final)}</Button></div>}>
    <div className="issue-review">
      <div className={`issue-review-status status-${final?'final':'ready'}`}><Icon name={final?'lock':blocked?'more':'check'} size={18}/><div><strong>{final?t('Final document','مستند نهائي'):blocked?t('Document identity incomplete','هوية المستند غير مكتملة'):t('Ready for final confirmation','جاهز للتأكيد النهائي')}</strong><span>{final?t('The document is locked against accidental edits.','المستند مقفل ضد التعديل غير المقصود.'):blocked?identityMissingCopy:t('Required fields passed validation. Verify the identity and document details below before confirming.','تم اجتياز الحقول الإلزامية. تحقق من هوية المستند وبياناته أدناه قبل التأكيد.')}</span></div></div>
      <div className="issue-review-purpose"><Icon name={final?'lock':'check'} size={16}/><div><strong>{final?t('What happens next','ما الذي سيحدث الآن'):t('Confirmation effect','نتيجة التأكيد')}</strong><span>{modePurpose(mode,final)}</span></div></div>
      <div className="issue-review-grid"><div><span>{t('Document','المستند')}</span><strong>{t(kind.en,kind.ar)}</strong><small>{doc.number}</small></div><div><span>{party.label}</span><strong>{party.name||'—'}</strong></div><div><span>{t('Items','الأصناف')}</span><strong>{doc.items.length}</strong></div>{nonFinancial?<div className="issue-total-check is-nonfinancial"><span>{t('Pricing','التسعير')}</span><strong>{t('Not required','غير مطلوب')}</strong></div>:<div className="issue-total-check"><span>{doc.kind==='purchase-order'?t('Order Total','إجمالي الطلب'):doc.role==='credit-note'?t('Credit Total','إجمالي الإشعار الدائن'):doc.kind==='payment-receipt'?t('Receipt Amount','مبلغ الإيصال'):t('Grand Total','الإجمالي النهائي')}</span><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong></div>}</div>
      <div className="issue-asset-checks">{bankAllowed?<span className={bankShown?'ok':''}><Icon name={bankShown?'check':'more'} size={14}/>{t('Bank details','بيانات البنك')}</span>:null}<span className={signatureShown?'ok':''}><Icon name={signatureShown?'check':'more'} size={14}/>{t('Signature','التوقيع')}</span><span className={stampShown?'ok':''}><Icon name={stampShown?'check':'more'} size={14}/>{t('Stamp','الختم')}</span></div>

      <div className="issue-warnings accounting-guardian-review">
        <strong>{t('LOUREX Accounting Guardian','حارس المحاسبة في LOUREX')}</strong>
        {guardianLoading?<div className="issue-warning level-note"><span>…</span><p>{t('Running deterministic cost, pricing, commercial and credit checks…','جارٍ تنفيذ فحوص التكلفة والتسعير والبيانات التجارية والائتمان الحتمية…')}</p></div>:guardian?.issues.length?guardian.issues.map((entry,index)=><div className={`issue-warning level-${entry.level==='warning'?'warning':'note'}`} key={`${entry.code}-${entry.itemIndex}-${index}`}><span>!</span><p><strong>{guardianSeverity(entry.severity)} · {entry.itemName}</strong> — {guardianText(entry.code)}{entry.code==='below-cost'&&entry.cost?` ${t('Cost','التكلفة')}: ${entry.cost} ${entry.currency}. ${t('Price','السعر')}: ${entry.price} ${entry.currency}.`:''}{entry.code==='below-pricing-policy'&&entry.suggestedPrice?` ${t('Policy suggestion','مقترح السياسة')}: ${entry.suggestedPrice} ${entry.currency}.`:''}</p></div>):<div className="issue-clean"><Icon name="check" size={16}/>{t('No deterministic accounting or pricing warnings detected for this document.','لم يتم اكتشاف تنبيهات محاسبية أو تسعيرية حتمية لهذا المستند.')}</div>}
        {guardian?.issues.length?<small>{t(`Guardian summary: ${guardian.counts.critical} critical · ${guardian.counts.warning} warning · ${guardian.counts.info} info.`,`ملخص الحارس: ${guardian.counts.critical} حرج · ${guardian.counts.warning} تحذير · ${guardian.counts.info} معلومة.`)}</small>:null}
        <small>{t('These checks are deterministic and advisory. Currencies stay separate, no FX rate is invented, and AI never finalizes or posts this document for you.','هذه الفحوص حتمية واستشارية. تبقى العملات منفصلة، ولا يتم اختراع سعر صرف، ولا يقوم الذكاء الاصطناعي بإصدار أو ترحيل المستند بدلًا منك.')}</small>
      </div>

      {issues.length?<div className="issue-warnings"><strong>{warningCount?t(`${warningCount} warning${warningCount===1?'':'s'} to review`,`يوجد ${warningCount} تنبيه للمراجعة`):t('Quality notes','ملاحظات الجودة')}</strong>{issues.map((issue,index)=><div className={`issue-warning level-${issue.level}`} key={`${issue.code}-${index}`}><span>!</span><p>{issueText(issue)}</p></div>)}</div>:<div className="issue-clean"><Icon name="check" size={16}/>{t('No quality warnings detected.','لم يتم اكتشاف أي تنبيهات جودة.')}</div>}
    </div>
  </Modal>;
}
