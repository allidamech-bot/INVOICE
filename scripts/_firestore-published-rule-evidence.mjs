/**
 * Pure Firebase Security Rules evidence validation for Alif 35-B.
 * No network, authentication, local disk or Firebase mutation.
 * "Source match" is NOT a production-security acceptance decision.
 */
import {createHash} from 'node:crypto';

const sha256 = content => createHash('sha256').update(content).digest('hex');
const validTime = value => typeof value==='string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));

export function inspectPublishedRulesEvidence({project,release,ruleset,checkoutSource,capturedAtUtc}){
  if(project!=='lourex-invoice')throw new Error('Unexpected Firebase project in published Rules evidence.');
  const releaseName=`projects/${project}/releases/cloud.firestore`;
  if(release?.name!==releaseName)throw new Error('Unexpected published Firestore release identifier.');
  const rulesetName=release?.rulesetName;
  if(typeof rulesetName!=='string'||
     !new RegExp('^projects/'+project+'/rulesets/[A-Za-z0-9_-]+$').test(rulesetName))
    throw new Error('Invalid published Firestore ruleset identifier.');
  if(ruleset?.name!==rulesetName)
    throw new Error('Published release and fetched ruleset identity do not agree.');
  const files=ruleset?.source?.files;
  if(!Array.isArray(files)||files.length!==1||typeof files[0]?.content!=='string'||
     files[0].content.length>262144||typeof checkoutSource!=='string')
    throw new Error('Unexpected published Firestore rules source; cannot compare.');
  if(!validTime(capturedAtUtc))
    throw new Error('An explicit UTC collection timestamp is required.');
  const content=files[0].content;
  const publishedSourceSha256=sha256(content);
  const checkedInSourceSha256=sha256(checkoutSource);
  const releaseUpdatedAt=validTime(release.updateTime)?release.updateTime:null;
  const rulesetCreatedAt=validTime(ruleset.createTime)?ruleset.createTime:null;
  const evidence={
    schema:'LOUREX_FIRESTORE_PUBLISHED_RULE_EVIDENCE_V1',
    project,
    capturedAtUtc,
    releaseName,
    releaseUpdatedAt,
    rulesetName,
    rulesetCreatedAt,
    sourceFileName:typeof files[0].name==='string'?files[0].name:null,
    publishedSourceSha256,
    checkedInSourceSha256,
    byteExactMatch:publishedSourceSha256===checkedInSourceSha256,
    releaseMetadataComplete:Boolean(releaseUpdatedAt&&rulesetCreatedAt),
    acceptanceStatus:'PENDING_INDEPENDENT_SECURITY_REVIEW'
  };
  // Do not include source text or access tokens in machine-readable evidence.
  return {content,evidence};
}
