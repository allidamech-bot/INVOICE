import type { LourexDocument } from '../types.js';
import type { DocumentQualityIssue } from '../lib/document-quality.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { isArabic, t } from '../lib/i18n.js';
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
    case 'multi-page':return t('This document will use multiple A4 pages.','هذا المستند سيستخدم عدة صفحات A4.');
    case 'long-description':return t('A long item description may need a quick preview check.','يوجد وصف طويل لصنف ويُفضّل مراجعته في المعاينة.');
  }
}

function actionLabel(mode:ReviewMode,final:boolean):string{
  if(mode==='issue')return final?t('Already Final','نهائي بالفعل'):t('Issue Document','إصدار المستند');
  if(mode==='pdf')return final?t('Continue to PDF','متابعة إلى PDF'):t('Issue & Create PDF','إصدار وإنشاء PDF');
  if(mode==='share')return final?t('Continue to Share','متابعة للمشاركة'):t('Issue & Share','إصدار ومشاركة');
  return final?t('Continue to Print','متابعة للطباعة'):t('Issue & Print','إصدار وطباعة');
}

export function DocumentReviewModal({document:doc,mode,issues,working,onClose,onConfirm}:{document:LourexDocument;mode:ReviewMode|null;issues:DocumentQualityIssue[];working:boolean;onClose:()=>void;onConfirm:()=>void}):any{
  if(!mode)return null;
  const totals=calculateTotals(doc.items,doc.adjustments);
  const customer=isArabic()?(doc.customerSnapshot?.companyNameAr||doc.customerSnapshot?.companyNameEn):(doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr);
  const final=doc.status==='final';
  const bankShown=doc.appearance.showBank&&Object.values(doc.companySnapshot.bank).some(value=>value.trim());
  const signatureShown=doc.appearance.showSignature&&Boolean(doc.companySnapshot.signatureDataUrl);
  const stampShown=doc.appearance.showStamp&&Boolean(doc.companySnapshot.stampDataUrl);
  return <Modal open title={t('Review before issue','مراجعة قبل الإصدار')} size="md" onClose={onClose} footer={<div className="modal-footer-actions"><Button onClick={onClose}>{t('Back','رجوع')}</Button><Button icon={mode==='pdf'?'download':mode==='share'?'share':mode==='print'?'printer':'check'} variant="primary" disabled={working||mode==='issue'&&final} onClick={onConfirm}>{working?t('Working…','جارٍ التنفيذ…'):actionLabel(mode,final)}</Button></div>}>
    <div className="issue-review">
      <div className={`issue-review-status status-${final?'final':'ready'}`}><Icon name={final?'lock':'check'} size={18}/><div><strong>{final?t('Final document','مستند نهائي'):t('Ready to issue','جاهز للإصدار')}</strong><span>{final?t('The document is locked against accidental edits.','المستند مقفل ضد التعديل غير المقصود.'):t('Required fields passed validation.','تم اجتياز فحص الحقول الإلزامية.')}</span></div></div>
      <div className="issue-review-grid"><div><span>{t('Document','المستند')}</span><strong>{doc.number}</strong></div><div><span>{t('Customer','العميل')}</span><strong>{customer||'—'}</strong></div><div><span>{t('Items','الأصناف')}</span><strong>{doc.items.length}</strong></div><div><span>{t('Grand Total','الإجمالي النهائي')}</span><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong></div></div>
      <div className="issue-asset-checks"><span className={bankShown?'ok':''}><Icon name={bankShown?'check':'more'} size={14}/>{t('Bank details','بيانات البنك')}</span><span className={signatureShown?'ok':''}><Icon name={signatureShown?'check':'more'} size={14}/>{t('Signature','التوقيع')}</span><span className={stampShown?'ok':''}><Icon name={stampShown?'check':'more'} size={14}/>{t('Stamp','الختم')}</span></div>
      {issues.length?<div className="issue-warnings"><strong>{t('Quality check','فحص الجودة')}</strong>{issues.map((issue,index)=><div className={`issue-warning level-${issue.level}`} key={`${issue.code}-${index}`}><span>!</span><p>{issueText(issue)}</p></div>)}</div>:<div className="issue-clean"><Icon name="check" size={16}/>{t('No quality warnings detected.','لم يتم اكتشاف أي تنبيهات جودة.')}</div>}
    </div>
  </Modal>;
}
