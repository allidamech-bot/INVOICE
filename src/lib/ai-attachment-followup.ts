export function attachmentScopeKey(scope:any, mode:string):string {
 if(mode!=='controller'||scope?.scope!=='business')return '';
 const parts=[scope.accountId,scope.workspaceId,scope.branchId,scope.threadId];
 return parts.every((x:unknown)=>typeof x==='string'&&x.length>0)?JSON.stringify(parts):'';
}
export function explicitAttachedFileFollowup(message:string):boolean {
 const text=String(message||'').normalize('NFKC').trim().toLowerCase();
 if(!text||text.length>6000)return false;
 // Natural singular/plural references must work after a source analysis:
 // "ادمج الملفات" and "combine the uploaded files" are explicit reuse intents.
 // A general request to merge records, without mentioning files, is not.
 const reference=/(?:الملف(?:ات)?|ملفات?|المرفق(?:ات)?|مرفقات?|الصورة|الصور|(?:^|[\s،,؛:])صور(?=$|[\s،,؛.!?])|(?:attached|uploaded|previously uploaded)\s+(?:files?|attachments?|documents?|images?)|(?:the|these|those|all|previous)\s+(?:files?|attachments?|uploads?|images?)|this file|previous file|file i uploaded|from the attachment|from this file)/iu.test(text);
 const task=/(?:حوّل|حول|اعمل|جهز|أنشئ|انشئ|حلل|استخرج|كم صنف|راجع|ادمج|إدمج|اجمع|إجمع|وحّد|وحد|وحّدها|ادمجها|اجمعها|create|convert|make|analy[sz]e|extract|review|count|combine|merge|consolidate|unify)/iu.test(text);
 // "انسخ" (copy) and "لا تتجاهل" (do not ignore) are NOT instructions
 // to discard the attachments. Only explicit rejection clears reuse intent.
 const rejectArabic=/(?:لا\s+تستخدم|بدون\s+استخدام|تجاهل|احذف|احذفها|تخلص\s+من|(?:^|[\s،,؛])(?:انس|انسى|إنسى)(?=[\s،,؛.!?]|$))/iu.test(
   text.replace(/لا\s+تتجاهل/gu,''));
 const rejectEnglish=/(?:\b(?:ignore|remove|discard|delete|forget)\b|\b(?:do\s+not|don't|without)\s+us(?:e|ing)\b)/iu.test(
   text.replace(/\b(?:do\s+not|don't)\s+ignore\b/giu,''));
 return reference&&task&&!rejectArabic&&!rejectEnglish;
}
