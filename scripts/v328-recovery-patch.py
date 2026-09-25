from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    if text.count(old)!=1:
        raise SystemExit(f'ambiguous patch target {label}: {text.count(old)} matches')
    return text.replace(old,new,1)

# 1) Account transitions: never hard-reload a live workspace on a Firebase identity change.
p='src/app/index.tsx'; s=read(p)
old='''      if(selectedStorageUid&&selectedStorageUid!==user.uid){
        if(signOutTransitionRunning)return;
        signOutTransitionRunning=true;
        accountWasAuthenticated=false;
        void (async()=>{
          try{
            await activateAccountStorage(selectedStorageUid);
            await suspendSession();
          }finally{
            setActiveAccountUid(null);
            await activateAccountStorage(null);
            window.location.reload();
          }
        })();
        return;
      }'''
new='''      if(selectedStorageUid&&selectedStorageUid!==user.uid){
        if(signOutTransitionRunning)return;
        signOutTransitionRunning=true;
        accountWasAuthenticated=true;
        const targetUid=user.uid;
        const complete=((event:Event)=>{
          const detail=(event as CustomEvent<{uid?:string}>).detail;
          if(detail?.uid!==targetUid)return;
          signOutTransitionRunning=false;
          window.removeEventListener('lourex-account-transition-complete',complete as EventListener);
        }) as EventListener;
        window.addEventListener('lourex-account-transition-complete',complete);
        window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid:targetUid}}));
        return;
      }'''
s=replace_once(s,old,new,'index account mismatch reload');write(p,s)

p='src/app/App.tsx'; s=read(p)
s=replace_once(s,"import { getCloudAccount, getEncryptedVault, getPublicPreferences, getSecurity, hasSecurity, putCloudAccount, putPublicPreferences } from '../storage/db.js';","import { activateAccountStorage, getCloudAccount, getEncryptedVault, getPublicPreferences, getSecurity, hasSecurity, putCloudAccount, putPublicPreferences } from '../storage/db.js';",'App db import')
s=replace_once(s,"import { clearSession, establishSession, touchSession } from '../storage/session.js';","import { clearSession, establishSession, setActiveAccountUid, suspendSession, touchSession } from '../storage/session.js';",'App session import')
s=replace_once(s,'  private documentCreateBusy=false;','  private documentCreateBusy=false;\n  private accountTransitionRunning=false;','App account transition field')
s=replace_once(s,"    window.addEventListener('lourex-cloud-conflict',this.handleCloudConflict);","    window.addEventListener('lourex-cloud-conflict',this.handleCloudConflict);\n    window.addEventListener('lourex-account-transition-request',this.handleAccountTransitionRequest as EventListener);",'App mount transition listener')
s=replace_once(s,"    window.removeEventListener('lourex-cloud-conflict',this.handleCloudConflict);","    window.removeEventListener('lourex-cloud-conflict',this.handleCloudConflict);\n    window.removeEventListener('lourex-account-transition-request',this.handleAccountTransitionRequest as EventListener);",'App unmount transition listener')
anchor="  private handleOnline=()=>{this.scheduleCloudSync(80);};"
handler='''  private handleAccountTransitionRequest=(event:Event)=>{
    const uid=String((event as CustomEvent<{uid?:string}>).detail?.uid??'').trim();
    if(!uid||this.accountTransitionRunning)return;
    this.accountTransitionRunning=true;
    void (async()=>{
      try{
        if(this.cloudTimer){window.clearTimeout(this.cloudTimer);this.cloudTimer=undefined;}
        this.cloudSyncQueued=false;
        await this.drainVaultWrites();
        await this.waitForCloudIdle();
        await suspendSession();
        setActiveAccountUid(uid);
        await activateAccountStorage(uid);
        await suspendSession();
        this.latestEncryptedVault=null;
        this.vaultWriteTail=Promise.resolve(null);
        await new Promise<void>(resolve=>this.setState({loading:true,unlocked:false,key:null,vault:null,screen:'home',editorDoc:null,settingsOpen:false,newMenu:false,cloudModal:false,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:'',catalogLauncher:'',catalogSourceId:''},resolve));
        await this.initialize();
      }catch(error){
        this.setState({loading:false,unlocked:false,key:null,vault:null,screen:'home',editorDoc:null,newMenu:false,cloudSyncState:'error',cloudSyncMessage:friendlyCloudError(error)});
      }finally{
        this.accountTransitionRunning=false;
        window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid}}));
      }
    })();
  };
'''
s=replace_once(s,anchor,handler+anchor,'App account transition handler');write(p,s)

