import type { UiLanguage } from '../types.js';
import { isArabic, t } from '../lib/i18n.js';
import {
  PACKING_COUNT_CHOICES,
  PACKING_SIZE_CHOICES,
  buildPackingPreset,
  countryChoices,
  currencyChoices,
  packingTypeChoices,
  parsePackingPreset,
  unitChoices,
  type PresetChoice
} from '../lib/product-presets.js';
import { deliveryTimeChoices, incotermChoices, paymentTermChoices } from '../lib/workflow-presets.js';

export type IconName = 'plus'|'settings'|'search'|'file'|'users'|'items'|'save'|'download'|'share'|'copy'|'trash'|'edit'|'lock'|'x'|'chevronDown'|'chevronUp'|'arrowLeft'|'printer'|'check'|'more'|'eye'|'upload'|'backup'|'restore'|'refresh'|'invoice'|'proforma'|'menu';

const paths: Record<IconName, any> = {
  plus: <g><path d="M12 5v14M5 12h14"/></g>, settings: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06-.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.8 1 1 .3.2.7.3 1.1.3h.1v4h-.1a1.7 1.7 0 0 0-2.1.7Z"/></g>,
  search:<g><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></g>, file:<g><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></g>, users:<g><path d="M16 21v-2a4 4 0 0 1 4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></g>, items:<g><path d="m4 7 8-4 8 4-8 4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4Z"/><path d="M12 11v10"/></g>,
  save:<g><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></g>, download:<g><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></g>, share:<g><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></g>, copy:<g><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></g>, trash:<g><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></g>, edit:<g><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></g>, lock:<g><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></g>, x:<g><path d="m6 6 12 12M18 6 6 18"/></g>, chevronDown:<g><path d="m6 9 6 6 6-6"/></g>, chevronUp:<g><path d="m18 15-6-6-6 6"/></g>, arrowLeft:<g><path d="M19 12H5M12 19l-7-7 7-7"/></g>, printer:<g><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></g>,
  check:<g><path d="m5 12 4 4L19 6"/></g>, more:<g><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></g>, eye:<g><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></g>, upload:<g><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 20h14"/></g>, backup:<g><path d="M4 7v4h4M20 17v-4h-4"/><path d="M6.1 16A7 7 0 1 0 5 8.3M17.9 8A7 7 0 0 0 19 15.7"/></g>, restore:<g><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></g>, refresh:<g><path d="M20 11a8 8 0 0 0-14.9-4L3 10M4 13a8 8 0 0 0 14.9 4L21 14"/><path d="M3 4v6h6M21 20v-6h-6"/></g>, invoice:<g><path d="M6 2h9l4 4v16H6z"/><path d="M15 2v5h5M9 11h7M9 15h7M9 19h4"/></g>, proforma:<g><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h5M7 16h3"/></g>, menu:<g><path d="M4 6h16M4 12h16M4 18h16"/></g>
};

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }): any {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Button({ children, icon, variant = 'secondary', className = '', type = 'button', ...rest }: any): any {
  return <button type={type} className={`btn btn-${variant} ${className}`} {...rest}>{icon ? <Icon name={icon}/> : null}<span>{children}</span></button>;
}

export function IconButton({ icon, label, variant = 'ghost', className = '', type = 'button', ...rest }: any): any {
  return <button type={type} className={`icon-btn icon-btn-${variant} ${className}`} aria-label={label} title={label} {...rest}><Icon name={icon}/></button>;
}

export function Input({ className = '', ...props }: any): any { return <input className={`input ${className}`} {...props}/>; }
export function Select({ className = '', ...props }: any): any { return <select className={`input select ${className}`} {...props}/>; }
export function Textarea({ className = '', ...props }: any): any { return <textarea className={`input textarea ${className}`} {...props}/>; }

type SmartProductFieldKind='unit'|'currency'|'origin'|'packing'|'incoterm'|'payment'|'delivery';
interface PresetControlProps { value:string; choices:PresetChoice[]; label:string; onChange:(value:string)=>void; uppercase?:boolean; }
interface PresetControlState { custom:boolean; }

function isKnownPreset(value:string,choices:PresetChoice[]):boolean{return choices.some(choice=>choice.value===value);}

class PresetControl extends React.Component<PresetControlProps,PresetControlState>{
  constructor(props:PresetControlProps){super(props);this.state={custom:Boolean(props.value)&&!isKnownPreset(props.value,props.choices)};}
  componentDidUpdate(prev:PresetControlProps):void{
    if(prev.value===this.props.value&&!this.props.value)return;
    if(this.props.value){
      const custom=!isKnownPreset(this.props.value,this.props.choices);
      if(custom!==this.state.custom)this.setState({custom});
    }
  }
  private select=(value:string)=>{
    if(value==='__custom'){
      this.setState({custom:true});
      if(isKnownPreset(this.props.value,this.props.choices))this.props.onChange('');
      return;
    }
    this.setState({custom:false});
    this.props.onChange(value);
  };
  render():any{
    const known=isKnownPreset(this.props.value,this.props.choices);
    const selectValue=this.state.custom?'__custom':known?this.props.value:'';
    const customValue=this.state.custom&&!known?this.props.value:'';
    return <div className="product-preset-control">
      <Select aria-label={this.props.label} value={selectValue} onChange={(e:any)=>this.select(String(e.target.value))}>
        <option value="">{t('Choose…','اختر…')}</option>
        {this.props.choices.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}
        <option value="__custom">{t('Other / Custom','أخرى / مخصص')}</option>
      </Select>
      {this.state.custom?<Input className="product-preset-custom" aria-label={t(`Custom ${this.props.label}`,`قيمة مخصصة: ${this.props.label}`)} value={customValue} placeholder={t('Enter custom value','أدخل قيمة مخصصة')} onChange={(e:any)=>this.props.onChange(this.props.uppercase?String(e.target.value).toUpperCase():String(e.target.value))}/>:null}
    </div>;
  }
}

interface PackingControlProps { value:string; label:string; onChange:(value:string)=>void; }
interface PackingControlState { custom:boolean; }
class PackingControl extends React.Component<PackingControlProps,PackingControlState>{
  constructor(props:PackingControlProps){super(props);this.state={custom:parsePackingPreset(props.value).custom};}
  componentDidUpdate(prev:PackingControlProps):void{
    if(prev.value===this.props.value||!this.props.value)return;
    const custom=parsePackingPreset(this.props.value).custom;
    if(custom!==this.state.custom)this.setState({custom});
  }
  private chooseType=(type:string)=>{
    const parsed=parsePackingPreset(this.props.value);
    if(type==='__custom'){
      this.setState({custom:true});
      if(!parsed.custom)this.props.onChange('');
      return;
    }
    this.setState({custom:false});
    this.props.onChange(buildPackingPreset(type,parsed.custom?'':parsed.count,parsed.custom?'':parsed.size));
  };
  private chooseCount=(count:string)=>{
    const parsed=parsePackingPreset(this.props.value);
    if(parsed.custom||!parsed.type)return;
    this.props.onChange(buildPackingPreset(parsed.type,count,count?parsed.size:''));
  };
  private chooseSize=(size:string)=>{
    const parsed=parsePackingPreset(this.props.value);
    if(parsed.custom||!parsed.type||!parsed.count)return;
    this.props.onChange(buildPackingPreset(parsed.type,parsed.count,size));
  };
  render():any{
    const arabic=isArabic();
    const parsed=parsePackingPreset(this.props.value);
    const types=packingTypeChoices(arabic);
    if(this.state.custom){
      return <div className="product-preset-control packing-preset-control is-custom">
        <Select aria-label={this.props.label} value="__custom" onChange={(e:any)=>this.chooseType(String(e.target.value))}>
          <option value="">{t('Choose packing','اختر التعبئة')}</option>
          {types.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}
          <option value="__custom">{t('Other / Custom','أخرى / مخصص')}</option>
        </Select>
        <Input className="product-preset-custom" aria-label={t('Custom packing','تعبئة مخصصة')} value={parsed.custom?this.props.value:''} placeholder={t('e.g. 12 boxes × 24 pcs','مثال: 12 علبة × 24 قطعة')} onChange={(e:any)=>this.props.onChange(String(e.target.value))}/>
      </div>;
    }
    return <div className="packing-preset-control">
      <Select aria-label={this.props.label} value={parsed.type} onChange={(e:any)=>this.chooseType(String(e.target.value))}>
        <option value="">{t('Package type','نوع التعبئة')}</option>
        {types.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}
        <option value="__custom">{t('Other / Custom','أخرى / مخصص')}</option>
      </Select>
      <div className="packing-preset-details">
        <Select aria-label={t('Units per package','عدد الوحدات في العبوة')} value={parsed.count} disabled={!parsed.type} onChange={(e:any)=>this.chooseCount(String(e.target.value))}>
          <option value="">{t('Count','العدد')}</option>
          {PACKING_COUNT_CHOICES.map(count=><option key={count} value={count}>{count}</option>)}
        </Select>
        <Select aria-label={t('Unit size or weight','حجم أو وزن الوحدة')} value={parsed.size} disabled={!parsed.type||!parsed.count} onChange={(e:any)=>this.chooseSize(String(e.target.value))}>
          <option value="">{t('Size / weight','الحجم / الوزن')}</option>
          {PACKING_SIZE_CHOICES.map(size=><option key={size} value={size}>{size}</option>)}
        </Select>
      </div>
      {this.props.value?<span className="packing-preset-preview">{this.props.value}</span>:null}
    </div>;
  }
}

function smartFieldKind(label:any):SmartProductFieldKind|null{
  if(typeof label!=='string')return null;
  if(label===t('Unit','الوحدة'))return 'unit';
  if(label===t('Currency','العملة')||label===t('Default Currency','العملة الافتراضية')||label===t('Bank Currency','عملة البنك'))return 'currency';
  if(label===t('Origin','المنشأ')||label===t('Country of Origin','بلد المنشأ')||label===t('Country','الدولة'))return 'origin';
  if(label===t('Packing','التعبئة'))return 'packing';
  if(label==='Incoterm'||label===t('Default Incoterm','شرط التجارة الافتراضي'))return 'incoterm';
  if(label===t('Payment Terms','شروط الدفع')||label===t('Default Payment Terms','شروط الدفع الافتراضية'))return 'payment';
  if(label===t('Delivery Time','مدة التسليم')||label===t('Default Delivery Time','مدة التسليم الافتراضية'))return 'delivery';
  return null;
}

function findInputChild(children:any):any{
  const items=Array.isArray(children)?children:[children];
  return items.find(child=>child&&typeof child==='object'&&child.type===Input)||null;
}

function dispatchInputValue(input:any,value:string):void{
  const handler=input?.props?.onChange;
  if(typeof handler==='function')handler({target:{value},currentTarget:{value}});
}

function smartChoices(kind:Exclude<SmartProductFieldKind,'packing'>,arabic:boolean):PresetChoice[]{
  if(kind==='unit')return unitChoices(arabic);
  if(kind==='currency')return currencyChoices(arabic);
  if(kind==='origin')return countryChoices(arabic);
  if(kind==='incoterm')return incotermChoices(arabic);
  if(kind==='payment')return paymentTermChoices(arabic);
  return deliveryTimeChoices(arabic);
}

export function Field({ label, error, hint, children, className = '' }: { label: any; error?: string; hint?: string; children: any; className?: string }): any {
  const kind=smartFieldKind(label);
  const input=kind?findInputChild(children):null;
  if(kind&&input&&typeof input.props?.value==='string'&&typeof input.props?.onChange==='function'){
    const value=String(input.props.value||'');
    const onChange=(next:string)=>dispatchInputValue(input,next);
    const arabic=isArabic();
    const control=kind==='packing'
      ? <PackingControl value={value} label={String(label)} onChange={onChange}/>
      : <PresetControl
          value={value}
          label={String(label)}
          choices={smartChoices(kind,arabic)}
          uppercase={kind==='currency'||kind==='incoterm'}
          onChange={onChange}
        />;
    return <div className={`field smart-product-field smart-product-field-${kind} ${className}`}><span className="field-label">{label}</span>{control}{error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</div>;
  }
  return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}{error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: any }): any {
  return <label className="toggle-row"><button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span/></button><span>{label}</span></label>;
}

let openModalFrames=0;
let bodyOverflowBeforeModals='';
let modalFrameSequence=0;

interface ModalFrameProps { title:string; children:any; onClose:()=>void; size:'sm'|'md'|'lg'|'xl'; footer?:any; }
class ModalFrame extends React.Component<ModalFrameProps> {
  private backdrop:HTMLDivElement|null=null;
  private dialog:HTMLElement|null=null;
  private previousFocus:HTMLElement|null=null;
  private titleId=`lourex-modal-title-${++modalFrameSequence}`;
  componentDidMount():void{
    this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(openModalFrames===0){bodyOverflowBeforeModals=document.body.style.overflow;document.body.style.overflow='hidden';}
    openModalFrames+=1;
    document.addEventListener('keydown',this.handleKeyDown);
    window.requestAnimationFrame(()=>{
      if(!this.dialog||!this.isTopModal())return;
      const active=document.activeElement;
      if(active instanceof Node&&this.dialog.contains(active))return;
      try{this.dialog.focus({preventScroll:true});}catch{}
    });
  }
  componentWillUnmount():void{
    document.removeEventListener('keydown',this.handleKeyDown);
    openModalFrames=Math.max(0,openModalFrames-1);
    if(openModalFrames===0)document.body.style.overflow=bodyOverflowBeforeModals;
    try{this.previousFocus?.focus({preventScroll:true});}catch{}
  }
  private isTopModal=():boolean=>{
    if(!this.backdrop)return false;
    const backdrops=document.querySelectorAll('.modal-backdrop');
    return !backdrops.length||backdrops[backdrops.length-1]===this.backdrop;
  };
  private focusable=():HTMLElement[]=>{
    if(!this.dialog)return [];
    const selector='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return Array.from(this.dialog.querySelectorAll<HTMLElement>(selector)).filter(node=>!node.hasAttribute('hidden')&&node.getAttribute('aria-hidden')!=='true'&&node.getClientRects().length>0);
  };
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(!this.backdrop||!this.dialog||!this.isTopModal())return;
    if(event.key==='Escape'){
      event.preventDefault();
      this.props.onClose();
      return;
    }
    if(event.key!=='Tab')return;
    const nodes=this.focusable();
    if(!nodes.length){event.preventDefault();this.dialog.focus();return;}
    const first=nodes[0];
    const last=nodes[nodes.length-1];
    const active=document.activeElement;
    if(active===this.dialog){event.preventDefault();(event.shiftKey?last:first)?.focus();return;}
    if(event.shiftKey&&active===first){event.preventDefault();last?.focus();return;}
    if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();return;}
    if(!(active instanceof Node)||!this.dialog.contains(active)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
  };
  render():any{
    const {title,children,onClose,size,footer}=this.props;
    return <div ref={(node:any)=>{this.backdrop=node;}} className="modal-backdrop" role="presentation" onPointerDown={(e:any) => { if (e.target === e.currentTarget) onClose(); }}><section ref={(node:any)=>{this.dialog=node;}} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={this.titleId} tabIndex={-1}><header className="modal-header"><h2 id={this.titleId}>{title}</h2><IconButton icon="x" label={t('Close','إغلاق')} onClick={onClose}/></header><div className="modal-body">{children}</div>{footer ? <footer className="modal-footer">{footer}</footer> : null}</section></div>;
  }
}

