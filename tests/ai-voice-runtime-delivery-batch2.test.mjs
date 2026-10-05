import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const finalizer=read('scripts/ai-voice-final-runtime-hash.mjs');
const earlyBuild=read('scripts/build.mjs');

test('final voice runtime cache identity is computed after every AI runtime owner',()=>{
  const build=String(pkg.scripts?.build||'');
  const finalConversation=build.indexOf('node scripts/ai-conversation-final-batch5.mjs');
  const finalHash=build.indexOf('node scripts/ai-voice-final-runtime-hash.mjs');
  assert.ok(finalConversation>=0&&finalHash>finalConversation,'voice cache identity must be finalized after the final conversation runtime mutation');
  assert.equal(build.trim().endsWith('node scripts/ai-voice-final-runtime-hash.mjs'),true,'no later build owner may mutate the composer after its cache identity is finalized');
});

test('finalizer rewrites both HTML and service-worker composer URLs from final bytes',()=>{
  assert.match(finalizer,/createHash\('sha256'\)\.update\(composer\)/);
  assert.match(finalizer,/dist\/ai-composer-v449\.js/);
  assert.match(finalizer,/dist\/index\.html/);
  assert.match(finalizer,/dist\/sw\.js/);
  assert.match(finalizer,/ai-composer-v449\\\.js\\\?v=/);
  assert.match(finalizer,/sw\.replace\(runtimePattern,finalUrl\)/);
  assert.match(earlyBuild,/voiceRuntimeHash=createHash\('sha256'\)/,'the historical early hash remains documented; the finalizer must supersede it after runtime owners');
});

test('production build ships the exact final composer hash and current voice owner when dist exists',()=>{
  const root=new URL('../',import.meta.url);
  const composerUrl=new URL('dist/ai-composer-v449.js',root);
  const htmlUrl=new URL('dist/index.html',root);
  const swUrl=new URL('dist/sw.js',root);
  if(!existsSync(composerUrl)||!existsSync(htmlUrl)||!existsSync(swUrl))return;
  const composer=readFileSync(composerUrl);
  const hash=createHash('sha256').update(composer).digest('hex').slice(0,16);
  const expected=`./ai-composer-v449.js?v=${hash}`;
  const source=composer.toString('utf8');
  const html=readFileSync(htmlUrl,'utf8');
  const sw=readFileSync(swUrl,'utf8');
  assert.match(source,/__LOUREX_VOICE_RUNTIME_OWNER__='ios-release-v2'/);
  assert.ok(html.includes(expected),`production HTML must reference final composer bytes as ${expected}`);
  assert.ok(sw.includes(expected),`service worker must precache final composer bytes as ${expected}`);
});
