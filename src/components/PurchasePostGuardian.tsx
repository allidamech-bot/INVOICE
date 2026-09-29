import { t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { reviewPurchaseBeforePost, type PurchaseGuardianDraft, type PurchaseGuardianIssue, type PurchaseGuardianReview } from '../lib/purchase-post-guardian.js';
import { Button, Icon, Modal } from './UI.js';

interface Props{review:PurchaseGuardianReview;purchaseNumber:string;onCancel:()=>void;onContinue:()=>void;}

function value(input:Element|undefined|null):string{return input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement||input instanceof HTMLSelectElement?input.value.trim():'';}
function collectDraft(button:HTMLButtonElement):PurchaseGuardianDraft|null{
  const editor=button.closest('.ta-ops-purchase-editor');if(!(editor instanceof HTMLElement))return null;
  const sections=editor.querySelectorAll('.ta-ops-form-section');if(sections.length<3)return null;
  const identityInputs=sections[0]!.querySelectorAll('input');const supplier=sections[0]!.querySelector('select');
  const number=value(identityInputs[0]),currency=value(identityInputs[2]??identityInputs[identityInputs.length-1]),supplierId=value(supplier);
  const rows=Array.from(editor.querySelectorAll('.ta-purchase-item')).map(article=>{const select=article.querySelector('select');const inputs=article.querySelectorAll('input');return{savedItemId:value(select),sku:value(inputs[0]),descriptionEn:value(inputs[1]),descriptionAr:value(inputs[2]),quantity:value(inputs[3]),unitCost:value(inputs[5]),landedUnitCost:value(inputs[6])};});
  const landedInputs=sections[2]!.querySelectorAll('input');
  if(!number||!currency||!supplierId||!rows.length)return null;
  return{number,currency,supplierId,items:rows,freight:value(landedInputs[0]),duty:value(landedInputs[1]),otherCosts:value(landedInputs[2])};
}

export async function preparePurchasePostGuardian(button:HTMLButtonElement):Promise<{review:PurchaseGuardianReview;purchaseNumber:string}|null>{
  const draft=collectDraft(button);if(!draft)return null;
  const resumed=await resumeVaultSession();if(!resumed)return null;
  const review=reviewPurchaseBeforePost(draft,resumed.vault.savedItems);
  return review.issues.length?{review,purchaseNumber:draft.number}:null;
}

function severityLabel(issue:PurchaseGuardianIssue):string{return issue.severity==='critical'?t('Critical','حرج'):issue.severity==='warning'?t('Warning','تحذير'):t('Info','معلومة');}
function issueTitle(issue:PurchaseGuardianIssue):string{
  const ar:Record<PurchaseGuardianIssue['code'],string>={
    'unmatched-item':'بند شراء غير مرتبط بصنف محفوظ','zero-cost':'تكلفة شراء صفرية أو مفقودة','duplicate-line':'احتمال تكرار بند شراء','currency-mismatch':'تغير عملة التكلفة','cost-change':'تغير كبير في تكلفة الشراء','landed-cost-uplift':'ارتفاع كبير في تكلفة الوصول','landed-total-uplift':'تكاليف وصول مرتفعة'
  };return t(issue.title,ar[issue.code]);
}
function issueDetail(issue:PurchaseGuardianIssue):string{
  const ar:Record<PurchaseGuardianIssue['code'],string>={
    'unmatched-item':'هذا البند غير مرتبط بصنف محفوظ. ترحيله لن يحدّث تكلفة صنف رئيسي لهذا السطر.','zero-cost':'لا توجد تكلفة وحدة موجبة لهذا البند. راجع تكلفة المورد قبل الترحيل.','duplicate-line':'يبدو أن نفس الصنف موجود أكثر من مرة. راجع الكميات قبل الترحيل.','currency-mismatch':'عملة آخر تكلفة مسجلة تختلف عن عملة هذا الشراء؛ لن يعامل LOUREX القيمتين كأنهما بنفس العملة.','cost-change':'تكلفة الشراء تغيرت بشكل كبير عن آخر تكلفة مسجلة بنفس العملة.','landed-cost-uplift':'تكلفة الوحدة بعد الوصول أعلى بشكل ملحوظ من تكلفة المورد. راجع الشحن والجمارك والتكاليف الإضافية.','landed-total-uplift':'الشحن والجمارك والتكاليف الإضافية مرتفعة نسبةً إلى قيمة الأصناف. راجع التوزيع قبل الترحيل.'
  };return t(issue.detail,ar[issue.code]);
}

export class PurchasePostGuardian extends React.Component<Props>{
  render():any{const {review}=this.props;return <Modal open title={t(`Accounting Guardian — ${this.props.purchaseNumber}`,`حارس المحاسبة — ${this.props.purchaseNumber}`)} size="lg" onClose={this.props.onCancel} footer={<div className="modal-footer-actions"><Button onClick={this.props.onCancel}>{t('Back to Purchase','العودة للشراء')}</Button><Button variant="primary" onClick={this.props.onContinue}>{t('Continue to Post Confirmation','المتابعة إلى تأكيد الترحيل')}</Button></div>}>
    <div className="product-import-mapping-note"><Icon name="lock"/><span>{t('LOUREX reviewed the live purchase values before posting. These are deterministic warnings only; nothing has been posted or changed yet.','راجع LOUREX قيم الشراء الحالية قبل الترحيل. هذه تنبيهات حتمية فقط؛ لم يتم ترحيل أو تغيير أي شيء بعد.')}</span></div>
    <p><strong>{t('Review summary','ملخص المراجعة')}:</strong> {review.critical} {t('critical','حرج')} · {review.warnings} {t('warnings','تحذير')}</p>
    <div>{review.issues.map((issue,index)=><article key={`${issue.code}-${issue.itemIndex}-${index}`} style={{padding:'10px 0'}}><small>{severityLabel(issue)}{issue.itemIndex>=0?` · ${t(`Item ${issue.itemIndex+1}`,`الصنف ${issue.itemIndex+1}`)}`:''}</small><strong style={{display:'block'}}>{issueTitle(issue)}</strong><p>{issueDetail(issue)}</p>{!t('', '')&&false?<span/>:null}</article>)}</div>
    <p><small>{t('Continue only after you have reviewed the flagged values. The existing LOUREX posting confirmation and posting engine remain unchanged.','تابع فقط بعد مراجعة القيم المشار إليها. تبقى نافذة تأكيد الترحيل ومحرك الترحيل الحاليان في LOUREX بدون تغيير.')}</small></p>
  </Modal>;}
}
