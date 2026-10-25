// Read layout once per frame, outside the native keystroke handler.
// Never replace textarea content, move its caret or transfer focus.
const pending=new WeakMap<HTMLTextAreaElement,number>();
export function scheduleComposerResize(element:HTMLTextAreaElement):void{
  if(pending.has(element))return;
  pending.set(element,window.requestAnimationFrame(()=>{
    pending.delete(element);
    if(!element.isConnected)return;
    element.style.height='auto';
    element.style.height=Math.min(element.scrollHeight,132)+'px';
  }));
}