# 2) Create Center: eliminate close->RAF races; parent actions own the atomic close/state transition.
p='src/components/AppShell.tsx'; s=read(p)
old='''  private createDocument=(kind:DocumentKind)=>{
    this.closeMore();
    this.closeCreateMenu();
    window.requestAnimationFrame(()=>this.props.onNew(kind));
  };

  private openCreditNote=()=>{
    this.closeMore();
    this.closeCreateMenu();
    window.requestAnimationFrame(()=>this.props.onCreditNote());
  };

  private openStatementAccount=()=>{
    this.closeMore();
    this.closeCreateMenu();
    window.requestAnimationFrame(()=>this.props.onStatementAccount());
  };'''
new='''  private createDocument=(kind:DocumentKind)=>{
    this.closeMore();
    this.props.onNew(kind);
  };

  private openCreditNote=()=>{
    this.closeMore();
    this.props.onCreditNote();
  };

  private openStatementAccount=()=>{
    this.closeMore();
    this.props.onStatementAccount();
  };'''
s=replace_once(s,old,new,'AppShell direct create actions');write(p,s)

# 3) Document Studio: the step rail belongs to the one editor scroller, not between editor and action dock.
p='src/components/EditorPageCore.tsx'; s=read(p)
s=replace_once(s,'<div className="editor-layout"><aside className="editor-pane"><div className="editor-scroll"><fieldset className="editor-form-lock" disabled={locked||this.state.issuing}>','<div className="editor-layout"><aside className="editor-pane"><div className="editor-scroll"><div className="editor-section-nav-slot" data-editor-nav-slot/><fieldset className="editor-form-lock" disabled={locked||this.state.issuing}>','Editor internal nav slot')
s=replace_once(s,'</section></div>\n      <div className="editor-section-nav-slot" data-editor-nav-slot/>\n      <div className={`mobile-editor-actionbar','</section></div>\n      <div className={`mobile-editor-actionbar','remove external nav slot')
write(p,s)

# 4) AI identity: same robot language in the header launcher and dashboard advisor.
p='src/components/LourexAdvisorCard.tsx'; s=read(p); s=s.replace('<Icon name="spark"/>','<Icon name="bot"/>'); write(p,s)

# 5) Replace the v327 hard 100dvh child chain with one viewport owner + one scroller.
p='src/styles/tailadmin-utilities-v320.css'; s=read(p)
marker='/* v327 — hard mobile editor viewport chain.'
pos=s.find(marker)
if pos<0: raise SystemExit('missing v327 editor viewport block')
# The v327 viewport block is the final owner in this file; replace it rather than layering another override.
s=s[:pos]+'''/* v328 — balanced mobile editor viewport chain.
   The shell owns the viewport once. Document Studio consumes the available row,
   the action dock stays in flow, and editor-scroll is the sole vertical scroller. */
@media screen and (max-width:900px){
  .app-ui .ta-shell.is-editor .editor-screen{
    width:100%!important;height:100%!important;max-height:100%!important;min-height:0!important;
    display:flex!important;flex-direction:column!important;overflow:hidden!important;
  }
  .app-ui .ta-shell.is-editor .editor-screen>.editor-layout{
    flex:1 1 auto!important;width:100%!important;height:auto!important;max-height:none!important;min-height:0!important;
    display:block!important;overflow:hidden!important;
  }
  .app-ui .ta-shell.is-editor .editor-layout>.editor-pane{
    width:100%!important;height:100%!important;max-height:100%!important;min-height:0!important;overflow:hidden!important;
  }
  .app-ui .ta-shell.is-editor .editor-pane>.editor-scroll{
    width:100%!important;height:100%!important;max-height:100%!important;min-height:0!important;
    overflow-x:hidden!important;overflow-y:auto!important;touch-action:pan-y!important;
    overscroll-behavior-x:none!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important;
    padding-top:0!important;
  }
  .app-ui .ta-shell.is-editor .editor-section-nav-slot{
    position:sticky!important;top:0!important;z-index:64!important;display:block!important;
    margin:0 -2px 10px!important;padding:8px 2px 4px!important;
    background:linear-gradient(180deg,var(--ft-canvas) 78%,color-mix(in srgb,var(--ft-canvas) 0%,transparent))!important;
    backdrop-filter:blur(12px)!important;-webkit-backdrop-filter:blur(12px)!important;
  }
  .app-ui .ta-shell.is-editor .ta-editor-step-nav{
    position:relative!important;inset:auto!important;margin:0!important;border-radius:14px!important;
    background:color-mix(in srgb,var(--ft-surface) 96%,transparent)!important;
    box-shadow:0 7px 22px rgba(15,23,42,.08)!important;
  }
  html[data-ui-theme="dark"] .app-ui .ta-shell.is-editor .ta-editor-step-nav{box-shadow:0 8px 22px rgba(0,0,0,.24)!important;}
}
'''
write(p,s)

