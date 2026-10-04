import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJsonUrl = new URL('../package.json', import.meta.url);

test('production runtime stays pinned to Node 20.x', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));

  assert.equal(
    packageJson.engines?.node,
    '20.x',
    'LOUREX production builds must stay on Node 20.x so Vercel cannot silently advance to an incompatible major runtime.',
  );
});
