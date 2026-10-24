/** Presentation-only presence: retain a closing menu briefly, with all interaction
 * disabled. Reopening cancels removal; original actions remain owned by callers. */
export function AiMenuPresence({content,reduced=false,onDismiss}:{content:any;reduced?:boolean;onDismiss?:()=>void}):any {
  const [retained,setRetained]=React.useState<any>(content);
  const quiet=reduced||(typeof window!=='undefined'&&Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  React.useEffect(()=>{
    if(content){setRetained(content);return;}
    if(quiet){setRetained(null);return;}
    if(!retained)return;
    const timer=window.setTimeout(()=>setRetained(null),180);
    return()=>window.clearTimeout(timer);
  },[content,quiet]);
  const shown=content||(quiet?null:retained);
  if(!shown)return null;
  const closing=!content;
  return (React as any).cloneElement(shown,{
    'data-lxw-presence':closing?'closing':'open',
    'aria-hidden':closing?true:shown.props['aria-hidden'],
    inert:closing?'':undefined,
    onKeyDown:(event:any)=>{
      shown.props.onKeyDown?.(event);
      if(closing||event.defaultPrevented)return;
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        event.currentTarget.parentElement?.querySelector('.lourex-ai-overflow-trigger')?.focus();
        onDismiss?.();return;
      }
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      const items=Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')) as HTMLElement[];
      if(!items.length)return;
      event.preventDefault();
      const current=items.indexOf(document.activeElement as HTMLElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(current+1)%items.length:(current-1+items.length)%items.length;
      items[next]?.focus();
    }
  });
}
