from pathlib import Path
p=Path('src/cloud/firebase.ts')
s=p.read_text()
old="""function inlineDraftWorkspaceOpen():boolean{
  try{
    if(document.documentElement.hasAttribute('data-lourex-document-editor')||document.querySelector('.editor-screen,.operations-page,.product-library-pro.editor-open'))return true;
    const modal=document.querySelector('.modal-backdrop');
    return Boolean(modal&&!modal.querySelector('.cloud-account-panel,.cloud-auth-form'));
  }catch{return false;}
}"""
new="""function inlineDraftWorkspaceOpen():boolean{
  try{
    // Block cloud replacement for actual unsaved work, not merely because the
    // user is browsing an Operations page. All inline business editors publish
    // the shared workspace-dirty marker; document editors keep their own marker.
    if(document.documentElement.hasAttribute('data-lourex-document-editor')||document.documentElement.hasAttribute('data-lourex-workspace-dirty')||document.querySelector('.editor-screen'))return true;
    const modal=document.querySelector('.modal-backdrop');
    // The explicit cloud restore/account flow must be allowed to perform the
    // replacement it was opened for. Other dialogs still block replacement.
    return Boolean(modal&&!modal.querySelector('.cloud-account-panel,.cloud-auth-form'));
  }catch{return false;}
}"""
if old not in s: raise SystemExit('inlineDraftWorkspaceOpen anchor missing')
p.write_text(s.replace(old,new,1))
print('v311 cloud restore guard patch applied')
