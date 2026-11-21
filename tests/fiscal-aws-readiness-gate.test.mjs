import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fiscalAudit} from '../scripts/fiscal/aws-readiness-gate.mjs';

test('audit fails closed without reviewed QA files and never reports authority success',()=>{
  const r=fiscalAudit({base:'/absent-qa',releaseRoot:'/absent-release',serviceStopped:()=>true,read:()=>null,readJson:()=>null});
  assert.equal(r.decision,'HOLD');
  assert.equal(r.scope,'SIMULATION_ONLY');
  assert.equal(r.checks.qaOnlyScopes,'BLOCKED');
  assert.equal(r.checks.zatcaSimulationAcceptance,'NOT_PERFORMED');
  assert.equal(r.checks.officialSimulationCaCrlPolicy,'UNVERIFIED');
});
test('running dispatch cannot be treated as acceptable readiness',()=>{
  const r=fiscalAudit({base:'/absent-qa',releaseRoot:'/absent-release',serviceStopped:u=>!u.includes('staging.service'),read:()=>null,readJson:()=>null});
  assert.equal(r.checks.dispatchStopped,'BLOCKED');
});
test('operator output is read-only HOLD with nonzero exit',()=>{
  const script=fileURLToPath(new URL('../scripts/fiscal/aws-readiness-gate.mjs',import.meta.url));
  const p=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000});
  assert.equal(p.status,2);
  const r=JSON.parse(p.stdout);
  assert.equal(r.decision,'HOLD');
  assert.ok(!('secret' in r));
});
