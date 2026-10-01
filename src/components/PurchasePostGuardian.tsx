import type { PurchaseRecord, SupplierSnapshot } from '../types.js';
import { t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { buildPurchaseGuardianReview, type PurchaseGuardianIssue, type PurchaseGuardianReview } from '../lib/purchase-guardian.js';
import { Button, Icon, Modal } from './UI.js';

interface Props{review:PurchaseGuardianReview;purchaseNumber:string;onCancel:()=>void;onContinue:()=>void;}

function value(input:Element|undefined|null):string{return input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement||input instanceof HTMLSelectElement?input.value.trim():'';}
function supplierSnapshot(source:any):SupplierSnapshot|null{return source?{sourceSupplierId:source.id,nameEn:source.nameEn||'',nameAr:source.nameAr||'',contactPerson:source.contactPerson||'',address:source.address||'',city:source.city||'',country:source.country||'',phone:source.phone||'',email:source.email||'',vatTaxNumber:source.vatTaxNumber||'',commercialRegistration:source.commercialRegistration||''}:null;}
function collectLivePurchase(button:HTMLButtonElement,vault:any):PurchaseRecord|null{
  const editor=button.closest('.ta-ops-purchase-editor');if(!(editor instanceof HTMLElement))return null;
  const sections=editor.querySelectorAll('.ta-ops-form-section');if(sections.length<3)return null;
  const identityInputs=sections[0]!.querySelectorAll('input');const supplierSelect=sections[0]!.querySelector('select');
  const number=value(identityInputs[0]),date=value(identityInputs[1]),dueDate=value(identityInputs[2]),currency=value(identityInputs[3]),supplierId=value(supplierSelect);
  if(!number||!date||!dueDate)return null;
  const supplier=vault.suppliers.find((entry:any)=>entry.id===supplierId);
  const base=vault.purchases.find((entry:any)=>entry.number===number);
  const items=Array.from(editor.querySelectorAll('.ta-purchase-item')).map((article,index)=>{const select=article.querySelector('select');const inputs=article.querySelectorAll('input');return{id:base?.items?.[index]?.id||`guardian-item-${index+1}`,savedItemId:value(select),sku:value(inputs[0]),descriptionEn:value(inputs[1]),descriptionAr:value(inputs[2]),quantity:value(inputs[3]),unit:value(inputs[4]),unitCost:value(inputs[5]),landedUnitCost:value(inputs[6]),previousUnitCost:'',previousCostCurrency:''};});
  if(!items.length)return null;
  const landedInputs=sections[2]!.querySelectorAll('input');const now=new Date().toISOString();
  return{id:base?.id||'guardian-live-draft',number,date,dueDate,supplierSnapshot:supplierSnapshot(supplier),currency:currency.toUpperCase(),items,freight:value(landedInputs[0]),duty:value(landedInputs[1]),otherCosts:value(landedInputs[2]),notes:'',status:'draft',postedAt:'',reversedAt:'',reverseReason:'',createdAt:base?.createdAt||now,updatedAt:now};
}

export async function preparePurchasePostGuardian(button:HTMLButtonElement):Promise<{review:PurchaseGuardianReview;purchaseNumber:string}|null>{
  const resumed=await resumeVaultSession();if(!resumed)return null;
  const purchase=collectLivePurchase(button,resumed.vault);if(!purchase)return null;
  const review=buildPurchaseGuardianReview(purchase,resumed.vault.savedItems);
  return review.issues.length?{review,purchaseNumber:purchase.number}:null;
}

function severityLabel(issue:PurchaseGuardianIssue):string{return issue.severity==='critical'?t('Critical','حرج'):issue.severity==='warning'?t('Warning','تحذير'):t('Info','معلومة');}
function codeLabel(issue:PurchaseGuardianIssue):string{
  if(issue.code==='missing-supplier')return t('Missing supplier','مورد مفقود');
  if(issue.code==='missing-currency')return t('Missing purchase currency','عملة الشراء مفقودة');
  if(issue.code==='missing-unit')return t('Missing item unit','وحدة الصنف مفقودة');
  if(issue.code==='missing-landed-cost-components')return t('Incomplete landed-cost inputs','مدخلات تكلفة الوصول غير مكتملة');
  if(issue.code==='unmatched-item')return t('Unmatched purchase item','صنف شراء غير مطابق');
  if(issue.code==='zero-cost')return t('Missing / zero unit cost','تكلفة الوحدة مفقودة / صفر');
  if(issue.code==='cost-currency-mismatch')return t('Cost currency mismatch','اختلاف عملة التكلفة');
  if(issue.code==='abnormal-landed-cost')return t('Abnormal landed cost','تكلفة وصول غير معتادة');
  return t('Possible duplicate line','سطر مكرر محتمل');
}

export class PurchasePostGuardian extends React.Component<Props>{
  render():any{const {review}=this.props;return <Modal open title={t(`Accounting Guardian — ${this.props.purchaseNumber}`,`حارس المحاسبة — ${this.props.purchaseNumber}`)} size="lg" onClose={this.props.onCancel} footer={<div className="modal-footer-actions"><Button onClick={this.props.onCancel}>{t('Back to Purchase','العودة للشراء')}</Button><Button variant="primary" onClick={this.props.onContinue}>{t('Continue to Post Confirmation','المتابعة إلى تأكيد الترحيل')}</Button></div>}>
    <div className="product-import-mapping-note"><Icon name="lock"/><span>{t('LOUREX reviewed the live purchase values before posting. These are deterministic warnings only; nothing has been posted or changed yet. Missing values stay missing and are never treated as zero or PCS by the Guardian.','راجع LOUREX قيم الشراء الحالية قبل الترحيل. هذه تنبيهات حتمية فقط؛ لم يتم ترحيل أو تغيير أي شيء بعد. تبقى القيم المفقودة مفقودة ولا يعاملها الحارس كصفر أو PCS.')}</span></div>
    <p><strong>{t('Review summary','ملخص المراجعة')}:</strong> {review.counts.critical} {t('critical','حرج')} · {review.counts.warning} {t('warnings','تحذير')} · {review.counts.info} {t('info','معلومة')}</p>
    <div>{review.issues.map((issue,index)=><article key={`${issue.code}-${issue.lineIndex}-${index}`} style={{padding:'10px 0'}}><small>{severityLabel(issue)}{issue.lineIndex>=0?` · ${t(`Item ${issue.lineIndex+1}`,`الصنف ${issue.lineIndex+1}`)}`:''}</small><strong style={{display:'block'}}>{codeLabel(issue)}</strong><p>{issue.detail}</p></article>)}</div>
    <p><small>{t('Continue only after you have reviewed the flagged values. The existing LOUREX posting confirmation and posting engine remain unchanged.','تابع فقط بعد مراجعة القيم المشار إليها. تبقى نافذة تأكيد الترحيل ومحرك الترحيل الحاليان في LOUREX بدون تغيير.')}</small></p>
  </Modal>;}
}
