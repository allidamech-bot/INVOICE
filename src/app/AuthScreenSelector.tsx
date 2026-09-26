import type { CompanySettings, UiLanguage } from '../types.js';
import { SetupScreen, UnlockScreen } from '../components/AuthScreens.js';
import { AccountEntryScreen } from '../components/AccountEntryScreen.js';
import { currentCloudUser, getCloudVaultMeta, installCloudVault } from '../cloud/firebase.js';
import { getEncryptedVault } from '../storage/db.js';

interface SharedProps {
  logoDataUrl: string;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}

type Props =
  | (SharedProps & {
      mode: 'setup';
      company: CompanySettings;
      onFinish: (pin: string, company: CompanySettings) => Promise<void>;
    })
  | (SharedProps & {
      mode: 'unlock';
      onUnlock: (pin: string) => Promise<void>;
    });

type RecoveryState='idle'|'checking'|'blocked'|'error'|'ready';
const CLOUD_INSTALL_RELOAD_KEY='lourex-cloud-install-reload-v317';

function diag(type:string,detail=''):void{try{(window as any).__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
function markReload(reason:string):void{try{(window as any).__LOUREX_MARK_NAVIGATION__?.(reason,'mode=reload source=AuthScreenSelector');}catch{}}
function cloudInstallAlreadyReloaded(uid:string):boolean{
  try{return window.sessionStorage.getItem(CLOUD_INSTALL_RELOAD_KEY)===uid;}catch{return false;}
}
function markCloudInstallReload(uid:string):void{try{window.sessionStorage.setItem(CLOUD_INSTALL_RELOAD_KEY,uid);}catch{}}
function clearCloudInstallReload():void{try{window.sessionStorage.removeItem(CLOUD_INSTALL_RELOAD_KEY);}catch{}}

function RecoveryCard({state,onRetry,onOpen}:{state:Exclude<RecoveryState,'idle'>;onRetry?:()=>void;onOpen?:()=>void}):any{
  const copy=state==='checking'
    ?{
      title:'Restoring encrypted account / جارٍ استعادة الحساب المشفّر',
      body:'LOUREX is checking this account and the encrypted workspace on this device. The page will not reload automatically. / يتحقق LOUREX من الحساب ومساحة العمل المشفّرة على هذا الجهاز. لن تتم إعادة تحميل الصفحة تلقائيًا.'
    }
    :state==='ready'
      ?{
        title:'Encrypted account restored / تم استعادة الحساب المشفّر',
        body:'The encrypted workspace is ready on this device. Open the account when you are ready. / أصبحت مساحة العمل المشفّرة جاهزة على هذا الجهاز. افتح الحساب عندما تكون جاهزًا.'
      }
      :state==='blocked'
        ?{
          title:'Local encrypted data needs review / البيانات المحلية المشفّرة تحتاج مراجعة',
          body:'LOUREX found an existing local encrypted workspace and will not overwrite it automatically. / وجد LOUREX مساحة عمل محلية مشفّرة ولن يستبدلها تلقائيًا.'
        }
        :{
          title:'Account verification is incomplete / لم يكتمل التحقق من الحساب',
          body:'LOUREX could not verify the encrypted account yet. A new PIN will not be created and the page will not reload itself. / تعذّر التحقق من الحساب المشفّر حاليًا. لن يتم إنشاء PIN جديد ولن يعيد الموقع تحميل نفسه.'
        };
  return <section className="auth-recovery-state" role={state==='error'||state==='blocked'?'alert':'status'} aria-live="polite">
    <strong>{copy.title}</strong>
    <p>{copy.body}</p>
    {state==='checking'?<div className="loading-line" aria-hidden="true"/>:null}
    {state==='ready'&&onOpen?<div className="auth-recovery-actions"><button type="button" className="button primary" onClick={onOpen}>Open account / فتح الحساب</button></div>:null}
    {state==='error'&&onRetry?<div className="auth-recovery-actions"><button type="button" className="button primary" onClick={onRetry}>Retry verification / إعادة التحقق</button><a className="button" href="./health.html">Diagnostics / التشخيص</a></div>:null}
    {state==='blocked'?<div className="auth-recovery-actions"><a className="button primary" href="./health.html">Open diagnostics / فتح التشخيص</a></div>:null}
  </section>;
}

export function AuthScreenSelector(props: Props): any {
  // LOUREX is account-first: an authenticated account session is required before
  // setup or unlock. Data movement itself stays automatic and has no sync UI.
  const cloudUser=currentCloudUser();
  const [recoveryState,setRecoveryState]=React.useState<RecoveryState>('idle');
  const [recoveryRetry,setRecoveryRetry]=React.useState(0);

  React.useEffect(()=>{
    if(!cloudUser||props.mode!=='setup'){
      setRecoveryState('idle');
      if(props.mode==='unlock')clearCloudInstallReload();
      return;
    }
    let cancelled=false;
    setRecoveryState('checking');
    diag('auth-recovery-stage','stage=checking mode=setup automaticReload=no');
    void (async()=>{
      try{
        const [localVault,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(cloudUser.uid)]);
        if(cancelled)return;
        diag('auth-recovery-stage',`stage=checked local=${localVault?'present':'empty'} remote=${remote?'present':'empty'}`);
        if(!remote){setRecoveryState('idle');return;}
        // Never replace an unknown local encrypted payload automatically. The
        // automatic path is only for a genuinely empty local workspace, such as
        // a new browser origin/device or a fresh Preview deployment.
        if(localVault){diag('auth-recovery-stage','stage=blocked-local-vault');setRecoveryState('blocked');return;}
        // If a prior explicit Open account action already reloaded this session and
        // Safari still returned to Setup, stop instead of installing/reloading again.
        if(cloudInstallAlreadyReloaded(cloudUser.uid)){diag('auth-recovery-stage','stage=repeat-install-blocked');setRecoveryState('error');return;}
        diag('auth-recovery-stage','stage=install-cloud-start');
        const installed=await installCloudVault(cloudUser.uid);
        if(cancelled)return;
        if(installed){
          diag('auth-recovery-stage','stage=install-cloud-success automaticReload=no');
          setRecoveryState('ready');
          return;
        }
        diag('auth-recovery-stage','stage=install-cloud-failed');
        setRecoveryState('error');
      }catch(error:any){
        // A network/Firebase failure is NOT proof that this is a new account.
        // Never fall through to Setup/Create PIN when account recovery is merely
        // uncertain, otherwise an existing PIN can appear to be "forgotten".
        diag('auth-recovery-error',`name=${String(error?.name||'Error')} code=${String(error?.code||'unknown')}`);
        if(!cancelled)setRecoveryState('error');
      }
    })();
    return()=>{cancelled=true;};
  },[cloudUser?.uid,props.mode,recoveryRetry]);

  if (!cloudUser) {
    return <AccountEntryScreen language={props.language} onLanguageChange={props.onLanguageChange}/>;
  }

  if (props.mode === 'unlock') {
    return <UnlockScreen logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onUnlock={props.onUnlock}/>;
  }

  // Account recovery is shown inside the existing auth surface. It is deliberately
  // not another .loading-screen, so startup always has one full-viewport layer.
  if(recoveryState==='checking'||recoveryState==='blocked')return <RecoveryCard state={recoveryState}/>;
  if(recoveryState==='error')return <RecoveryCard state="error" onRetry={()=>{diag('auth-recovery-stage','stage=user-retry automaticReload=no');clearCloudInstallReload();setRecoveryRetry(value=>value+1);}}/>;
  if(recoveryState==='ready')return <RecoveryCard state="ready" onOpen={()=>{
    if(!cloudUser)return;
    markCloudInstallReload(cloudUser.uid);
    diag('auth-recovery-stage','stage=user-open-account');
    markReload('auth-cloud-install-user-open');
    window.location.reload();
  }}/>;

  return <SetupScreen initialCompany={props.company} logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onFinish={props.onFinish}/>;
}
