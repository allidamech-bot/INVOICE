// Full-vault encryption is intentionally preserved for backward compatibility.
// These quiet windows only reduce redundant Firebase publications after the local
// encrypted vault is already durable. Urgent recovery/manual sync paths pass an
// explicit delay and therefore bypass this size-aware policy.
export const CLOUD_SAVE_SETTLE_MS=1_200;
export const CLOUD_EDIT_ACTIVITY_SETTLE_MS=8_000;
export const CLOUD_MEDIUM_CIPHER_LENGTH=1_200_000;
export const CLOUD_LARGE_CIPHER_LENGTH=4_800_000;
export const CLOUD_MEDIUM_SAVE_SETTLE_MS=2_500;
export const CLOUD_LARGE_SAVE_SETTLE_MS=5_000;
export const CLOUD_MEDIUM_EDIT_SETTLE_MS=12_000;
export const CLOUD_LARGE_EDIT_SETTLE_MS=20_000;

function documentEditorOpen():boolean{
  try{
    return document.documentElement.hasAttribute('data-lourex-document-editor')||Boolean(document.querySelector('.editor-screen'));
  }catch{return false;}
}

export function adaptiveCloudSettleMs(cipherLength:number,editing=false):number{
  const safeLength=Number.isFinite(cipherLength)&&cipherLength>0?cipherLength:0;
  // App.persist() schedules cloud publication after each durable local autosave.
  // While a document editor is mounted, treat every such save as active editing
  // even if the caller did not explicitly pass editing=true. This keeps multi-MB
  // Firebase publication work out of the typing/preview path and prevents the
  // periodic stalls that felt like spontaneous page refreshes on iPhone/PWA.
  const activeEditing=editing||documentEditorOpen();
  if(safeLength>=CLOUD_LARGE_CIPHER_LENGTH)return activeEditing?CLOUD_LARGE_EDIT_SETTLE_MS:CLOUD_LARGE_SAVE_SETTLE_MS;
  if(safeLength>=CLOUD_MEDIUM_CIPHER_LENGTH)return activeEditing?CLOUD_MEDIUM_EDIT_SETTLE_MS:CLOUD_MEDIUM_SAVE_SETTLE_MS;
  return activeEditing?CLOUD_EDIT_ACTIVITY_SETTLE_MS:CLOUD_SAVE_SETTLE_MS;
}
