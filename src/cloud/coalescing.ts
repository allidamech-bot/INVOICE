// Full-vault encryption is intentionally preserved for backward compatibility.
// These quiet windows only reduce redundant Firebase publications after the local
// encrypted vault is already durable. Urgent recovery/manual sync paths pass an
// explicit delay and therefore bypass this size-aware policy.
export const CLOUD_SAVE_SETTLE_MS=350;
export const CLOUD_EDIT_ACTIVITY_SETTLE_MS=800;
export const CLOUD_MEDIUM_CIPHER_LENGTH=1_200_000;
export const CLOUD_LARGE_CIPHER_LENGTH=4_800_000;
export const CLOUD_MEDIUM_SAVE_SETTLE_MS=650;
export const CLOUD_LARGE_SAVE_SETTLE_MS=1_200;
export const CLOUD_MEDIUM_EDIT_SETTLE_MS=1_200;
export const CLOUD_LARGE_EDIT_SETTLE_MS=2_000;

export function adaptiveCloudSettleMs(cipherLength:number,editing=false):number{
  const safeLength=Number.isFinite(cipherLength)&&cipherLength>0?cipherLength:0;
  if(safeLength>=CLOUD_LARGE_CIPHER_LENGTH)return editing?CLOUD_LARGE_EDIT_SETTLE_MS:CLOUD_LARGE_SAVE_SETTLE_MS;
  if(safeLength>=CLOUD_MEDIUM_CIPHER_LENGTH)return editing?CLOUD_MEDIUM_EDIT_SETTLE_MS:CLOUD_MEDIUM_SAVE_SETTLE_MS;
  return editing?CLOUD_EDIT_ACTIVITY_SETTLE_MS:CLOUD_SAVE_SETTLE_MS;
}
