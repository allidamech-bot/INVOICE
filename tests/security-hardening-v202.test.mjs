import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const activeCacheVersion=sw=>{
  const matches=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  return matches.length?Number(matches.at(-1)[1]):0;
};

test('v202 fresh workspaces lock automatically while explicit legacy choices remain representable',async()=>{
  const defaults=await read('src/lib/defaults.ts');
  const types=await read('src/types.ts');
  assert.match(defaults,/autoLockMinutes:\s*15/);
  assert.match(types,/AutoLockMinutes = 0 \| 5 \| 15 \| 30/);
});

test('v202 account creation enforces the shared stronger password policy',async()=>{
  const policy=await import('../dist/src/lib/account-security.js');
  assert.equal(policy.MIN_ACCOUNT_PASSWORD_LENGTH,12);
  assert.equal(policy.accountPasswordAcceptable('short-pass'),false);
  assert.equal(policy.accountPasswordAcceptable('aaaaaaaaaaaa'),false);
  assert.equal(policy.accountPasswordAcceptable('correct horse battery staple'),true);
  const [entry,modal]=await Promise.all([read('src/components/AccountEntryScreen.tsx'),read('src/components/CloudAccountModal.tsx')]);
  assert.match(entry,/accountPasswordIssue/);
  assert.match(modal,/accountPasswordIssue/);
  assert.match(entry,/If an account exists for this email/);
});

test('v202 sign-out removes the persisted usable vault key from the device',async()=>{
  const session=await read('src/storage/session.ts');
  const suspend=session.slice(session.indexOf('export async function suspendSession'),session.indexOf('// Destructive session clearing'));
  assert.match(suspend,/removeMarker\(\)/);
  assert.match(suspend,/deleteRecord\('session-key'\)/);
});

test('v202 AI proxy rejects blind requests and validates request and response payloads',async()=>{
  const api=await read('api/remove-background.js');
  assert.match(api,/if\(!origin\|\|requestedWith!=='LOUREX-Invoice'\)return false/);
  assert.match(api,/parsed\.protocol==='https:'/);
  assert.match(api,/RATE_WINDOW_MS=5\*60\*1000/);
  assert.match(api,/RATE_MAX=12/);
  assert.match(api,/validImageSignature\(image,contentType\)/);
  assert.match(api,/validImageSignature\(output,'image\/png'\)/);
  assert.match(api,/process\.env\.REMOVE_BG_API_KEY/);
});

test('v202 production hardening keeps scripts self-only and extends transport/cross-origin protections',async()=>{
  const config=await read('vercel.json');
  assert.match(config,/script-src 'self';/);
  assert.doesNotMatch(config,/script-src [^;]*'unsafe-inline'/);
  assert.match(config,/Cross-Origin-Opener-Policy/);
  assert.match(config,/Cross-Origin-Resource-Policy/);
  assert.match(config,/X-Permitted-Cross-Domain-Policies/);
  assert.match(config,/max-age=63072000; includeSubDomains/);
});

test('v202 publishes a fresh immutable PWA generation and precaches account security runtime',async()=>{
  const sw=await read('public/sw.js');
  assert.equal(activeCacheVersion(sw),202);
  assert.match(sw,/lourex-invoice-v201: preserved as a legacy marker/);
  assert.match(sw,/src\/lib\/account-security\.js/);
});

test('v202 CI blocks high severity dependency findings and runs the LOUREX security gate',async()=>{
  const ci=await read('.github/workflows/ci.yml');
  assert.match(ci,/npm audit --audit-level=high/);
  assert.match(ci,/node scripts\/security-check\.mjs/);
});
