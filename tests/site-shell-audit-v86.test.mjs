import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

test('shared modal shell locks background scrolling and stays safe with nested dialogs',()=>{
  const ui=read('src/components/UI.tsx');
  assert.match(read('src/lib/overlay-focus.ts'),/const scrollOwners=new Set<object>/);
  assert.match(ui,/lockOverlayScroll\(this\)/);
  assert.match(read('src/lib/overlay-focus.ts'),/document\.body\.style\.overflow='hidden'/);
  assert.match(read('src/lib/overlay-focus.ts'),/scrollOwners\.delete\(owner\)/);
  assert.match(ui,/unlockOverlayScroll\(this\)/);
  assert.match(ui,/onPointerDown=/);
});

test('toast feedback never blocks the controls underneath it',()=>{
  const ui=read('src/components/UI.tsx');
  assert.match(ui,/pointerEvents:'none'/);
  assert.match(ui,/role=\{error\?'alert':'status'\}/);
  assert.match(ui,/aria-live=\{error\?'assertive':'polite'\}/);
});

test('document contextual actions close on outside press or Escape and mobile uses a portal',()=>{
  const page=read('src/components/DocumentsPage.tsx');
  assert.match(page,/document\.addEventListener\('pointerdown',this\.handleOutsidePointer\)/);
  assert.match(page,/document\.removeEventListener\('pointerdown',this\.handleOutsidePointer\)/);
  assert.match(page,/target\.closest\('\.ta-doc-actions,\.ta-doc-detail-more,\.ta-doc-action-popover,\.ta-doc-mobile-action-portal'\)/,
    'outside-click handling must treat the document.body portal as inside the active menu');
  assert.match(page,/event\.key==='Escape'[\s\S]*?this\.closeMenu\(\)/,
    'Escape must close the menu and restore its trigger focus');
  assert.match(page,/<button type="button" className="ta-doc-row-open"/,
    'document register must retain an explicit open action');
  assert.match(page,/private actionButtons=/);
  assert.match(page,/ReactDOM\.createPortal\(<div className="app-ui ta-doc-desktop-action-portal"[\s\S]*?this\.actionButtons\(doc\)[\s\S]*?document\.body\)/,
    'desktop action menu must mount to the body with accessible role menu');
  assert.match(page,/ReactDOM\.createPortal\(<div className="app-ui ta-doc-mobile-action-portal"[\s\S]*?className="ta-doc-mobile-action-sheet" role="menu"[\s\S]*?this\.actionButtons\(doc\)[\s\S]*?document\.body\)/,
    'mobile action sheet must mount to the body and expose the same authorized actions');
  assert.match(page,/className="ta-doc-action-backdrop"[\s\S]*?onClick=\{\(\)=>this\.setState\(\{menuId:''\}\)\}/,
    'backdrop must dismiss the actions without triggering a business mutation');
});

test('customer editor warns before discarding unsaved changes',()=>{
  const page=read('src/components/CustomersPage.tsx');
  assert.match(page,/editingInitial:string/);
  assert.match(page,/private editingDirty=/);
  assert.match(page,/private requestClose=/);
  assert.match(page,/onClose=\{this\.requestClose\}/);
  assert.match(page,/Discard customer changes\?/);
  assert.match(page,/onConfirm=\{this\.closeEditing\}/);
});

test('saved-item editor protects dirty edits across close and item selection',()=>{
  const modal=read('src/components/SavedItemsModal.tsx');
  assert.match(modal,/type DiscardAction=''\|'editor'\|'modal'\|'select'/);
  assert.match(modal,/private editingDirty=/);
  assert.match(modal,/private requestModalClose=/);
  assert.match(modal,/private selectItem=/);
  assert.match(modal,/onClose=\{this\.requestModalClose\}/);
  assert.match(modal,/Discard item changes\?/);
  assert.match(modal,/onConfirm=\{this\.confirmDiscard\}/);
});

test('cloud account modal remains dismissible while account actions are busy',()=>{
  const modal=read('src/components/CloudAccountModal.tsx');
  assert.match(modal,/private requestClose=\(\)=>this\.props\.onClose\(\);/);
  assert.match(modal,/onClose=\{this\.requestClose\}/);
  assert.match(modal,/<Button disabled=\{this\.state\.busy\} onClick=\{\(\)=>void this\.signOut\(\)\}/);
  assert.match(modal,/private signOut=async\(\)=>\{[\s\S]*?if\(this\.operationRunning\)return;[\s\S]*?await this\.props\.onSignOut\(\);[\s\S]*?await suspendSession\(\);/);
  assert.doesNotMatch(modal,/Sync Now|مزامنة الآن/);
});

test('account entry cannot switch modes or double-submit while authentication is running',()=>{
  const screen=read('src/components/AccountEntryScreen.tsx');
  const setMode=screen.slice(screen.indexOf('private setMode='),screen.indexOf('private modeKeyDown='));
  assert.match(setMode,/private setMode=.*?=>\{if\(this\.state\.busy\)return;/,
    'click and keyboard mode switches must both fail closed during an active auth request');
  assert.match(screen,/private modeKeyDown=[\s\S]*?this\.setMode\(mode,true\)/,
    'keyboard tabs must share the guarded setMode path');
  assert.match(screen,/className="ta-auth-language" disabled=\{this\.state\.busy\}/,
    'language may not be switched while credentials are processing');
  assert.match(screen,/id="account-tab-signin"[\s\S]*?disabled=\{this\.state\.busy\|\|linkingGoogle\}[\s\S]*?className=\{!create\?'is-active':''\}/,
    'sign-in tab must remain disabled throughout busy and pending Google linking');
  assert.match(screen,/id="account-tab-create"[\s\S]*?disabled=\{this\.state\.busy\|\|linkingGoogle\}[\s\S]*?className=\{create\?'is-active':''\}/,
    'create-account tab must remain disabled throughout busy and pending Google linking');
  assert.match(screen,/className="ta-auth-feedback is-error" role="alert"/,
    'authentication failure must be announced to assistive technologies');
  assert.match(screen,/className="ta-auth-feedback is-success" role="status"/,
    'successful recovery or account status must remain accessible');
  assert.match(screen,/className="ta-auth-link" disabled=\{this\.state\.busy\} onClick=\{\(\)=>this\.setMode\('signin'\)\}/,
    'a non-busy user must retain an explicit way to cancel pending Google linking');
});

test('settings modal warns before discarding persistent unsaved company or document settings',()=>{
  const settings=read('src/components/SettingsModal.tsx');
  assert.match(settings,/companyInitial:string; documentsInitial:string/);
  assert.match(settings,/private hasUnsavedSettings=/);
  assert.match(settings,/private requestClose=/);
  assert.match(settings,/onClose=\{this\.requestClose\}/);
  assert.match(settings,/Discard unsaved settings\?/);
  assert.match(settings,/onConfirm=\{this\.discardAndClose\}/);
  assert.match(settings,/companyInitial:JSON\.stringify\(company\)/);
  assert.match(settings,/const nextPersisted=\{\.\.\.persisted,uiLanguage:value\}/);
  assert.match(settings,/documentsInitial:JSON\.stringify\(nextPersisted\)/);
  assert.match(settings,/appSettings:state\.appSettings\.uiLanguage===value\?\{\.\.\.state\.appSettings,uiLanguage:previous\.uiLanguage\}:state\.appSettings/);
});
