/** Cross-language grounding for quotation validity.
 * A model may translate a user-provided duration, but may never invent
 * a duration absent from an explicit user validity instruction. */
const digits=(text:string)=>String(text||'').normalize('NFKC')
  .replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x0660))
  .replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-0x06f0));
const dayCount=(text:string):number|null=>{
  const match=/^\s*(\d{1,4})\s*(?:days?|d|يوم|يوما|يوماً|أيام|ايام)\s*$/iu.exec(digits(text));
  return match&&Number(match[1])<=3650?Number(match[1]):null;
};
export function groundedAiValidity(value:unknown,message:string,fallback:string,max=100):string{
  const candidate=String(value??'').trim().slice(0,max),user=digits(message);
  if(!candidate)return fallback;
  if(user.normalize('NFKC').toLocaleLowerCase().includes(candidate.normalize('NFKC').toLocaleLowerCase()))return candidate;
  const candidateDays=dayCount(candidate);
  if(candidateDays===null)return fallback;
  // Duration must explicitly modify "validity", not delivery or payment terms.
  const evidence=/(?:(?:الصلاحية|صلاحية)(?:\s+العرض)?|صالح\s*(?:لمدة)?|validity|valid\s+for)\s*[:：=]?\s*(\d{1,4})\s*(?:days?|يوم|يوما|يوماً|أيام|ايام)/iu.exec(user)
    ||/(\d{1,4})\s*(?:days?|يوم|يوما|يوماً|أيام|ايام)\s*(?:للصلاحية|صلاحية|validity)/iu.exec(user);
  return evidence&&Number(evidence[1])===candidateDays?candidate:fallback;
}
