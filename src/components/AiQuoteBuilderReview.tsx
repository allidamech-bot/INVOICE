import type { VaultPayload } from '../types.js';
import { t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { createBlankDocument, nextDocumentNumber } from '../lib/documents.js';
import { customerSnapshotFrom } from '../lib/defaults.js';
import { applyCustomerCommercialDefaults } from '../lib/commercial-controls.js';
import { createDocumentEvent } from '../lib/document-lifecycle.js';
import { aiQuoteDocumentItem, applyAiQuotePricingCommand, buildAiQuoteReview, matchQuoteCustomer, type AiQuoteReview, type AiQuoteSourceDraft, type AiQuoteWarning } from '../lib/ai-quote-builder.js';
import { Button, Field, Input } from './UI.js';

interface Props {draft:AiQuoteSourceDraft;onDraftChange:(draft:AiQuoteSourceDraft)=>void;onSaved:(label:string)=>void;}
interface State {review:AiQuoteReview|null;command:string;busy:boolean;error:string;commandMessage:string;}

function warningLabel(value:AiQuoteWarning):string{
  if(value==='below-cost')return t('Below cost','أقل من التكلفة');
  if(value==='below-policy')return t('Below pricing policy','أقل من سياسة التسعير');
  if(value==='missing-cost')return t('Missing cost','التكلفة مفقودة');
  if(value==='currency-mismatch')return t('Currency mismatch','اختلاف العملة');
  if(value==='unknown-product')return t('Unknown product','منتج غير معروف');
  if(value==='ambiguous-quantity')return t('Ambiguous quantity','كمية ملتبسة');
  return t('Low match confidence','ثقة مطابقة منخفضة');
}
function percent(value:number):string{return `${Math.round(Math.max(0,Math.min(1,value))*100)}%`;}
function valueOrDash(value:string):string{return value.trim()||'—';}

export class AiQuoteBuilderReview extends React.Component<Props,State>{
  private vault:VaultPayload|null=null;
  state:State={review:null,command:'',busy:false,error:'',commandMessage:''};
  componentDidMount():void{void this.refresh(this.props.draft);}
  componentDidUpdate(prev:Props):void{if(prev.draft!==this.props.draft)void this.refresh(this.props.draft);}

  private refresh=async(draft:AiQuoteSourceDraft)=>{
    try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before reviewing this quotation.','افتح قفل LOUREX قبل مراجعة عرض السعر.'));this.vault=resumed.vault;this.setState({review:buildAiQuoteReview(resumed.vault,draft),error:''});}
    catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}
  };

  private applyCommand=()=>{
    const command=this.state.command.trim(),vault=this.vault;if(!command||!vault||this.state.busy)return;
    const result=applyAiQuotePricingCommand(vault,this.props.draft,command);
    if(!result.applied){this.setState({commandMessage:t('No line could safely apply this command. Check cost, currency and matching first.','لم يتمكن أي بند من تطبيق هذا الأمر بأمان. راجع التكلفة والعملة والمطابقة أولًا.')});return;}
    this.setState({command:'',commandMessage:t(`Applied to ${result.applied} line(s). Review the prices before saving.`,`تم التطبيق على ${result.applied} بند. راجع الأسعار قبل الحفظ.`)});
    this.props.onDraftChange(result.draft);
  };

  private save=async()=>{
    const draft=this.props.draft,review=this.state.review;if(!review||this.state.busy)return;
    if(review.lines.some(line=>!line.proposedPrice)){this.setState({error:t('Every quotation line needs a reviewed proposed price before the draft can be saved.','كل بند في عرض السعر يحتاج سعرًا مقترحًا مُراجعًا قبل حفظ المسودة.')});return;}
    if(review.lines.some(line=>line.warnings.includes('ambiguous-quantity'))){this.setState({error:t('Resolve ambiguous quantities before saving the quotation draft.','عالج الكميات الملتبسة قبل حفظ مسودة عرض السعر.')});return;}
    this.setState({busy:true,error:''});
    try{
      const next=await mutateVaultSafely(vault=>{
        const numbered=nextDocumentNumber(vault,'proforma');
        let doc=createBlankDocument('proforma',numbered.number,vault.company);
        const matched=matchQuoteCustomer(vault.customers,draft).customer;
        if(matched)doc=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(matched)},matched,vault.company);
        const currency=review.currency;
        const reviewedDraft:AiQuoteSourceDraft={...draft,items:draft.items.map((row,index)=>({...row,unitPrice:review.lines[index]?.proposedPrice||row.unitPrice}))};
        doc={...doc,currency,items:reviewedDraft.items.map(row=>aiQuoteDocumentItem(row,vault,currency)),terms:{...doc.terms,incoterm:draft.incoterm||doc.terms.incoterm,paymentTerms:draft.paymentTerms||doc.terms.paymentTerms,deliveryTime:draft.deliveryTime||doc.terms.deliveryTime,validity:draft.validity||doc.terms.validity,remarks:draft.remarks||doc.terms.remarks},notes:[doc.notes,draft.notes].filter(Boolean).join('\n'),updatedAt:new Date().toISOString()};
        return{...numbered.vault,documents:[...numbered.vault.documents,doc],documentEvents:[...numbered.vault.documentEvents,createDocumentEvent(doc,'created')]};
      });
      const saved=next.documents.at(-1);this.props.onSaved(saved?t(`Quotation draft ${saved.number} saved for review`,`تم حفظ مسودة عرض السعر ${saved.number} للمراجعة`):t('Quotation draft saved for review','تم حفظ مسودة عرض السعر للمراجعة'));
    }catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}
    finally{this.setState({busy:false});}
  };

  render():any{
    const review=this.state.review;if(!review)return <div>{this.state.error?<div role="alert">{this.state.error}</div>:<p>{t('Preparing deterministic quotation review…','تجهيز مراجعة عرض السعر الحتمية…')}</p>}</div>;
    return <div>
      <h3>{t('Quotation review','مراجعة عرض السعر')}</h3>
      <p><strong>{review.customerName||t('Customer not identified','لم يتم تحديد العميل')}</strong> · {review.currency}{review.customerName?` · ${t('Customer match','مطابقة العميل')} ${percent(review.customerMatchConfidence)}`:''}</p>
      {review.warnings.includes('customer-not-matched')?<div role="alert">{t('Customer was not matched to a saved LOUREX customer. Create/review the customer before relying on customer history.','لم تتم مطابقة العميل مع عميل محفوظ في LOUREX. أنشئ/راجع العميل قبل الاعتماد على سجله السابق.')}</div>:null}
      {review.warnings.includes('currency-not-explicit')?<div role="status">{t('The source did not explicitly state a currency. LOUREX is showing the current default currency for review.','المصدر لم يذكر عملة صراحةً. يعرض LOUREX العملة الافتراضية الحالية للمراجعة.')}</div>:null}
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th>{t('Product','الصنف')}</th><th>{t('Qty','الكمية')}</th><th>{t('Match','المطابقة')}</th><th>{t('Cost','التكلفة')}</th><th>{t('Proposed','المقترح')}</th><th>{t('Margin','الهامش')}</th><th>{t('Warnings','تحذيرات')}</th></tr></thead><tbody>{review.lines.map(line=><tr key={line.index}><td><strong><bdi dir="auto">{line.source.descriptionEn||line.source.descriptionAr||line.source.sku}</bdi></strong>{line.matchLabel?<small style={{display:'block'}}>{line.matchLabel}</small>:null}</td><td><bdi dir="ltr">{line.source.quantity} {line.source.unit}</bdi>{line.source.quantityNote?<small style={{display:'block'}}><bdi dir="auto">{line.source.quantityNote}</bdi></small>:null}</td><td>{line.matchId?`${percent(line.matchConfidence)} · ${line.matchBasis}`:t('No match','لا يوجد')}</td><td><bdi dir="ltr">{line.cost?`${line.cost} ${line.costCurrency}`:'—'}</bdi></td><td><bdi dir="ltr">{valueOrDash(line.proposedPrice)} {line.proposedPrice?review.currency:''}</bdi>{line.lastCustomerPrice?<small style={{display:'block'}}>{t('Customer last','آخر سعر للعميل')}: {line.lastCustomerPrice}</small>:null}{line.policyPrice?<small style={{display:'block'}}>{t('Policy','السياسة')}: {line.policyPrice}</small>:null}</td><td>{line.marginPercent?`${line.marginPercent}%`:'—'}</td><td>{line.warnings.length?line.warnings.map(warningLabel).join(' · '):t('Clear','سليم')}</td></tr>)}</tbody></table></div>
      <Field label={t('Pricing command','أمر التسعير')} hint={t('Examples: Margin 15%, use last customer price, raise prices 4%, use company policy. LOUREX calculates locally.','مثال: هامش 15%، استخدم آخر سعر للعميل، ارفع الأسعار 4%، استخدم سياسة الشركة. الحساب يتم محليًا داخل LOUREX.')}><Input value={this.state.command} onChange={(event:any)=>this.setState({command:event.target.value,commandMessage:''})} onKeyDown={(event:any)=>{if(event.key==='Enter'){event.preventDefault();this.applyCommand();}}}/></Field>
      <div className="ta-customer-modal-actions"><Button disabled={!this.state.command.trim()||this.state.busy} onClick={this.applyCommand}>{t('Apply to proposal','طبق على المقترح')}</Button><Button variant="primary" disabled={this.state.busy} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Confirm & Save Quotation Draft','تأكيد وحفظ مسودة عرض السعر')}</Button></div>
      {this.state.commandMessage?<p role="status">{this.state.commandMessage}</p>:null}
      {this.state.error?<div role="alert">{this.state.error}</div>:null}
      <p><small>{t('AI interprets the source and command. LOUREX performs matching, pricing calculations and warnings. Saving creates a draft only.','الذكاء الاصطناعي يفهم المصدر والأمر. LOUREX يقوم بالمطابقة والحسابات والتحذيرات. الحفظ ينشئ مسودة فقط.')}</small></p>
    </div>;
  }
}