# 6) Unify AI launcher + compact dashboard advisor. Replace v327 AI tail instead of stacking conflicting geometry.
p='src/styles/tailadmin-ai-finish-v320.css'; s=read(p)
marker='/* v327 — robotic AI identity and compact mobile copilot. */'
pos=s.find(marker)
if pos<0: raise SystemExit('missing v327 AI block')
s=s[:pos]+'''/* v328 — unified AI identity: compact robot control + dashboard intelligence workspace. */
@media screen{
  .app-ui .lourex-ai-launcher{
    isolation:isolate!important;overflow:hidden!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;
    border-radius:13px!important;border:1px solid color-mix(in srgb,#6d5df5 42%,var(--ft-line))!important;
    background:linear-gradient(145deg,#6d5df5 0%,#4f79ee 52%,#20b8c7 100%)!important;color:#fff!important;
    box-shadow:0 8px 20px rgba(79,121,238,.22)!important;transform:none!important;
  }
  .app-ui .lourex-ai-launcher>.icon{position:relative;z-index:2;width:21px!important;height:21px!important;stroke-width:1.9!important;}
  .app-ui .lourex-ai-launcher:before{content:"";position:absolute;inset:3px;border:1px solid rgba(255,255,255,.22);border-radius:10px;opacity:.8;pointer-events:none;}
  .app-ui .lourex-ai-launcher:after{content:"";position:absolute;width:5px;height:5px;inset-inline-end:5px;top:5px;border-radius:999px;background:#65eadc;box-shadow:0 0 9px rgba(101,234,220,.8);pointer-events:none;}
  .app-ui .lourex-ai-launcher:hover,.app-ui .lourex-ai-launcher[aria-expanded="true"]{transform:none!important;filter:brightness(1.04)!important;box-shadow:0 9px 24px rgba(79,121,238,.28)!important;}
  .app-ui .lourex-ai-mark{background:linear-gradient(145deg,color-mix(in srgb,#6d5df5 16%,var(--ft-surface)),color-mix(in srgb,#20b8c7 12%,var(--ft-surface)))!important;color:#6378ef!important;}
  .app-ui .lourex-ai-mark>.icon{width:22px!important;height:22px!important;}

  .app-ui .lourex-advisor-card{
    position:relative!important;overflow:hidden!important;border:1px solid color-mix(in srgb,#6676ee 18%,var(--ft-line))!important;
    border-radius:22px!important;background:linear-gradient(150deg,color-mix(in srgb,#6d5df5 6%,var(--ft-surface)) 0%,var(--ft-surface) 46%,color-mix(in srgb,#20b8c7 5%,var(--ft-surface)) 100%)!important;
    box-shadow:0 14px 36px rgba(15,23,42,.08)!important;
  }
  html[data-ui-theme="dark"] .app-ui .lourex-advisor-card{box-shadow:0 18px 40px rgba(0,0,0,.25)!important;}
  .app-ui .lourex-advisor-head{padding:16px 17px 10px!important;border-bottom:0!important;}
  .app-ui .lourex-advisor-identity{gap:11px!important;align-items:center!important;}
  .app-ui .lourex-advisor-mark{width:42px!important;height:42px!important;min-width:42px!important;border-radius:13px!important;border:1px solid rgba(105,111,239,.25)!important;background:linear-gradient(145deg,#6d5df5,#4f79ee 55%,#20b8c7)!important;color:#fff!important;box-shadow:0 8px 20px rgba(79,121,238,.20)!important;}
  .app-ui .lourex-advisor-mark .icon{width:21px!important;height:21px!important;}
  .app-ui .lourex-advisor-identity small{color:#6577e8!important;font-size:10px!important;line-height:14px!important;font-weight:780!important;letter-spacing:.05em!important;}
  [dir="rtl"] .app-ui .lourex-advisor-identity small{letter-spacing:0!important;}
  .app-ui .lourex-advisor-identity h2{margin:2px 0 0!important;color:var(--ft-text-strong)!important;font-size:18px!important;line-height:24px!important;font-weight:800!important;}
  .app-ui .lourex-advisor-identity p{max-width:620px!important;margin:4px 0 0!important;color:var(--ft-muted)!important;font-size:11.5px!important;line-height:17px!important;}
  .app-ui .lourex-advisor-body{padding:4px 17px 12px!important;}
  .app-ui .lourex-advisor-welcome{display:block!important;}
  .app-ui .lourex-advisor-welcome-copy{display:none!important;}
  .app-ui .lourex-advisor-starters{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;margin:0!important;}
  .app-ui .lourex-advisor-starters>button{min-height:48px!important;padding:9px 11px!important;border:1px solid var(--ft-line)!important;border-radius:13px!important;background:color-mix(in srgb,var(--ft-surface-2) 92%,transparent)!important;color:var(--ft-text-soft)!important;font-size:11px!important;line-height:16px!important;font-weight:680!important;text-align:start!important;box-shadow:none!important;}
  .app-ui .lourex-advisor-starters>button:hover{border-color:color-mix(in srgb,#6577e8 28%,var(--ft-line))!important;background:color-mix(in srgb,#6577e8 7%,var(--ft-surface-2))!important;color:var(--ft-text-strong)!important;}
  .app-ui .lourex-advisor-compose{padding:10px 17px 13px!important;border-top:1px solid color-mix(in srgb,var(--ft-line) 70%,transparent)!important;background:transparent!important;}
  .app-ui .lourex-advisor-compose form{min-height:48px!important;padding:3px 4px!important;border:1px solid var(--ft-line)!important;border-radius:14px!important;background:var(--ft-input)!important;box-shadow:none!important;}
  .app-ui .lourex-advisor-compose form:focus-within{border-color:color-mix(in srgb,#6577e8 48%,var(--ft-line))!important;box-shadow:0 0 0 3px rgba(101,119,232,.10)!important;}
  .app-ui .lourex-advisor-compose form>button{width:42px!important;min-width:42px!important;height:42px!important;border-radius:11px!important;background:linear-gradient(145deg,#6676ee,#3ea5d7)!important;color:#fff!important;}
  .app-ui .lourex-advisor-trust{margin-top:6px!important;color:var(--ft-faint)!important;font-size:9.5px!important;line-height:14px!important;}
}
@media screen and (max-width:860px){
  .app-ui .lourex-ai-panel,.app-ui .lourex-ai-panel[dir="rtl"]{top:auto!important;left:10px!important;right:10px!important;bottom:calc(94px + env(safe-area-inset-bottom,0px))!important;width:auto!important;height:min(70dvh,650px)!important;max-height:70dvh!important;border-radius:24px!important;}
  .app-ui .lourex-ai-head{min-height:62px!important;padding:10px 12px!important;}
  .app-ui .lourex-ai-context{margin:0 12px 5px!important;}
  .app-ui .lourex-ai-messages{padding:9px 12px 11px!important;}
  .app-ui .lourex-ai-empty{padding:9px 1px 4px!important;}
  .app-ui .lourex-ai-empty strong{font-size:16px!important;line-height:22px!important;}
  .app-ui .lourex-ai-compose{padding:8px 10px 9px!important;}
  .app-ui .lourex-advisor-card{border-radius:20px!important;}
  .app-ui .lourex-advisor-head{padding:13px 13px 8px!important;}
  .app-ui .lourex-advisor-mark{width:40px!important;height:40px!important;min-width:40px!important;}
  .app-ui .lourex-advisor-identity h2{font-size:17px!important;line-height:23px!important;}
  .app-ui .lourex-advisor-identity p{display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;overflow:hidden!important;font-size:11px!important;line-height:16px!important;}
  .app-ui .lourex-advisor-body{padding:3px 13px 10px!important;}
  .app-ui .lourex-advisor-starters{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;}
  .app-ui .lourex-advisor-starters>button{min-height:50px!important;padding:8px 9px!important;font-size:10.5px!important;line-height:15px!important;}
  .app-ui .lourex-advisor-compose{padding:9px 13px 11px!important;}
  .app-ui .lourex-advisor-trust>span:last-child{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}
}
@media screen and (max-width:350px){.app-ui .lourex-advisor-starters{grid-template-columns:1fr!important;}.app-ui .lourex-advisor-identity p{display:none!important;}}
@media(prefers-reduced-motion:reduce){.app-ui .lourex-ai-launcher{transition:none!important;}}
'''
write(p,s)

