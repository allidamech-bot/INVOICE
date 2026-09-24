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

type RecoveryState='idle'|'checking'|'blocked'|'error';

export function AuthScreenSelector(props: Props): any {
  // LOUREX is account-first: an authenticated account session is required before
  // setup or unlock. Data movement itself stays automatic and has no sync UI.
  const cloudUser=currentCloudUser();
  const [recoveryState,setRecoveryState]=React.useState<RecoveryState>('idle');

  React.useEffect(()=>{
    if(!cloudUser||props.mode!=='setup'){setRecoveryState('idle');return;}
    let cancelled=false;
    setRecoveryState('checking');
    void (async()=>{
      try{
        const [localVault,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(cloudUser.uid)]);
        if(cancelled)return;
        if(!remote){setRecoveryState('idle');return;}
        // Never replace an unknown local encrypted payload automatically. The
        // automatic path is only for a genuinely empty local workspace, such as
        // a new browser origin/device or a fresh Preview deployment.
        if(localVault){setRecoveryState('blocked');return;}
        const installed=await installCloudVault(cloudUser.uid);
        if(cancelled)return;
        if(installed){window.location.reload();return;}
        setRecoveryState('error');
      }catch{
        // A network/Firebase failure is NOT proof that this is a new account.
        // Never fall through to Setup/Create PIN when account recovery is merely
        // uncertain, otherwise an existing PIN can appear to be "forgotten".
        if(!cancelled)setRecoveryState('error');
      }
    })();
    return()=>{cancelled=true;};
  },[cloudUser?.uid,props.mode]);

  if (!cloudUser) {
    return <AccountEntryScreen language={props.language} onLanguageChange={props.onLanguageChange}/>;
  }

  if (props.mode === 'unlock') {
    return <UnlockScreen logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onUnlock={props.onUnlock}/>;
  }

  // An existing cloud workspace already owns its PIN metadata. Do not offer
  // "Create a PIN" while that encrypted workspace is being restored, otherwise
  // a user could accidentally create a second local PIN for the same account.
  if(recoveryState==='checking'){
    return <div className="loading-screen" role="status" aria-live="polite">Restoring your encrypted LOUREX account… / جارٍ استعادة حساب LOUREX المشفّر…</div>;
  }
  if(recoveryState==='blocked'){
    return <div className="loading-screen" role="alert">Existing encrypted local data needs recovery before this account can be restored. / توجد بيانات محلية مشفّرة تحتاج إلى استعادة قبل تحميل هذا الحساب.</div>;
  }
  if(recoveryState==='error'){
    return <div className="loading-screen" role="alert"><span>LOUREX could not verify the encrypted account yet. A new PIN will not be created. / تعذّر التحقق من الحساب المشفّر حاليًا. لن يتم إنشاء PIN جديد.</span><button type="button" className="button primary" onClick={()=>window.location.reload()}>Retry / إعادة المحاولة</button></div>;
  }

  return <SetupScreen initialCompany={props.company} logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onFinish={props.onFinish}/>;
}
