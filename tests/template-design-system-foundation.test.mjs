import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('template appearance foundation exposes surface-aware tokens',async()=>{
  const source=await read('src/lib/appearance.ts');
  assert.match(source,/TemplateAppearanceTokens/);
  assert.match(source,/resolvedAppearanceTokens/);
  assert.match(source,/DARK_BODY_TEMPLATES/);
  assert.match(source,/tableHeaderText/);
  assert.match(source,/totalsSurface/);
});

test('template appearance custom text controls remain optional for legacy documents',async()=>{
  const source=await read('src/document-appearance-augmentation.d.ts');
  assert.match(source,/primaryTextColor\?: string/);
  assert.match(source,/secondaryTextColor\?: string/);
  assert.match(source,/textScale\?: 'small' \| 'normal' \| 'large'/);
});