# 7) Phone template gallery: larger, readable cards without touching TemplateRenderer/PDF output.
p='src/styles/template-preferences.css'; s=read(p)
if '/* v328 — phone template gallery' not in s:
    s+='''\n\n/* v328 — phone template gallery: preserve all 18 templates, give each a readable preview. */
@media(max-width:520px){
  .app-ui .template-selector{grid-template-columns:minmax(0,1fr)!important;gap:10px!important;}
  .app-ui .template-card-wrap .template-card{min-height:122px!important;display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(118px,.85fr)!important;align-items:stretch!important;padding:0!important;overflow:hidden!important;border-radius:15px!important;}
  .app-ui .template-mini-static{height:122px!important;min-height:122px!important;border-bottom:0!important;border-inline-end:1px solid rgba(18,44,61,.08)!important;}
  .app-ui .template-card>span{min-width:0!important;display:flex!important;flex-direction:column!important;justify-content:center!important;gap:4px!important;padding:14px 12px!important;text-align:start!important;}
  .app-ui .template-card>span>b{font-size:13px!important;line-height:18px!important;}
  .app-ui .template-card>span>small{font-size:10.5px!important;line-height:15px!important;white-space:normal!important;}
  .app-ui .template-favorite-button{width:34px!important;height:34px!important;}
}
'''
write(p,s)

print('v328 recovery patch staged successfully')
