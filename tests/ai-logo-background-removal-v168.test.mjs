import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('logo background removal uses secure same-origin AI endpoint without exposing provider secret',async()=>{
  const [rebuild,endpoint,settings]=await Promise.all([
    readFile('src/lib/logo-rebuild.ts','utf8'),
    readFile('api/remove-background.js','utf8'),
    readFile('src/components/SettingsModal.tsx','utf8')
  ]);

  assert.match(settings,/rebuildLogoWithoutBackgroundDataUrl\(source\)/);
  assert.match(rebuild,/fetch\('\/api\/remove-background'/);
  assert.match(rebuild,/'Content-Type':blob\.type/);
  assert.match(rebuild,/AbortController/);
  assert.match(rebuild,/cache:'no-store'/);
  assert.match(rebuild,/AI background removal is not configured yet/);
  assert.match(rebuild,/removeLogoBackgroundWithAi\(src\)/);
  assert.doesNotMatch(rebuild,/process\.env\.REMOVE_BG_API_KEY/);

  assert.match(endpoint,/process\.env\.REMOVE_BG_API_KEY/);
  assert.match(endpoint,/https:\/\/api\.remove\.bg\/v1\.0\/removebg/);
  assert.match(endpoint,/MAX_IMAGE_BYTES=4\*1024\*1024/);
  assert.match(endpoint,/ALLOWED_TYPES=new Set\(\['image\/png','image\/jpeg','image\/webp'\]\)/);
  assert.match(endpoint,/sameOriginRequest/);
  assert.match(endpoint,/Cache-Control','no-store/);
  assert.match(endpoint,/X-Api-Key':apiKey/);
  assert.match(endpoint,/AbortController/);
  assert.match(endpoint,/AI_QUOTA_EXHAUSTED/);
  assert.match(endpoint,/AI_RATE_LIMITED/);
});
