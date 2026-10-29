/**
 * Finance Plan Alif 22 — OFFLINE, READ-ONLY opening book preflight.
 * Checks structural consistency of privately supplied ONE company/branch/
 * currency opening book. Does NOT fetch evidence, certify policy, authenticate
 * reviewers, persist anything, generate GL entries, or authorize posting.
 * CLI prints missing/inconsistent FIELD PATHS ONLY, not financial figures.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const HASH=/^[0-9a-f]{64}$/i;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const KINDS=new Set(['asset','liability','equity','contra-asset']);
const CONTROLS={inventory:{kind:'asset',side:'debit'},
  customerReceivable:{kind:'asset',side:'debit'},
  supplierPayable:{kind:'liability',side:'credit'},
  treasury:{kind:'asset',side:'debit'}};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const goodId=x=>typeof x==='string'&&ID.test(x);
const hash=x=>typeof x==='string'&&HASH.test(x);
function day(x){
 if(typeof x!=='string'||!DATE.test(x))return false;
 const parsed=new Date(x+'T00:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===x;
}
function money(value,digits){
 if(typeof value!=='string'||!Number.isInteger(digits)||![0,2,3].includes(digits)
   ||!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');
 if(fraction.length>digits)return null;
 return BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0')||'0');
}
export function inspectOfflineFinanceOpening(input){
 const issues=[];
 const check=(path,valid)=>{if(!valid)issues.push(path);return valid;};
 const obj=(x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 check('schema',input?.schema==='LOUREX_ALIF_OPENING_V1');
 const scope=input?.scope||{};
 check('scope.legalEntityId',goodId(scope.legalEntityId));
 check('scope.workspaceId',goodId(scope.workspaceId));
 check('scope.branchId',goodId(scope.branchId));
 check('scope.functionalCurrency',typeof scope.functionalCurrency==='string'
   &&/^[A-Z]{3}$/.test(scope.functionalCurrency));
 check('scope.cutoffDate',day(scope.cutoffDate));
 check('scope.minorDigits',[0,2,3].includes(scope.minorDigits));
 check('scope.policyVersion',goodId(scope.policyVersion));
 const digits=scope.minorDigits;
 const chart=input?.chartOfAccounts;
 check('chartOfAccounts',Array.isArray(chart)&&chart.length>=5&&chart.length<=500);
 const accounts=new Map();
 if(Array.isArray(chart)&&chart.length<=500){
  chart.forEach((account,i)=>{
   const path='chartOfAccounts['+i+']';
   check(path+'.accountId',goodId(account?.accountId));
   check(path+'.type',KINDS.has(account?.type));
   check(path+'.name',typeof account?.name==='string'&&account.name.trim().length>=3);
   if(goodId(account?.accountId)){
    check(path+'.unique',!accounts.has(account.accountId));
    accounts.set(account.accountId,account);
   }
  });
 }
 const lines=input?.balances;
 check('balances',Array.isArray(lines)&&lines.length>=5&&lines.length<=500);
 const balances=new Map();
 let debit=0n,credit=0n;
 if(Array.isArray(lines)&&lines.length<=500)lines.forEach((line,i)=>{
  const path='balances['+i+']',id=line?.accountId,account=accounts.get(id);
  check(path+'.accountId',goodId(id)&&!!account);
  check(path+'.unique',!balances.has(id));
  check(path+'.evidenceSha256',hash(line?.evidenceSha256));
  check(path+'.sourceAsOfDate',day(line?.sourceAsOfDate)
   &&day(scope.cutoffDate)&&line.sourceAsOfDate<=scope.cutoffDate);
  const val=money(line?.amount,digits);
  check(path+'.amount',val!==null);
  const normal=account?.type==='asset'?'debit'
   :account?.type==='contra-asset'?'credit'
   :account?.type==='liability'||account?.type==='equity'?'credit':null;
  check(path+'.side',normal!==null&&line?.side===normal);
  if(goodId(id))balances.set(id,line);
  if(val!==null&&line?.side==='debit')debit+=val;
  if(val!==null&&line?.side==='credit')credit+=val;
 });
 const controlRows=input?.sourceControls;
 check('sourceControls',Array.isArray(controlRows)
   &&controlRows.length>=4&&controlRows.length<=500);
 const controlIds=new Set(),seenKinds=new Set();
 if(Array.isArray(controlRows)&&controlRows.length<=500)controlRows.forEach((row,i)=>{
  const path='sourceControls['+i+']',expected=CONTROLS[row?.kind],id=row?.accountId;
  check(path+'.kind',!!expected);
  if(expected)seenKinds.add(row.kind);
  check(path+'.accountId',goodId(id)&&!!accounts.get(id));
  check(path+'.unique',!controlIds.has(id));if(goodId(id))controlIds.add(id);
  check(path+'.evidenceSha256',hash(row?.evidenceSha256));
  check(path+'.sourceAsOfDate',day(row?.sourceAsOfDate)
   &&day(scope.cutoffDate)&&row.sourceAsOfDate<=scope.cutoffDate);
  const val=money(row?.amount,digits),book=money(balances.get(id)?.amount,digits);
  check(path+'.amount',val!==null);
  check(path+'.sourceMatchesBook',
   !!expected&&accounts.get(id)?.type===expected.kind
   &&balances.get(id)?.side===expected.side&&val!==null
   &&book!==null&&val===book);
 });
 for(const name of Object.keys(CONTROLS))
  check('sourceControls.required.'+name,seenKinds.has(name));
 check('balances.balanced',Array.isArray(lines)&&lines.length>=5
   &&debit>0n&&debit===credit);
 check('balances.accountCoverage',Array.isArray(lines)
   &&balances.size===accounts.size&&[...accounts.keys()].every(id=>balances.has(id)));
 // No status here grants accounting approval, provenance or write authority.
 return{
  schema:'LOUREX_ALIF_OPENING_PREFLIGHT_RESULT_V1',
  status:issues.length?'INCOMPLETE_NO_POSTING':'STRUCTURALLY_READY_FOR_HUMAN_REVIEW_ONLY',
  missing:[...new Set(issues)],
  sourceAuthenticated:false,chartApproved:false,openingApproved:false,
  journalPosted:false,productionReady:false,
  note:'Structural local check only. Verify every original source and legal entity signoff independently. No Firebase or accounting writes.'
 };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  if(process.argv.length!==3)throw Error('One private local JSON path required');
  const report=inspectOfflineFinanceOpening(JSON.parse(readFileSync(resolve(process.argv[2]),'utf8')));
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='STRUCTURALLY_READY_FOR_HUMAN_REVIEW_ONLY')process.exitCode=2;
 }catch{
  console.error('INCOMPLETE_NO_POSTING: unreadable or invalid private opening file');
  process.exitCode=2;
 }
}
