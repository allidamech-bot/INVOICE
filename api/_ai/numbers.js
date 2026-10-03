// Normalize explicit Arabic numeric characters without converting units or prices.
export function normalizeSourceNumber(value){
  return String(value??'').replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-0x6f0)).replace(/٬/g,'').replace(/٫/g,'.');
}
