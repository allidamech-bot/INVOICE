export const MIN_ACCOUNT_PASSWORD_LENGTH=12;
export const MAX_ACCOUNT_PASSWORD_LENGTH=128;

export type AccountPasswordIssue='too-short'|'too-long'|'too-repetitive'|null;

export function accountPasswordIssue(password:string):AccountPasswordIssue{
  if(password.length<MIN_ACCOUNT_PASSWORD_LENGTH)return 'too-short';
  if(password.length>MAX_ACCOUNT_PASSWORD_LENGTH)return 'too-long';
  // Reject trivial repeated-character passwords without imposing brittle
  // composition rules that would also reject strong passphrases.
  if(new Set(password).size<4)return 'too-repetitive';
  return null;
}

export function accountPasswordAcceptable(password:string):boolean{return accountPasswordIssue(password)===null;}
