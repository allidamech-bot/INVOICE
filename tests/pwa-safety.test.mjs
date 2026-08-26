import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('service worker never cache-firsts arbitrary cross-origin API traffic',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/EXTERNAL_CORE_SET/);
  assert.match(sw,/url\.origin !== self\.location\.origin/);
  assert.match(sw,/if \(!EXTERNAL_CORE_SET\.has\(url\.href\)\) return/);
  assert.doesNotMatch(sw,/firebaseapis\.com|googleapis\.com|identitytoolkit/);
});

test('essential matched React runtime survives upgrades and remains optional during SW install',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/react@17\.0\.2\/umd\/react\.production\.min\.js/);
  assert.match(sw,/react-dom@17\.0\.2\/umd\/react-dom\.production\.min\.js/);
  assert.match(sw,/preserveExternalRuntime/);
  assert.match(sw,/caches\.match\(asset\)/);
  assert.match(sw,/cache\.put\(asset,existing\.clone\(\)\)/);
  assert.match(sw,/try\{[\s\S]*fetch\(asset\)[\s\S]*\}catch\{\}/);
});
