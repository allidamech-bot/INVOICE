/**
 * Alif 39/40 — private, offline EVIDENCE-COMPLETENESS check.
 * It does not authenticate evidence, test production, authorize deployment,
 * sign off accounts, or output an automatic "GO" decision.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const HASH=/^[a-f0-9]{64}$/i;
const COMMIT=/^[a-f0-9]{40}$/i;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const GATES=['financeCycle','twoDevice','publishedRules','crossUid','physicalIphone','authorityRecovery','costPolicy'];
const str=value=>typeof value==='string'&&value.trim().length>2&&!/^(todo|pending|unknown|n\/a|tbd)$/i.test(value.trim());
const time=value=>str(value)&&ISO.test(value)&&Number.isFinite(Date.parse(value));
const err=(a,path,ok)=>{if(!ok)a.push(path);};
function evidenceRow(missing,rows,name){
 const row=rows?.[name];
 err(missing,'gates.'+name+'.result',row?.result==='passed');
 err(missing,'gates.'+name+'.proofSha256',HASH.test(row?.proofSha256||''));
 err(missing,'gates.'+name+'.reviewer',str(row?.reviewer));
 err(missing,'gates.'+name+'.reviewedAt',time(row?.reviewedAt));
 return row||{};
}
export function validateFinanceAcceptanceEvidence(input){
 const missing=[];
 err(missing,'schema',input?.schema==='LOUREX_ALIF_FINANCE_EVIDENCE_V1');
 err(missing,'checkpointUtc',time(input?.checkpointUtc));
 const release=input?.release||{};
 err(missing,'release.githubMainSha',COMMIT.test(release.githubMainSha||''));
 err(missing,'release.productionSha',COMMIT.test(release.productionSha||''));
 err(missing,'release.shaEquality',COMMIT.test(release.githubMainSha||'')
   &&release.githubMainSha===release.productionSha);
 err(missing,'release.productionState',release.productionState==='READY');
 const rows=input?.gates||{};
 for(const name of GATES)evidenceRow(missing,rows,name);
 const rules=rows.publishedRules||{};
 err(missing,'gates.publishedRules.project',rules.project==='lourex-invoice');
 err(missing,'gates.publishedRules.releaseName',
   rules.releaseName==='projects/lourex-invoice/releases/cloud.firestore');
 err(missing,'gates.publishedRules.rulesetName',
   /^projects\/lourex-invoice\/rulesets\/[A-Za-z0-9_-]+$/.test(rules.rulesetName||''));
 err(missing,'gates.publishedRules.publishedSha256',HASH.test(rules.publishedSha256||''));
 err(missing,'gates.publishedRules.repositorySha256',HASH.test(rules.repositorySha256||''));
 err(missing,'gates.publishedRules.sourceMatches',
   HASH.test(rules.publishedSha256||'')&&rules.publishedSha256===rules.repositorySha256);
 err(missing,'gates.publishedRules.publishedAt',time(rules.publishedAt));
 const isolate=rows.crossUid||{};
 for(const field of ['twoAuthenticatedQaUsers','ownerReadAndWrite','crossUidReadDenied','crossUidWriteDenied'])
   err(missing,'gates.crossUid.'+field,isolate[field]===true);
 const finance=rows.financeCycle||{};
 for(const field of ['purchase200Stock200','finalInvoice20Stock180','noSecondStockIssue','arPaid50Outstanding150','apPaid30Outstanding1170','bankOpening100Closing120'])
   err(missing,'gates.financeCycle.'+field,finance[field]===true);
 const sync=rows.twoDevice||{};
 for(const field of ['independentSessions','noDuplicateBankAllocation','staleEditRejected','finalBalancesMatch'])
   err(missing,'gates.twoDevice.'+field,sync[field]===true);
 const iphone=rows.physicalIphone||{};
 for(const field of ['realSafariDevice','sameSavedAndPreviewPdf','rtlMultiPagePdf','shareSheetOrPrint','keyboardPwa'])
   err(missing,'gates.physicalIphone.'+field,iphone[field]===true);
 const dr=rows.authorityRecovery||{};
 for(const field of ['operatorApproved','restoredServerAuthority','reportHashesVerified'])
   err(missing,'gates.authorityRecovery.'+field,dr[field]===true);
 for(const field of ['approvedRpoMinutes','approvedRtoMinutes'])
   err(missing,'gates.authorityRecovery.'+field,Number.isInteger(dr[field])&&dr[field]>=0);
 const policy=rows.costPolicy||{};
 // The approved default for interchangeable inventory is perpetual moving WAC.
 // Non-interchangeable items require separately reviewed specific-cost evidence.
 err(missing,'gates.costPolicy.method',
   policy.method==='PERPETUAL_WEIGHTED_AVERAGE');
 err(missing,'gates.costPolicy.returnsAndFxApproved',policy.returnsAndFxApproved===true);
 err(missing,'gates.costPolicy.policyVersion',str(policy.policyVersion));
 const signoff=input?.signoff||{};
 for(const field of ['finance','security','release']){
   err(missing,'signoff.'+field+'.reviewer',str(signoff[field]?.reviewer));
   err(missing,'signoff.'+field+'.reviewedAt',time(signoff[field]?.reviewedAt));
 }
 const proofs=GATES.map(key=>rows[key]?.proofSha256).filter(value=>HASH.test(value||''));
 err(missing,'gates.distinctProofHashes',proofs.length===GATES.length&&new Set(proofs).size===GATES.length);
 return{
  schema:'LOUREX_ALIF_FINANCE_EVIDENCE_CHECK_V1',
  status:missing.length?'NO_GO_EVIDENCE_INCOMPLETE':'READY_FOR_INDEPENDENT_HUMAN_REVIEW_ONLY',
  missing,
  checkedGateCount:GATES.length,
  note:'No live verification, rules publication, production deployment or final GO decision was performed.'
 };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
   if(process.argv.length!==3)throw Error('Usage: node scripts/finance-alif-acceptance-evidence.mjs /private/path/evidence.json');
   const file=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
   // Print only missing field paths, never raw private evidence, account IDs or source.
   const result=validateFinanceAcceptanceEvidence(file);
   console.log(JSON.stringify(result,null,2));
   if(result.status!=='READY_FOR_INDEPENDENT_HUMAN_REVIEW_ONLY')process.exitCode=2;
 }catch{
   console.error('NO_GO_EVIDENCE_INCOMPLETE: cannot read valid private evidence JSON.');
   process.exitCode=2;
 }
}
