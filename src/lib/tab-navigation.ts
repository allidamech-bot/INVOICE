/** Activate through the existing click handler so dirty/busy guards remain authoritative. */
export function handleTabKeyDown(event:KeyboardEvent|any,vertical=false):void{
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
  const list=event.currentTarget as HTMLElement;
  const tabs=Array.from(list.querySelectorAll<HTMLButtonElement>('button[role="tab"]:not([disabled])'))
    .filter(tab=>tab.getClientRects().length>0&&!tab.closest('[hidden],[inert]'));
  if(!tabs.length)return;
  const rtl=window.getComputedStyle(list).direction==='rtl';
  const forward=vertical?'ArrowDown':rtl?'ArrowLeft':'ArrowRight';
  const backward=vertical?'ArrowUp':rtl?'ArrowRight':'ArrowLeft';
  if(![forward,backward,'Home','End'].includes(event.key))return;
  const index=tabs.indexOf(document.activeElement as HTMLButtonElement);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key===forward?(index+1)%tabs.length:index<0?tabs.length-1:(index-1+tabs.length)%tabs.length;
  event.preventDefault();const target=tabs[next]!;
  target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});target.click();
}
