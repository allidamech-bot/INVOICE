// Strict classification of Google IAMCredentials outcomes.
// Never log service-account token, request URL, response body or arbitrary error message.
export function classifyIamCredentialsReply(status,body){
 const code=Number(status);
 const error=body&&typeof body==='object'?body.error:null;
 const reason=Array.isArray(error?.details)?error.details.find(d=>typeof d?.reason==='string')?.reason:null;
 if(code===200)return 'PASSED';
 if((code===403||code===400)&&reason==='SERVICE_DISABLED')return 'IAM_API_DISABLED';
 if(code===403&&typeof error?.message==='string'&&/iam\.serviceAccounts\.getAccessToken/.test(error.message))return 'IAM_GET_ACCESS_TOKEN_DENIED';
 if(code===403)return 'IAM_PERMISSION_DENIED';
 if(code===401)return 'IAM_UNAUTHENTICATED';
 if(code===404)return 'IAM_ACCOUNT_NOT_FOUND';
 if(code===400)return 'IAM_REQUEST_INVALID';
 if(code===429)return 'IAM_RATE_LIMIT';
 if(code>=500&&code<=599)return 'IAM_SERVER_ERROR';
 return 'IAM_UNKNOWN';
}
