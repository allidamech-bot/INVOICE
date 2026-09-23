import { t } from './i18n.js';

const ATTRIBUTE='data-lourex-workspace-dirty';

export function workspaceHasUnsavedChanges():boolean{
  return typeof document!=='undefined'&&document.documentElement.hasAttribute(ATTRIBUTE);
}

export function setWorkspaceDirty(owner:string,dirty:boolean):void{
  if(typeof document==='undefined')return;
  const root=document.documentElement;
  if(dirty){root.setAttribute(ATTRIBUTE,owner);return;}
  if(root.getAttribute(ATTRIBUTE)===owner)root.removeAttribute(ATTRIBUTE);
}

export function confirmWorkspaceDeparture():boolean{
  return !workspaceHasUnsavedChanges()||window.confirm(t('Leave this page? Unsaved changes will be lost.','مغادرة هذه الصفحة؟ سيتم فقدان التعديلات غير المحفوظة.'));
}
