export type SettingsScope='account'|'settings';

let requestedScope:SettingsScope='settings';

export function requestSettingsScope(scope:SettingsScope):void{
  requestedScope=scope;
}

export function consumeSettingsScope():SettingsScope{
  const scope=requestedScope;
  requestedScope='settings';
  return scope;
}
