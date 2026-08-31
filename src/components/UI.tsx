import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';

export type IconName = 'plus'|'settings'|'search'|'file'|'users'|'items'|'save'|'download'|'share'|'copy'|'trash'|'edit'|'lock'|'x'|'chevronDown'|'chevronUp'|'arrowLeft'|'printer'|'check'|'more'|'eye'|'upload'|'backup'|'restore'|'refresh'|'invoice'|'proforma'|'menu';

const paths: Record<IconName, any> = {
  plus: <g><path d="M12 5v14M5 12h14"/></g>, settings: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.8 1 1 .3.2.7.3 1.1.3h.1v4h-.1a1.7 1.7 0 0 0-2.1.7Z"/></g>,
  search:<g><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></g>, file:<g><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></g>, users:<g><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></g>, items:<g><path d="m4 7 8-4 8 4-8 4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4Z"/><path d="M12 11v10"/></g>,
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

export function Field({ label, error, hint, children, className = '' }: { label: any; error?: string; hint?: string; children: any; className?: string }): any {
  return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}{error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>;
}

export function Input({ className = '', ...props }: any): any { return <input className={`input ${className}`} {...props}/>; }
export function Select({ className = '', ...props }: any): any { return <select className={`input select ${className}`} {...props}/>; }
export function Textarea({ className = '', ...props }: any): any { return <textarea className={`input textarea ${className}`} {...props}/>; }

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: any }): any {
  return <label className="toggle-row"><button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span/></button><span>{label}</span></label>;
}

let openModalFrames=0;
let bodyOverflowBeforeModals='';

interface ModalFrameProps { title:string; children:any; onClose:()=>void; size:'sm'|'md'|'lg'|'xl'; footer?:any; }
class ModalFrame extends React.Component<ModalFrameProps> {
  private backdrop:HTMLDivElement|null=null;
  private previousFocus:HTMLElement|null=null;
  componentDidMount():void{
    this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(openModalFrames===0){bodyOverflowBeforeModals=document.body.style.overflow;document.body.style.overflow='hidden';}
    openModalFrames+=1;
    document.addEventListener('keydown',this.handleKeyDown);
  }
  componentWillUnmount():void{
    document.removeEventListener('keydown',this.handleKeyDown);
    openModalFrames=Math.max(0,openModalFrames-1);
    if(openModalFrames===0)document.body.style.overflow=bodyOverflowBeforeModals;
    try{this.previousFocus?.focus({preventScroll:true});}catch{}
  }
  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.key!=='Escape'||!this.backdrop)return;
    const backdrops=document.querySelectorAll('.modal-backdrop');
    if(backdrops.length&&backdrops[backdrops.length-1]!==this.backdrop)return;
    event.preventDefault();
    this.props.onClose();
  };
  render():any{
    const {title,children,onClose,size,footer}=this.props;
    return <div ref={(node:any)=>{this.backdrop=node;}} className="modal-backdrop" role="presentation" onPointerDown={(e:any) => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><h2>{title}</h2><IconButton icon="x" label={t('Close','إغلاق')} onClick={onClose}/></header><div className="modal-body">{children}</div>{footer ? <footer className="modal-footer">{footer}</footer> : null}</section></div>;
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
