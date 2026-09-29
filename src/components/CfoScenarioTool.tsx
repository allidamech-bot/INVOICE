import type { SavedItem, VaultPayload } from '../types.js';
import { decimalToScaled, isNonNegativeDecimalInput } from '../lib/money.js';
import { isArabic, t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
import { Button, Field, Input, Modal, Select } from './UI.js';

type Scenario='increase'|'discount'|'target-margin';
interface State{open:boolean;busy:boolean;vault:VaultPayload|null;productId:string;scenario:Scenario;percent:string;error:string;}

const SCALE=8;
function fixed(value:bigint,decimals=2):string{const scale=10n**BigInt(decimals),sign=value<0n?'-':'',abs=value<0n?-value:value;return `${sign}${abs/scale}.${(abs%scale).toString().padStart(decimals,'0')}`;}
function roundDivide(value:bigint,divisor:bigint):bigint{if(divisor===0n)return 0n;const sign=(value<0n)!==(divisor<0n)?-1n:1n,a=value<0n?-value:value,b=divisor<0n?-divisor:divisor;return ((a+b/2n)/b)*sign;}
function price(value:string):bigint{return decimalToScaled(value,SCALE);}
function money(value:bigint):string{return fixed(roundDivide(value,10n**BigInt(SCALE-2)),2);}
function pctText(part:bigint,total:bigint):string{if(total<=0n)return'—';return `${fixed(roundDivide(part*10_000n,total),2)}%`;}
function label(item:SavedItem):string{return[item.sku,item.descriptionEn||item.descriptionAr].filter(Boolean).join(' · ')||t('Unnamed product','صنف بلا اسم');}
function activeProducts(vault:VaultPayload):SavedItem[]{return vault.savedItems.filter(item=>!item.archived).sort((a,b)=>label(a).localeCompare(label(b)));}

export class CfoScenarioTool extends React.Component<{},State>{
  state:State={open:false,busy:false,vault:null,productId:'',scenario:'increase',percent:'5',error:''};
  private open=async()=>{this.setState({open:true,busy:true,error:''});try{const resumed=await resumeVaultSession();if(!resumed)throw new Error(t('Unlock LOUREX before running a CFO scenario.','افتح قفل LOUREX قبل تشغيل سيناريو CFO.'));const products=activeProducts(resumed.vault);this.setState({busy:false,vault:resumed.vault,productId:products[0]?.id||''});}catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}};
  private close=()=>{if(!this.state.busy)this.setState({open:false,error:''});};
  private result=()=>{
    const vault=this.state.vault,item=vault?.savedItems.find(entry=>entry.id===this.state.productId);if(!item)return null;
    const percent=this.state.percent.trim();if(!isNonNegativeDecimalInput(percent))return{item,error:t('Enter a valid non-negative percentage.','أدخل نسبة مئوية موجبة أو صفرًا.')};
    const basis=decimalToScaled(percent,4);if(basis>100_0000n)return{item,error:t('Use a percentage of 1000% or less.','استخدم نسبة 1000% أو أقل.')};
    const currentPrice=(item.lastUnitPrice||'').trim(),cost=(item.lastUnitCost||'').trim();if(!currentPrice&&this.state.scenario!=='target-margin')return{item,error:t('This product has no saved selling price to model.','هذا الصنف لا يملك سعر بيع محفوظًا لبناء السيناريو.')};
    if(this.state.scenario==='target-margin'&&!cost)return{item,error:t('Target-margin scenario needs a saved product cost.','سيناريو الهامش المستهدف يحتاج تكلفة محفوظة للصنف.')};
    const saleCurrency=(item.lastCurrency||'').toUpperCase(),costCurrency=(item.lastCostCurrency||'').toUpperCase();
    const current=price(currentPrice||'0'),unitCost=price(cost||'0');let next=0n;
    if(this.state.scenario==='increase')next=roundDivide(current*(1_000_000n+basis),1_000_000n);
    else if(this.state.scenario==='discount')next=roundDivide(current*(1_000_000n-basis),1_000_000n);
    else{if(basis>=1_000_000n)return{item,error:t('Target margin must be below 100%.','الهامش المستهدف يجب أن يكون أقل من 100%.')};next=roundDivide(unitCost*1_000_000n,1_000_000n-basis);}
    const comparable=Boolean(cost&&saleCurrency&&costCurrency&&saleCurrency===costCurrency);const currentMargin=comparable?pctText(current-unitCost,current):'—';const nextMargin=comparable?pctText(next-unitCost,next):this.state.scenario==='target-margin'?`${percent}%`:'—';const delta=next-current;
    return{item,error:'',saleCurrency: saleCurrency||costCurrency||'',costCurrency,currentPrice:currentPrice||'—',cost:cost||'—',nextPrice:money(next),currentMargin,nextMargin,delta:money(delta),comparable};
  };
  render():any{const products=this.state.vault?activeProducts(this.state.vault):[],result=this.result();return <><Button icon="chart" onClick={()=>void this.open()}>{t('CFO What-if','سيناريو CFO')}</Button><Modal open={this.state.open} title={t('LOUREX CFO — What-if Scenario','LOUREX CFO — سيناريو ماذا لو')} size="lg" onClose={this.close}>{this.state.busy?<p role="status">{t('Loading deterministic product data…','تحميل بيانات المنتجات الحتمية…')}</p>:this.state.error?<div role="alert" className="inline-error">{this.state.error}</div>:<div><p>{t('This tool calculates locally from saved LOUREX prices/costs. It never changes a product or writes a financial record.','هذه الأداة تحسب محليًا من أسعار وتكاليف LOUREX المحفوظة. لا تعدل أي منتج ولا تسجل قيدًا ماليًا.')}</p><Field label={t('Product','الصنف')}><Select value={this.state.productId} onChange={(event:any)=>this.setState({productId:event.target.value})}>{products.map(item=><option key={item.id} value={item.id}>{label(item)}</option>)}</Select></Field><Field label={t('Scenario','السيناريو')}><Select value={this.state.scenario} onChange={(event:any)=>this.setState({scenario:event.target.value as Scenario})}><option value="increase">{t('Raise selling price by %','رفع سعر البيع بنسبة %')}</option><option value="discount">{t('Apply discount to selling price %','تطبيق خصم على سعر البيع %')}</option><option value="target-margin">{t('Required price for target margin %','السعر المطلوب لهامش مستهدف %')}</option></Select></Field><Field label={t('Percent','النسبة %')}><Input inputMode="decimal" value={this.state.percent} onChange={(event:any)=>this.setState({percent:event.target.value})}/></Field>{result?.error?<div role="alert" className="inline-error">{result.error}</div>:result?<div><h3><bdi dir="auto">{label(result.item)}</bdi></h3><p><strong>{t('Current selling price','سعر البيع الحالي')}:</strong> <bdi dir="ltr">{result.currentPrice} {result.saleCurrency}</bdi> · <strong>{t('Saved cost','التكلفة المحفوظة')}:</strong> <bdi dir="ltr">{result.cost} {result.costCurrency}</bdi></p><p><strong>{t('Scenario price','سعر السيناريو')}:</strong> <bdi dir="ltr">{result.nextPrice} {result.saleCurrency}</bdi> · <strong>{t('Price change per unit','تغير السعر للوحدة')}:</strong> <bdi dir="ltr">{result.delta} {result.saleCurrency}</bdi></p><p><strong>{t('Current margin','الهامش الحالي')}:</strong> <bdi dir="ltr">{result.currentMargin}</bdi> · <strong>{t('Scenario margin','هامش السيناريو')}:</strong> <bdi dir="ltr">{result.nextMargin}</bdi></p>{!result.comparable?<small>{t('Margin comparison is withheld when saved cost and selling-price currencies are missing or different. LOUREX does not perform implicit FX conversion.','يتم حجب مقارنة الهامش عندما تكون عملة التكلفة وسعر البيع مفقودة أو مختلفة. لا يجري LOUREX تحويل عملات ضمنيًا.')}</small>:null}</div>:<p>{t('No product available for this scenario.','لا يوجد صنف متاح لهذا السيناريو.')}</p>}</div>}</Modal></>;}
}
