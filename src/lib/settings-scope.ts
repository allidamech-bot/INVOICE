export type SettingsScope='account'|'settings';

const SETTINGS_SCOPE_KEY='lourex-settings-scope';

export function requestSettingsScope(scope:SettingsScope):void{
  try{
    sessionStorage.setItem(SETTINGS_SCOPE_KEY,scope);
  }catch{
    // Session storage can be unavailable in hardened/private browser contexts.
    // Consumers safely fall back to the Settings scope.
  }
}

export function consumeSettingsScope():SettingsScope{
  try{
    const scope=sessionStorage.getItem(SETTINGS_SCOPE_KEY);
    sessionStorage.removeItem(SETTINGS_SCOPE_KEY);
    return scope==='account'?'account':'settings';
  }catch{
    return 'settings';
  }
}