export function Modal({ open, title, children, onClose, size = 'md', footer }: { open: boolean; title: string; children: any; onClose: () => void; size?: 'sm'|'md'|'lg'|'xl'; footer?: any }): any {
  if (!open) return null;
  return <ModalFrame title={title} size={size} onClose={onClose} footer={footer}>{children}</ModalFrame>;
}

export function ConfirmDialog({ open, title, message, confirmLabel, destructive = true, onCancel, onConfirm }: { open: boolean; title: string; message: string; confirmLabel?: string; destructive?: boolean; onCancel: () => void; onConfirm: () => void }): any {
  const label = confirmLabel ?? t('Delete','حذف');
  return <Modal open={open} title={title} size="sm" onClose={onCancel} footer={<div className="modal-footer-actions"><Button onClick={onCancel}>{t('Cancel','إلغاء')}</Button><Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{label}</Button></div>}><p className="modal-message">{message}</p></Modal>;
}

export function Segmented({ value, options, onChange }: { value: string; options: Array<{value:string;label:string}>; onChange: (value: string) => void }): any {
  return <div className="segmented">{options.map(o => <button type="button" key={o.value} aria-pressed={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export function Brand({ compact = false, logoDataUrl = './brand/lourex-logo.svg', name = '', language: _language }: { compact?: boolean; logoDataUrl?: string; name?: string; language?: UiLanguage }): any {
  if (compact) {
    const hasCompanyLogo = Boolean(logoDataUrl && !logoDataUrl.includes('lourex-logo.svg'));
    return <div className="brand company-brand compact">{hasCompanyLogo ? <span className="brand-mark"><img src={logoDataUrl} alt={name || 'Company logo'}/></span> : <span className="brand-words"><strong>{name && name.toUpperCase() !== 'LOUREX' ? name : t('Company','الشركة')}</strong></span>}</div>;
  }
  return <div className="brand official-brand"><span className="brand-mark"><img src="./brand/lourex-logo.svg" alt="LOUREX"/></span><span className="brand-words"><strong>LOUREX</strong></span></div>;
}

export function Toast({ text, tone = 'default' }: { text: string; tone?: 'default'|'success'|'error' }): any {
  if (!text) return null;
  const error=tone==='error';
  return <div className={`toast toast-${tone}`} role={error?'alert':'status'} aria-live={error?'assertive':'polite'} style={{pointerEvents:'none'}}>{tone === 'success' ? <Icon name="check"/> : null}<span>{text}</span></div>;
}
