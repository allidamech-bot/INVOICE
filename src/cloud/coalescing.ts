// Full-vault encryption is intentionally preserved for backward compatibility.
// These quiet windows only reduce redundant Firebase publications after the local
// encrypted vault is already durable. Urgent recovery/manual sync paths pass an
// explicit delay and therefore bypass this size-aware policy.
export const CLOUD_SAVE_SETTLE_MS=1_200;
export const CLOUD_EDIT_ACTIVITY_SETTLE_MS=15_000;
export const CLOUD_MEDIUM_CIPHER_LENGTH=1_200_000;
export const CLOUD_LARGE_CIPHER_LENGTH=4_800_000;
export const CLOUD_MEDIUM_SAVE_SETTLE_MS=2_500;
export const CLOUD_LARGE_SAVE_SETTLE_MS=5_000;
export const CLOUD_MEDIUM_EDIT_SETTLE_MS=30_000;
export const CLOUD_LARGE_EDIT_SETTLE_MS=60_000;

function documentEditorOpen():boolean{
  try{return document.documentElement.hasAttribute('data-lourex-document-editor')||Boolean(document.querySelector('.editor-screen'));}
  catch{return false;}
}

function appleMobileWebKit():boolean{
  try{
    if(Boolean((window as Window&{__LOUREX_IOS_WEBKIT__?:boolean}).__LOUREX_IOS_WEBKIT__))return true;
    const ua=String(navigator.userAgent||'');
    const platform=String(navigator.platform||'');
    const touchPoints=Number(navigator.maxTouchPoints||0);
    return /iP(?:hone|ad|od)/i.test(ua)||(platform==='MacIntel'&&touchPoints>1);
  }catch{return false;}
}

export function adaptiveCloudSettleMs(cipherLength:number,editing=false):number{
  const safeLength=Number.isFinite(cipherLength)&&cipherLength>0?cipherLength:0;
  // Local encrypted persistence still happens first. While an editor is mounted,
  // only the remote full-vault publication is delayed so typing and Safari's main
  // thread are not competing with repeated multi-megabyte Firebase work.
  const activeEditing=editing||documentEditorOpen();
  let settle:number;
  if(safeLength>=CLOUD_LARGE_CIPHER_LENGTH)settle=activeEditing?CLOUD_LARGE_EDIT_SETTLE_MS:CLOUD_LARGE_SAVE_SETTLE_MS;
  else if(safeLength>=CLOUD_MEDIUM_CIPHER_LENGTH)settle=activeEditing?CLOUD_MEDIUM_EDIT_SETTLE_MS:CLOUD_MEDIUM_SAVE_SETTLE_MS;
  else settle=activeEditing?CLOUD_EDIT_ACTIVITY_SETTLE_MS:CLOUD_SAVE_SETTLE_MS;
  // iPadOS Desktop Website mode reports MacIntel, so UA-only detection misses it.
  // Keep remote publication outside the active editing hot path on all Apple mobile
  // WebKit variants. Local encrypted persistence remains immediate and unchanged.
  return activeEditing&&appleMobileWebKit()?Math.max(30_000,settle):settle;
}
