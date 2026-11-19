const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const need=(ok)=>{if(!ok)throw Error('FISCAL_COVERAGE_INVALID');};
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const scope=(r,s)=>r.accountUid===s.accountUid&&r.workspaceId===s.workspaceId&&ID.test(r.egsId);
function index(rows,key){const out=new Map();for(const r of rows){const k=r[key];need(typeof k==='string'&&ID.test(k)&&!out.has(k));out.set(k,r);}return out;}
// Include private intents and issues independently of mutable commercial drafts.
export function fiscalSalesCoverage({scope:s,from,to,documents,intents,issues,postings}){
 need(day(from)&&day(to)&&from<=to);
 const d=index(documents,'id'),a=index(intents,'documentId'),i=index(issues,'documentId'),p=index(postings,'sourceId');
 for(const r of a.values())need(scope(r,s)&&day(r.date)&&HEX.test(r.snapshotDigest)&&Number.isSafeInteger(r.revision)&&r.revision>0);
 for(const r of i.values())need(scope(r,s)&&day(r.date)&&HEX.test(r.snapshotDigest)&&['queued','submitting','uncertain','retryable','rejected','cleared','reported'].includes(r.status));
 for(const r of p.values())need(scope(r,s)&&r.environment==='simulation'&&r.key==='sale-'+r.sourceId&&day(r.taxDate));
 const blockers=[];let unpostedSales=0,pendingSales=0;
 for(const id of new Set([...d.keys(),...a.keys(),...i.keys(),...p.keys()])){
  const doc=d.get(id),intent=a.get(id),issue=i.get(id),posting=p.get(id);
  const dates=[doc?.issueDate,intent?.date,issue?.date,posting?.taxDate].filter(x=>x!==undefined);
  need(dates.every(day));if(!dates.some(x=>x>=from&&x<=to))continue;
  const accepted=issue&&['cleared','reported'].includes(issue.status);
  const bound=!!(intent&&issue&&intent.egsId===issue.egsId&&intent.date===issue.date&&intent.snapshotDigest===issue.snapshotDigest);
  const matched=!!(accepted&&bound&&posting&&doc&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&doc.issueDate===intent.date&&doc.revision===intent.revision&&posting.commercialPosted===true&&posting.sourceRevision===intent.revision&&posting.egsId===issue.egsId&&posting.taxDate===issue.date&&posting.uuid===issue.uuid&&posting.snapshotDigest===issue.snapshotDigest&&HEX.test(issue.resultDigest)&&posting.evidenceDigest===issue.resultDigest);
  if(matched)continue;
  if(accepted||posting||doc?.status==='final')unpostedSales++;
  if(intent&&!accepted||issue&&!accepted)pendingSales++;
  if(intent||issue||posting||doc?.status==='final')blockers.push({documentId:id,date:intent?.date??issue?.date??posting?.taxDate??doc.issueDate,status:issue?.status??(intent?'approved':'missing-issue')});
 }
 return {unpostedSales,pendingSales,blockers:blockers.sort((a,b)=>a.date.localeCompare(b.date)||a.documentId.localeCompare(b.documentId))};
}
