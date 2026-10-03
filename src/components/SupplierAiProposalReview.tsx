import type { Supplier } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { validateSupplier } from '../lib/operations.js';
import { findSupplierDuplicateCandidates, supplierAiFieldLabel, supplierFromAiProposal, type SupplierAiProposal, type SupplierDuplicateCandidate } from '../lib/supplier-ai-capture.js';
import { Button, Field, Icon, Input } from './UI.js';

interface Props{proposal:SupplierAiProposal;onSaved:(label:string)=>void;}
interface State{duplicates:SupplierDuplicateCandidate[];choice:'new'|string;currencyOverride:string;busy:boolean;error:string;}

function nameOf(supplier:Supplier):string{return(supplier.nameEn||supplier.nameAr||supplier.contactPerson||t('Supplier','مورد')).trim();}
function proposalName(proposal:SupplierAiProposal):string{return proposal.fields.nameEn.value||proposal.fields.nameAr.value||t('New supplier','مورد جديد');}

export class SupplierAiProposalReview extends React.Component<Props,State>{
  state:State={duplicates:[],choice:'new',currencyOverride:'',busy:false,error:''};
  private mounted=false;
  private saving=false;
  private loadGeneration=0;
  componentDidMount():void{this.mounted=true;void this.loadDuplicates();}
  componentDidUpdate(prev:Props):void{if(prev.proposal!==this.props.proposal)void this.loadDuplicates();}
  componentWillUnmount():void{this.mounted=false;this.loadGeneration++;}
  private loadDuplicates=async()=>{
    const generation=++this.loadGeneration,proposal=this.props.proposal;
    try{const resumed=await resumeVaultSession();if(!this.mounted||generation!==this.loadGeneration)return;if(!resumed)throw new Error(t('Unlock LOUREX before reviewing supplier duplicates.','افتح قفل LOUREX قبل مراجعة تكرار الموردين.'));const candidate=supplierFromAiProposal(proposal);const duplicates=findSupplierDuplicateCandidates(resumed.vault.suppliers,candidate);this.setState({duplicates,choice:'new',currencyOverride:'',error:''});}
    catch(error){if(this.mounted&&generation===this.loadGeneration)this.setState({error:error instanceof Error?error.message:String(error)});}
  };
  private save=async()=>{
    if(this.saving||this.state.busy)return;this.saving=true;const proposal=this.props.proposal,choice=this.state.choice,currencyOverride=this.state.currencyOverride,onSaved=this.props.onSaved;this.setState({busy:true,error:''});
    try{
      const next=await mutateVaultSafely(vault=>{
        const existing=choice==='new'?undefined:vault.suppliers.find(row=>row.id===choice);if(choice!=='new'&&!existing)throw new Error(t('The selected supplier no longer exists. Review the source again.','المورد المحدد لم يعد موجودًا. راجع المصدر من جديد.'));const candidate=supplierFromAiProposal(proposal,existing);
        if(!existing&&!candidate.defaultCurrency.trim()){
          const currency=currencyOverride.trim().toUpperCase();
          if(!/^[A-Z]{3}$/.test(currency))throw new Error(t('Choose a valid 3-letter supplier currency before creating this supplier.','اختر عملة صحيحة من 3 أحرف للمورد قبل إنشاء المورد.'));
          candidate.defaultCurrency=currency;
        }
        const errors=validateSupplier(candidate);if(errors.length)throw new Error(errors.join(' '));
        return existing?{...vault,suppliers:vault.suppliers.map(row=>row.id===existing.id?candidate:row)}:{...vault,suppliers:[...vault.suppliers,candidate]};
      });
      const saved=choice==='new'?next.suppliers.at(-1):next.suppliers.find(row=>row.id===choice);if(this.mounted&&this.props.proposal===proposal)onSaved(saved?t(`Supplier ${nameOf(saved)} saved after review`,`تم حفظ المورد ${nameOf(saved)} بعد المراجعة`):t('Supplier saved after review','تم حفظ المورد بعد المراجعة'));
    }catch(error){if(this.mounted&&this.props.proposal===proposal)this.setState({error:error instanceof Error?error.message:String(error)});}
    finally{this.saving=false;if(this.mounted)this.setState({busy:false});}
  };
  render():any{
    const proposal=this.props.proposal;const needsCurrency=this.state.choice==='new'&&!proposal.fields.defaultCurrency.value.trim();return <div>
      <h3>{t('Supplier proposal review','مراجعة مقترح المورد')}</h3>
      <p><strong><bdi dir="auto">{proposalName(proposal)}</bdi></strong></p>
      <div className="product-import-mapping-note"><Icon name="lock"/><span>{t('Nothing is merged automatically. Review extracted evidence, then choose Create New or one specific existing supplier to update.','لا يتم دمج أي شيء تلقائيًا. راجع الأدلة المستخرجة ثم اختر إنشاء مورد جديد أو موردًا موجودًا محددًا لتحديثه.')}</span></div>
      <div className="product-import-table-wrap"><table className="product-import-table"><thead><tr><th>{t('Field','الحقل')}</th><th>{t('Extracted value','القيمة المستخرجة')}</th><th>{t('Confidence','الثقة')}</th><th>{t('Source','المصدر')}</th></tr></thead><tbody>{Object.entries(proposal.fields).map(([key,field])=>field.value?<tr key={key}><td>{supplierAiFieldLabel(key as any,isArabic())}</td><td><bdi dir="auto">{field.value}</bdi></td><td>{Math.round(field.confidence*100)}%</td><td><small><bdi dir="auto">{field.sourceFile}{field.sourcePage?` · p.${field.sourcePage}`:''}</bdi></small>{field.sourceExcerpt?<small style={{display:'block'}}><bdi dir="auto">{field.sourceExcerpt}</bdi></small>:null}</td></tr>:null)}</tbody></table></div>
      {proposal.conflicts.length?<div role="alert"><strong>{t('Conflicting source values require review','قيم متعارضة في المصادر تحتاج مراجعة')}</strong>{proposal.conflicts.map(conflict=><p key={conflict.field}>{supplierAiFieldLabel(conflict.field,isArabic())}: {conflict.values.map(row=>row.value).join(' / ')}</p>)}</div>:null}
      <section><strong>{t('Save decision','قرار الحفظ')}</strong><label style={{display:'block',marginTop:'8px'}}><input type="radio" disabled={this.state.busy} name="supplier-ai-choice" checked={this.state.choice==='new'} onChange={()=>this.setState({choice:'new'})}/> {t('Create a new supplier','إنشاء مورد جديد')}</label>{this.state.duplicates.map(candidate=><label key={candidate.supplier.id} style={{display:'block',marginTop:'8px'}}><input type="radio" disabled={this.state.busy} name="supplier-ai-choice" checked={this.state.choice===candidate.supplier.id} onChange={()=>this.setState({choice:candidate.supplier.id})}/> {t('Update existing','تحديث الموجود')}: <bdi dir="auto">{nameOf(candidate.supplier)}</bdi> · {candidate.score} · {candidate.reasons.join(', ')}</label>)}</section>
      {needsCurrency?<Field label={t('Supplier currency — required to create','عملة المورد — مطلوبة للإنشاء')} hint={t('The source did not contain a currency. LOUREX will not invent one; enter the 3-letter currency you want to save.','المصدر لا يحتوي عملة. لن يخترع LOUREX عملة؛ أدخل العملة من 3 أحرف التي تريد حفظها.')}><Input disabled={this.state.busy} maxLength={3} autoCapitalize="characters" value={this.state.currencyOverride} onChange={(event:any)=>this.setState({currencyOverride:String(event.target.value).toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)})} placeholder="USD"/></Field>:null}
      {this.state.error?<div role="alert">{this.state.error}</div>:null}
      <div className="ta-customer-modal-actions"><Button variant="primary" disabled={this.state.busy||(needsCurrency&&!/^[A-Z]{3}$/.test(this.state.currencyOverride.trim().toUpperCase()))} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):this.state.choice==='new'?t('Create Supplier','إنشاء المورد'):t('Update Existing Supplier','تحديث المورد الموجود')}</Button></div>
    </div>;
  }
}
