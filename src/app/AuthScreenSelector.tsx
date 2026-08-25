import type { CompanySettings } from '../types.js';
import { SetupScreen, UnlockScreen } from '../components/AuthScreens.js';
import { AccountEntryScreen } from '../components/AccountEntryScreen.js';
import { currentCloudUser } from '../cloud/firebase.js';

export function AuthScreenSelector(props:any):any{
  if(!currentCloudUser()) return <AccountEntryScreen language={props.language} onLanguageChange={props.onLanguageChange}/>;
  if(props.mode==='setup') return <SetupScreen initialCompany={props.company as CompanySettings} logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onFinish={props.onFinish}/>;
  return <UnlockScreen logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onUnlock={props.onUnlock}/>;
}
