// Pure onboarding progress contract. The trusted caller must derive document
// types from SDK-validated artifacts and verify returned certificates, not UI input.
const TYPES=Object.freeze(['standard-invoice','standard-credit','standard-debit','simplified-invoice','simplified-credit','simplified-debit']);
const DIGEST=/^[a-f0-9]{64}$/;
export function requiredComplianceChecks(map){
  if(map==='1000')return TYPES.slice(0,3);
  if(map==='0100')return TYPES.slice(3);
  if(map==='1100')return [...TYPES];
  throw Error('INVALID_FUNCTIONALITY_MAP');
}
export function startOnboarding({functionalityMap,credentialRef,csrDigest}){
  requiredComplianceChecks(functionalityMap);
  if(typeof credentialRef!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(credentialRef)||typeof csrDigest!=='string'||!DIGEST.test(csrDigest))throw Error('INVALID_ONBOARDING_IDENTITY');
  return {functionalityMap,credentialRef,csrDigest,checks:[],state:'checking',version:1};
}
export function recordComplianceCheck(record,version,{type,responseDigest,artifactDigest,outcome}){
  if(record.version!==version||record.state!=='checking')throw Error('STALE_ONBOARDING');
  if(!requiredComplianceChecks(record.functionalityMap).includes(type)||record.checks.some(c=>c.type===type||c.artifactDigest===artifactDigest))throw Error('INVALID_COMPLIANCE_CHECK');
  if(!DIGEST.test(responseDigest)||!DIGEST.test(artifactDigest))throw Error('INVALID_EVIDENCE');
  if(outcome!=='verified-pass'&&outcome!=='verified-fail')throw Error('UNRESOLVED_COMPLIANCE');
  const checks=[...record.checks,{type,responseDigest,artifactDigest,outcome}];
  return {...record,checks,version:version+1,state:outcome==='verified-fail'?'restart-required':checks.length===requiredComplianceChecks(record.functionalityMap).length?'checks-complete':'checking'};
}
export function assertReadyForProductionCsid(record){
  const required=requiredComplianceChecks(record.functionalityMap);
  if(record.state!=='checks-complete'||record.checks.length!==required.length
    ||!required.every(type=>record.checks.filter(c=>c.type===type&&c.outcome==='verified-pass'&&DIGEST.test(c.responseDigest)&&DIGEST.test(c.artifactDigest)).length===1)
    ||new Set(record.checks.map(c=>c.artifactDigest)).size!==required.length)throw Error('COMPLIANCE_NOT_COMPLETE');
}
