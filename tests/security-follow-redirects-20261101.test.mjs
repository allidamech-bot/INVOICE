import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Security-only lockfile acceptance. No HTTP calls, credentials, or real data.
const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const PATCHED='1.16.2';
const INTEGRITY='sha512-/kVP2U8z596Ia0gwFrwyIeo74ta5aVmSeU1FfAUMAmcEP5EP7zydmag3SLiN64NaRKef3lxsq7i/g7ltJQDGow==';

test('the transitive follow-redirects npm lock entry is patched and matches the published package',async()=>{
  const lock=await load('package-lock.json');
  const pkg=lock.packages['node_modules/follow-redirects'];
  assert.equal(lock.lockfileVersion,3);
  assert.equal(pkg?.version,PATCHED);
  assert.equal(pkg?.resolved,'https://registry.npmjs.org/follow-redirects/-/follow-redirects-'+PATCHED+'.tgz');
  assert.equal(pkg?.integrity,INTEGRITY);
  assert.equal(pkg?.dev,true,'only the existing development transitive package is updated');
  assert.equal(lock.packages['node_modules/http-proxy']?.dependencies?.['follow-redirects'],'^1.0.0');
  assert.equal(pkg?.peerDependenciesMeta?.debug?.optional,true);
});

test('dependency manifests do not add follow-redirects as a direct production dependency',async()=>{
  const pkg=await load('package.json');
  assert.equal(pkg.dependencies?.['follow-redirects'],undefined);
  assert.equal(pkg.devDependencies?.['follow-redirects'],undefined);
  assert.equal(pkg.overrides?.['follow-redirects'],undefined);
  const lock=await load('package-lock.json');
  assert.equal(lock.packages['']?.dependencies?.['follow-redirects'],undefined);
});
