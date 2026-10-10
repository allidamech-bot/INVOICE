/** Shared interaction ownership for the existing modal surfaces. */
const scrollOwners=new Set<object>();
let priorOverflow='';
export function lockOverlayScroll(owner:object):void{
  if(scrollOwners.has(owner))return;
  if(!scrollOwners.size){priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  scrollOwners.add(owner);
}
export function unlockOverlayScroll(owner:object):void{
  if(!scrollOwners.delete(owner))return;
  if(!scrollOwners.size)document.body.style.overflow=priorOverflow;
}
export function topOverlay():HTMLElement|null{
  const nodes=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"],.ta-create-menu[role="menu"]'))
    .filter(node=>node.getClientRects().length>0&&!node.closest('[hidden],[inert],[aria-hidden="true"]'));
  // Compare ancestor z-index chains: a high local layer inside the AI panel
  // cannot outrank a separate Search/Settings overlay above that panel.
  const layers=(node:HTMLElement)=>{
    const values:number[]=[];
    for(let parent:HTMLElement|null=node;parent;parent=parent.parentElement){
      const z=Number.parseInt(window.getComputedStyle(parent).zIndex,10);
      if(Number.isFinite(z))values.unshift(z);
    }
    return values;
  };
  const above=(node:HTMLElement,top:HTMLElement)=>{
    const left=layers(node),right=layers(top);
    for(let i=0;i<Math.max(left.length,right.length);i++){
      const difference=(left[i]??0)-(right[i]??0);if(difference)return difference>0;
    }
    return true;
  };
  return nodes.reduce<HTMLElement|null>((top,node)=>!top||above(node,top)?node:top,null);
}
export function ownsOverlay(node:HTMLElement|null):boolean{return Boolean(node&&topOverlay()===node);}
export function overlayFocusables(node:HTMLElement):HTMLElement[]{
  return Array.from(node.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
    .filter(item=>!item.closest('[hidden],[inert],[aria-hidden="true"]')&&item.getClientRects().length>0&&item.tabIndex>=0);
}
export function trapOverlayTab(event:KeyboardEvent,node:HTMLElement):void{
  if(event.key!=='Tab'||event.defaultPrevented||!ownsOverlay(node))return;
  const nodes=overlayFocusables(node),active=document.activeElement;
  const target=event.shiftKey?nodes[nodes.length-1]:nodes[0];
  if(!nodes.length||!node.contains(active)||active===node||event.shiftKey&&active===nodes[0]||!event.shiftKey&&active===nodes[nodes.length-1]){
    event.preventDefault();(target||node).focus({preventScroll:true});
  }
}
export function containOverlayFocus(node:HTMLElement|null):void{
  if(!node||!ownsOverlay(node)||node.contains(document.activeElement))return;
  (overlayFocusables(node)[0]||node).focus({preventScroll:true});
}
export function restoreOverlayFocus(previous:HTMLElement|null):void{
  const top=topOverlay();
  if(top){
    if(previous?.isConnected&&top.contains(previous))previous.focus({preventScroll:true});else containOverlayFocus(top);
  }else if(previous?.isConnected)previous.focus({preventScroll:true});
}
