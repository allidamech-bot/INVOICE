import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

test('shared modal shell locks background scrolling and stays safe with nested dialogs',()=>{
  const ui=read('src/components/UI.tsx');
  assert.match(ui,/let openModalFrames=0/);
  assert.match(ui,/document\.body\.style\.overflow='hidden'/);
  assert.match(ui,/openModalFrames=Math\.max\(0,openModalFrames-1\)/);
  assert.match(ui,/if\(openModalFrames===0\)document\.body\.style\.overflow=bodyOverflowBeforeModals/);
  assert.match(ui,/onPointerDown=/);
});

test('toast feedback never blocks the controls underneath it',()=>{
  const ui=read('src/components/UI.tsx');
  assert.match(ui,/pointerEvents:'none'/);
  assert.match(ui,/role=\{error\?'alert':'status'\}/);
  assert.match(ui,/aria-live=\{error\?'assertive':'polite'\}/);
});

test('document contextual actions retain outside-dismissal, Escape and accessible body portals',()=>{
 const page=read('src/components/DocumentsPage.tsx');
 assert.match(page,/document\.addEventListener\('pointerdown',this\.handleOutsidePointer\)/);
 assert.match(page,/document\.removeEventListener\('pointerdown',this\.handleOutsidePointer\)/);
 assert.ok(page.includes("target.closest('.ta-doc-actions,.ta-doc-detail-more,.ta-doc-action-popover,.ta-doc-mobile-action-portal')"));
 assert.match(page,/event\.key==='Escape'/);
 assert.match(page,/className="ta-doc-row-open"/);
 assert.match(page,/private actionButtons=/);
 assert.ok(page.includes('ReactDOM.createPortal(')&&page.includes(',document.body)'));
 assert.ok(page.includes('ta-doc-mobile-action-sheet" role="menu"'));
 assert.ok(page.includes('ta-doc-action-backdrop" aria-label='));
 assert.ok(page.includes("onClick={()=>this.setState({menuId:''})}"));
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

test('account entry disables language, auth mode and submit while authentication runs',()=>{
 const screen=read('src/components/AccountEntryScreen.tsx');
 assert.match(screen,/if\(this\.state\.busy\)return;/);
 assert.match(screen,/className="ta-auth-language" disabled=\{this\.state\.busy\}/);
 for(const tab of ['account-tab-signin','account-tab-create']){
   const start=screen.indexOf('id="'+tab+'"');
   assert.ok(start>=0,tab+' is available');
   const markup=screen.slice(start,start+420);
   assert.ok(markup.includes('disabled={this.state.busy||linkingGoogle}'),tab+' must prevent busy changes');
   assert.ok(markup.includes('aria-selected='),tab+' must expose accessible selection');
 }
 assert.match(screen,/className="ta-auth-primary" variant="primary" type="submit" disabled=\{this\.state\.busy\}/);
 assert.match(screen,/ta-auth-feedback is-error" role="alert"/);
 assert.match(screen,/ta-auth-feedback is-success" role="status"/);
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
