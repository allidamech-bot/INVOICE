export function attachmentScopeKey(scope:any, mode:string):string {
 if(mode!=='controller'||scope?.scope!=='business')return '';
 const parts=[scope.accountId,scope.workspaceId,scope.branchId,scope.threadId];
 return parts.every((x:unknown)=>typeof x==='string'&&x.length>0)?JSON.stringify(parts):'';
}
export function explicitAttachedFileFollowup(message:string):boolean {
 const text=String(message||'').normalize('NFKC').trim().toLowerCase();
 if(!text||text.length>6000)return false;
 const reference=/الملف|المرفق|الصورة|attached file|uploaded file|this file|previous file|file i uploaded|from the attachment|from this file/.test(text);
 const task=/حوّل|حول|اعمل|جهز|أنشئ|انشئ|حلل|استخرج|كم صنف|راجع|convert|make|create|analyze|extract|review|count/.test(text);
 const exclude=/لا تستخدم|تجاهل|احذف|انس|ignore|remove|discard|delete/.test(text);
 return reference&&task&&!exclude;
}