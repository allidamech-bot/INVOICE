import type { CompanySettings, UiLanguage } from '../types.js';
import { SetupScreen, UnlockScreen } from '../components/AuthScreens.js';
import { AccountEntryScreen } from '../components/AccountEntryScreen.js';
import { currentCloudUser } from '../cloud/firebase.js';

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

export function AuthScreenSelector(props: Props): any {
  if (!currentCloudUser()) return <AccountEntryScreen language={props.language} onLanguageChange={props.onLanguageChange}/>;
  if (props.mode === 'unlock') return <UnlockScreen logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onUnlock={props.onUnlock}/>;
  return <SetupScreen initialCompany={props.company} logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onFinish={props.onFinish}/>;
}
