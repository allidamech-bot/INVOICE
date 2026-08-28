import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('document currency presets include the requested core currencies', async () => {
  const editor = await read('src/components/EditorPageCore.tsx');
  assert.match(editor, /const currencyPresets=\['USD','EUR','SYP','SAR','TRY','AED','GBP'\]/);
  for (const code of ['USD','EUR','SYP','SAR']) assert.ok(editor.includes(`'${code}'`), code);
});

test('service worker keeps the cached editor module across subsequent PWA releases', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /lourex-invoice-v\d+/);
  assert.match(sw, /src\/components\/EditorPageCore\.js/);
});
