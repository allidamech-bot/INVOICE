import type { LourexDocument } from '../types.js';
import type { DocumentQualityIssue } from '../lib/document-quality.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
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

function actionLabel(mode:ReviewMode,final:boolean):string{
  if(mode==='issue')return final?t('Already Final','نهائي بالفعل'):t('Confirm & Issue','تأكيد وإصدار');
  if(mode==='pdf')return final?t('Continue to PDF','متابعة إلى PDF'):t('Confirm, Issue & PDF','تأكيد وإصدار PDF');
  if(mode==='share')return final?t('Continue to Share','متابعة للمشاركة'):t('Confirm, Issue & Share','تأكيد وإصدار ومشاركة');
  return final?t('Continue to Print','متابعة للطباعة'):t('Confirm, Issue & Print','تأكيد وإصدار وطباعة');
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
  if(language==='en')return en;
  if(language==='ar')return ar||en;
  return [en,ar].filter(Boolean).join(' / ');
}

export function DocumentReviewModal({document:doc,mode,issues,working,onClose,onConfirm}:{document:LourexDocument;mode:ReviewMode|null;issues:DocumentQualityIssue[];working:boolean;onClose:()=>void;onConfirm:()=>void}):any{
  if(!mode)return null;
  const totals=calculateTotals(doc.items,doc.adjustments);
  const customer=reviewIdentityName(doc.language,doc.customerSnapshot?.companyNameEn??'',doc.customerSnapshot?.companyNameAr??'');
  const company=reviewIdentityName(doc.language,doc.companySnapshot.nameEn,doc.companySnapshot.nameAr);
  const final=doc.status==='final';
  const identityReady=Boolean(customer&&company);
  const bankShown=doc.appearance.showBank&&Object.values(doc.companySnapshot.bank).some(value=>value.trim());
  const signatureShown=doc.appearance.showSignature&&Boolean(doc.companySnapshot.signatureDataUrl);
  const stampShown=doc.appearance.showStamp&&Boolean(doc.companySnapshot.stampDataUrl);
  const warningCount=issues.filter(issue=>issue.level==='warning').length;
  const blocked=!final&&!identityReady;
  return <Modal open title={final?t('Final document action','إجراء على مستند نهائي'):t('Final check before issue','الفحص النهائي قبل الإصدار')} size="md" onClose={onClose} footer={<div className="modal-footer-actions"><Button onClick={onClose}>{t('Back to document','العودة للمستند')}</Button><Button icon={mode==='pdf'?'download':mode==='share'?'share':mode==='print'?'printer':'check'} variant="primary" disabled={working||blocked||mode==='issue'&&final} onClick={onConfirm}>{working?t('Working…','جارٍ التنفيذ…'):actionLabel(mode,final)}</Button></div>}>
    <div className="issue-review">
      <div className={`issue-review-status status-${final?'final':'ready'}`}><Icon name={final?'lock':blocked?'more':'check'} size={18}/><div><strong>{final?t('Final document','مستند نهائي'):blocked?t('Document identity incomplete','هوية المستند غير مكتملة'):t('Ready for final confirmation','جاهز للتأكيد النهائي')}</strong><span>{final?t('The document is locked against accidental edits.','المستند مقفل ضد التعديل غير المقصود.'):blocked?t('Add company and customer names that are visible in the selected document language before issuing.','أضف اسم الشركة واسم العميل بحيث يظهرا في لغة المستند المختارة قبل الإصدار.'):t('Required fields passed validation. Verify the identity and total below before confirming.','تم اجتياز الحقول الإلزامية. تحقق من هوية المستند والإجمالي أدناه قبل التأكيد.')}</span></div></div>
      <div className="issue-review-purpose"><Icon name={final?'lock':'check'} size={16}/><div><strong>{final?t('What happens next','ما الذي سيحدث الآن'):t('Confirmation effect','نتيجة التأكيد')}</strong><span>{modePurpose(mode,final)}</span></div></div>
      <div className="issue-review-grid"><div><span>{t('Document','المستند')}</span><strong>{doc.number}</strong></div><div><span>{t('Customer','العميل')}</span><strong>{customer||'—'}</strong></div><div><span>{t('Items','الأصناف')}</span><strong>{doc.items.length}</strong></div><div className="issue-total-check"><span>{t('Grand Total','الإجمالي النهائي')}</span><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong></div></div>
      <div className="issue-asset-checks"><span className={bankShown?'ok':''}><Icon name={bankShown?'check':'more'} size={14}/>{t('Bank details','بيانات البنك')}</span><span className={signatureShown?'ok':''}><Icon name={signatureShown?'check':'more'} size={14}/>{t('Signature','التوقيع')}</span><span className={stampShown?'ok':''}><Icon name={stampShown?'check':'more'} size={14}/>{t('Stamp','الختم')}</span></div>
      {issues.length?<div className="issue-warnings"><strong>{warningCount?t(`${warningCount} warning${warningCount===1?'':'s'} to review`,`يوجد ${warningCount} تنبيه للمراجعة`):t('Quality notes','ملاحظات الجودة')}</strong>{issues.map((issue,index)=><div className={`issue-warning level-${issue.level}`} key={`${issue.code}-${index}`}><span>!</span><p>{issueText(issue)}</p></div>)}</div>:<div className="issue-clean"><Icon name="check" size={16}/>{t('No quality warnings detected.','لم يتم اكتشاف أي تنبيهات جودة.')}</div>}
    </div>
  </Modal>;
}
