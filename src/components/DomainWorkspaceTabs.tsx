import { t } from '../lib/i18n.js';

interface TabOption<T extends string>{id:T;label:string;description?:string;}
interface Props<T extends string>{value:T;options:Array<TabOption<T>>;onChange:(value:T)=>void;ariaLabel?:string;}

/** Shared v320 TailAdmin workspace tabs. Styling lives in the v320 system. */
export function DomainWorkspaceTabs<T extends string>({value,options,onChange,ariaLabel}:Props<T>):any{
  return <div className="ta-domain-tabs" role="tablist" aria-label={ariaLabel||t('Workspace sections','أقسام مساحة العمل')}>
    {options.map(option=><button type="button" key={option.id} role="tab" aria-selected={value===option.id} className={value===option.id?'is-active':''} onClick={()=>onChange(option.id)}><span><strong>{option.label}</strong>{option.description?<small>{option.description}</small>:null}</span><b aria-hidden="true"/></button>)}
  </div>;
}
