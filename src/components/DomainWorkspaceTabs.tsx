import { t } from '../lib/i18n.js';

interface TabOption<T extends string>{id:T;label:string;description?:string;}
interface Props<T extends string>{value:T;options:Array<TabOption<T>>;onChange:(value:T)=>void;ariaLabel?:string;}

const DOMAIN_TABS_CSS=`
.domain-workspace-tabs{display:flex;align-items:stretch;gap:4px;width:fit-content;max-width:100%;margin:0 0 16px;padding:4px;border:1px solid #272727;border-radius:11px;background:#101010;overflow-x:auto;scrollbar-width:none}.domain-workspace-tabs::-webkit-scrollbar{display:none}.domain-workspace-tab{min-width:142px;min-height:48px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;padding:7px 11px;border:0;border-radius:8px;background:transparent;color:#8f8d88;font:inherit;text-align:start;cursor:pointer;white-space:nowrap}.domain-workspace-tab strong{font-size:10.5px;font-weight:700;color:inherit}.domain-workspace-tab small{font-size:8.5px;font-weight:500;color:#686762}.domain-workspace-tab:hover{background:#171717;color:#d3d0ca}.domain-workspace-tab.active{background:#211d17;color:#d2bd91;box-shadow:inset 0 0 0 1px #4b402d}.domain-workspace-tab.active small{color:#9f9276}@media(max-width:720px){.domain-workspace-tabs{width:100%;margin-bottom:12px}.domain-workspace-tab{flex:1;min-width:132px;min-height:48px;padding-inline:9px}}`;

export function DomainWorkspaceTabs<T extends string>({value,options,onChange,ariaLabel}:Props<T>):any{
  return <><style data-domain-workspace-tabs="v278">{DOMAIN_TABS_CSS}</style><div className="domain-workspace-tabs" role="tablist" aria-label={ariaLabel||t('Workspace sections','أقسام مساحة العمل')}>{options.map(option=><button type="button" key={option.id} role="tab" aria-selected={value===option.id} className={`domain-workspace-tab ${value===option.id?'active':''}`} onClick={()=>onChange(option.id)}><strong>{option.label}</strong>{option.description?<small>{option.description}</small>:null}</button>)}</div></>;
}
