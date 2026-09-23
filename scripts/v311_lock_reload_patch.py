from pathlib import Path

p=Path('src/app/index.tsx')
s=p.read_text()

old="""function manualLockUnsafeWorkspaceOpen():boolean{
  if(isDocumentEditorOpen())return true;
  const editableOperations=Boolean(document.querySelector('.operations-editor:not(.purchase-editor),.purchase-editor fieldset:not([disabled])'));
  return editableOperations||Boolean(document.querySelector('.product-library-pro.editor-open,.modal-backdrop'))||inventoryEntryHasDraftInput();
}

function reloadUnsafeWorkspaceOpen():boolean{
  return isDocumentEditorOpen()||Boolean(document.querySelector('.operations-page,.product-library-pro.editor-open,.modal-backdrop'));
}"""
new="""function manualLockUnsafeWorkspaceOpen():boolean{
  if(isDocumentEditorOpen())return true;
  // Settings is itself a modal and owns its own unsaved-settings check before it
  // calls onLock(). Do not reject a deliberate Lock merely because that modal is
  // open. Only real inline draft state should block a manual lock.
  return document.documentElement.hasAttribute('data-lourex-workspace-dirty')||inventoryEntryHasDraftInput();
}

function reloadUnsafeWorkspaceOpen():boolean{
  // Browsing Operations is safe. Reload protection follows actual dirty state,
  // document editors and active dialogs rather than the mere presence of a page.
  return isDocumentEditorOpen()||document.documentElement.hasAttribute('data-lourex-workspace-dirty')||Boolean(document.querySelector('.modal-backdrop'));
}"""
if old not in s: raise SystemExit('lock/reload safety anchor missing')
s=s.replace(old,new,1)

old="""    // Every explicit Firebase/Google login must cross the local encryption PIN gate.
    // Normal reloads can still resume the UID-bound unlocked session."""
new="""    // Every explicit Firebase/Google login and every new page runtime must cross
    // the local encryption PIN gate. resumeAccountSession() intentionally selects
    // the UID scope without authorizing a persisted CryptoKey."""
if old not in s: raise SystemExit('PIN comment anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
print('v311 lock/reload patch applied')
