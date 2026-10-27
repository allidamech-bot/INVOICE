import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPublishedRulesEvidence} from '../scripts/_firestore-published-rule-evidence.mjs';

const project='lourex-invoice';
const releaseName='projects/'+project+'/releases/cloud.firestore';
const rulesetName='projects/'+project+'/rulesets/synthetic-qa-123';
const rules='rules_version = "2";\nservice cloud.firestore { match /databases/{database}/documents { match /users/{userId} { allow read: if request.auth.uid == userId; } } }\n';
function fixture(overrides={}){
  return{
    project,
    release:{name:releaseName,rulesetName,updateTime:'2026-10-26T18:34:00Z'},
    ruleset:{name:rulesetName,createTime:'2026-10-26T18:33:59.123Z',source:{files:[{name:'firestore.rules',content:rules}]}},
    checkoutSource:rules,
    capturedAtUtc:'2026-10-27T10:00:00.000Z',
    ...overrides
  };
}

test('a published release produces immutable provenance fingerprints but never a GO decision',()=>{
  const {content,evidence}=inspectPublishedRulesEvidence(fixture());
  assert.equal(content,rules);
  assert.equal(evidence.releaseName,releaseName);
  assert.equal(evidence.rulesetName,rulesetName);
  assert.equal(evidence.releaseUpdatedAt,'2026-10-26T18:34:00Z');
  assert.equal(evidence.rulesetCreatedAt,'2026-10-26T18:33:59.123Z');
  assert.equal(evidence.sourceFileName,'firestore.rules');
  assert.equal(evidence.byteExactMatch,true);
  assert.equal(evidence.releaseMetadataComplete,true);
  assert.match(evidence.publishedSourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(evidence.publishedSourceSha256,evidence.checkedInSourceSha256);
  assert.equal(evidence.acceptanceStatus,'PENDING_INDEPENDENT_SECURITY_REVIEW');
  assert.doesNotMatch(JSON.stringify(evidence),/allow read|Authorization|Bearer|token/i);
});

test('byte-different live Rules always require review, not a success verdict',()=>{
  const input=fixture({checkoutSource:rules+'\n'});
  const {evidence}=inspectPublishedRulesEvidence(input);
  assert.equal(evidence.byteExactMatch,false);
  assert.notEqual(evidence.publishedSourceSha256,evidence.checkedInSourceSha256);
  assert.equal(evidence.acceptanceStatus,'PENDING_INDEPENDENT_SECURITY_REVIEW');
});

test('missing release timestamps mark provenance incomplete even when rules text agrees',()=>{
  const input=fixture({release:{name:releaseName,rulesetName},
    ruleset:{name:rulesetName,source:{files:[{name:'firestore.rules',content:rules}]}}});
  const {evidence}=inspectPublishedRulesEvidence(input);
  assert.equal(evidence.byteExactMatch,true);
  assert.equal(evidence.releaseMetadataComplete,false);
  assert.equal(evidence.releaseUpdatedAt,null);
  assert.equal(evidence.rulesetCreatedAt,null);
  assert.equal(evidence.acceptanceStatus,'PENDING_INDEPENDENT_SECURITY_REVIEW');
});

test('cross-project, mismatched and suspicious Rules release identities fail closed',()=>{
  const valid=fixture();
  const invalid=[
    {...valid,project:'other-project'},
    {...valid,release:{...valid.release,name:'projects/other-project/releases/cloud.firestore'}},
    {...valid,release:{...valid.release,rulesetName:'https://evil.test/ruleset'}},
    {...valid,release:{...valid.release,rulesetName:'projects/other-project/rulesets/other'}},
    {...valid,ruleset:{...valid.ruleset,name:'projects/lourex-invoice/rulesets/different'}},
    {...valid,capturedAtUtc:'invalid-date'},
  ];
  for(const input of invalid)
    assert.throws(()=>inspectPublishedRulesEvidence(input),/project|release|ruleset|timestamp/i);
});

test('multi-file, malformed and oversized source cannot pass source parity',()=>{
  const valid=fixture();
  const files=valid.ruleset.source.files;
  for(const sourceFiles of [[],[...files,...files],[{name:'firestore.rules',content:12}],
    [{name:'firestore.rules',content:'a'.repeat(262145)}]]){
    assert.throws(()=>inspectPublishedRulesEvidence({...valid,
      ruleset:{...valid.ruleset,source:{files:sourceFiles}}}),/source/i);
  }
});
