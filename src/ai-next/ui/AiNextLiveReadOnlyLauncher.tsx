/**
 * AI Next live evaluation launcher: independent dialog sibling beside the
 * legacy AiCopilot panel. Never nests inside or changes the legacy post-build
 * conversation workspace, approval controls or document editor.
 */
import {AiNextLiveReadOnlyChat} from './AiNextLiveReadOnlyChat.js';

const STYLES=String.raw`
.lourex-next-live-launcher{
  position:fixed;z-index:1180;right:85px;bottom:22px;
  border:1px solid #6c9c93;background:#13584f;color:#fff;
  border-radius:14px;min-height:52px;padding:0 13px;font:700 13px system-ui,sans-serif;
  box-shadow:0 8px 30px #0004;cursor:pointer;
}
.lourex-next-live-backdrop{
  position:fixed;z-index:1200;inset:0;background:rgba(0,0,0,.6);
}
.lourex-next-live-panel{
  position:fixed;z-index:1201;inset-block:12px;inset-inline-start:12px;
  width:min(480px,calc(100vw - 24px));max-height:calc(100dvh - 24px);
  display:flex;flex-direction:column;border-radius:16px;
  overflow:hidden;background:#f8faf8;color:#17352f;
  box-shadow:0 20px 65px #0007;border:1px solid #b7cbc5;
}
.lourex-next-live-top{
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  background:#123e38;color:#fff;padding:12px 14px;
}
.lourex-next-live-top strong{font:700 15px system-ui,sans-serif}
.lourex-next-live-top button{
  border:1px solid #a1c0b9;color:#fff;background:#215b53;
  border-radius:8px;padding:7px 11px;font:700 13px system-ui,sans-serif;cursor:pointer;
}
.lourex-next-live-launcher:focus-visible,.lourex-next-live-top button:focus-visible{
  outline:3px solid #aee8dc;outline-offset:3px
}
@media(max-width:720px){
  .lourex-next-live-launcher{right:auto;left:74px;bottom:calc(84px + env(safe-area-inset-bottom));min-height:50px}
  .lourex-next-live-panel{inset-inline:8px;width:auto;
    inset-block-start:calc(8px + env(safe-area-inset-top));
    inset-block-end:calc(8px + env(safe-area-inset-bottom));
    max-height:none;border-radius:16px}
}
`;

export function AiNextLiveReadOnlyLauncher():any{
  const [open,setOpen]=React.useState(false);
  React.useEffect(()=>{
    if(!open)return;
    const onEscape=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();setOpen(false);}
    };
    document.addEventListener('keydown',onEscape);
    return()=>document.removeEventListener('keydown',onEscape);
  },[open]);
  const openSafe=()=>{
    // Never stack a second chat over the legacy Controller's approval dialog.
    if(document.getElementById('lourex-ai-panel'))return;
    setOpen(true);
  };
  return <>
    <style data-ai-next-live-launcher="isolated">{STYLES}</style>
    <button type="button" className="lourex-next-live-launcher"
      aria-label="فتح AI Next Live للقراءة فقط"
      title="AI Next · نموذج حقيقي · قراءة فقط"
      aria-expanded={open} aria-controls="lourex-next-live-panel"
      onClick={open?()=>setOpen(false):openSafe}>AI Next · Live</button>
    {open?<><button type="button" className="lourex-next-live-backdrop"
      aria-label="إغلاق AI Next Live" onClick={()=>setOpen(false)}/>
      <section id="lourex-next-live-panel" className="lourex-next-live-panel"
        role="dialog" aria-modal="true" aria-label="AI Next Live — تقييم حقيقي للقراءة فقط"
        dir="rtl">
        <header className="lourex-next-live-top">
          <strong>LOUREX AI Next · Live</strong>
          <button type="button" onClick={()=>setOpen(false)}>إغلاق</button>
        </header>
        <AiNextLiveReadOnlyChat/>
      </section>
    </>:null}
  </>;
}
