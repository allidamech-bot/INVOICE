import { handleTabKeyDown } from '../lib/tab-navigation.js';
import { t } from '../lib/i18n.js';

interface TabOption<T extends string>{id:T;label:string;description?:string;}
interface Props<T extends string>{value:T;options:Array<TabOption<T>>;onChange:(value:T)=>void;ariaLabel?:string;idPrefix?:string;}

/** Shared v320 TailAdmin workspace tabs. Styling lives in the v320 system. */
export function DomainWorkspaceTabs<T extends string>({value,options,onChange,ariaLabel,idPrefix='workspace'}:Props<T>):any{
  const [list]=React.useState<{current:HTMLDivElement|null}>(()=>({current:null}));
  React.useEffect(()=>{list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[value]);
  return <div ref={list} onKeyDown={handleTabKeyDown} className="ta-domain-tabs" role="tablist" aria-label={ariaLabel||t('Workspace sections','أقسام مساحة العمل')}>
    {options.map(option=><button type="button" key={option.id} role="tab" id={`${idPrefix}-tab-${option.id}`} aria-controls={`${idPrefix}-panel`} tabIndex={value===option.id?0:-1} aria-selected={value===option.id} className={value===option.id?'is-active':''} onClick={()=>onChange(option.id)}><span><strong>{option.label}</strong>{option.description?<small>{option.description}</small>:null}</span><b aria-hidden="true"/></button>)}
  </div>;
}
