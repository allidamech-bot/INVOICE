import type { CompanySettings } from '../types.js';
import { SetupScreen, UnlockScreen } from '../components/AuthScreens.js';

export function AuthScreenSelector(props:any):any{
  if(props.mode==='setup') return <SetupScreen initialCompany={props.company as CompanySettings} onFinish={props.onFinish}/>;
  return <UnlockScreen onUnlock={props.onUnlock}/>;
}
