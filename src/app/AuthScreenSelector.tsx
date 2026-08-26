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
  // An existing encrypted local vault must always remain unlockable with its PIN,
  // even when Firebase is offline, blocked, signed out, or still restoring auth.
  if (props.mode === 'unlock') {
    return <UnlockScreen logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onUnlock={props.onUnlock}/>;
  }

  // Cloud account is required only during first-time setup so the initial vault
  // is linked before it is created. Existing devices remain local-first offline.
  if (!currentCloudUser()) {
    return <AccountEntryScreen language={props.language} onLanguageChange={props.onLanguageChange}/>;
  }

  return <SetupScreen initialCompany={props.company} logoDataUrl={props.logoDataUrl} language={props.language} onLanguageChange={props.onLanguageChange} onFinish={props.onFinish}/>;
}
