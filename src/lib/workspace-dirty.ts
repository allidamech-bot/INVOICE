import { t } from './i18n.js';

const ATTRIBUTE='data-lourex-workspace-dirty';

const OWNER_ROOTS:Record<string,string>={
  customers:'.customers-page,.customer-profile-page',
  operations:'.operations-page'
};

function publishedDirtyOwnerIsActive():boolean{
  if(typeof document==='undefined')return false;
  const root=document.documentElement;
  const owner=(root.getAttribute(ATTRIBUTE)||'').trim();
  if(!owner)return false;

  const selector=OWNER_ROOTS[owner];
  if(!selector)return true;
  if(document.querySelector(selector))return true;

  // A workspace can unmount between its last component update and the shell's
  // next navigation click. Never let that stale marker make unrelated LOUREX
  // pages look dirty. Known owners are safe to self-heal because their real
  // beforeunload handlers remain mounted only while their workspace is mounted.
  if(root.getAttribute(ATTRIBUTE)===owner)root.removeAttribute(ATTRIBUTE);
  return false;
}

function operationsInlineMovementDraft():boolean{
  if(typeof document==='undefined')return false;
  const entry=document.querySelector('.ta-inventory-entry');
  if(!(entry instanceof HTMLElement))return false;

  // Operations already publishes the shared dirty marker for supplier, purchase,
  // expense and populated movement drafts. Keep one DOM fallback for the narrow
  // window before React/componentDidUpdate publishes that marker so navigation,
  // cloud replacement and update controls cannot race a freshly edited movement.
  const item=entry.querySelector<HTMLSelectElement>('select');
  const decimalInputs=Array.from(entry.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]'));
  const textInputs=Array.from(entry.querySelectorAll<HTMLInputElement>('input:not([type="date"]):not([list])'));
  const hasEnteredValue=decimalInputs.some(input=>input.value.trim())||textInputs.some(input=>input.value.trim());
  if(hasEnteredValue)return true;

  // A selected item by itself is treated as a draft only while focus is inside
  // the movement entry. This protects an in-progress selection without making a
  // pre-focused inventory item permanently block background cloud freshness.
  const active=document.activeElement;
  return Boolean(item?.value.trim()&&active instanceof Element&&entry.contains(active));
}

export function workspaceHasUnsavedChanges():boolean{
  if(typeof document==='undefined')return false;
  return publishedDirtyOwnerIsActive()||operationsInlineMovementDraft();
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
