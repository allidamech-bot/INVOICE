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

/** Keep the authored order intact; a dropped suffix may contain a correction,
 * a negation or the final financial line. No model may see a clipped order. */
export function composerSubmissionError(value:string,ar:boolean):string{
  return value.length<=6000?'':ar
    ?'الرسالة تتجاوز 6000 حرف. النص كامل محفوظ في حقل الكتابة ولم يُرسل؛ أرفق التفاصيل كملف أو اختصر الرسالة قبل الإرسال.'
    :'This message exceeds 6000 characters. Your complete text remains in the composer and was not sent. Attach the details as a file or shorten the message before sending.';
}
