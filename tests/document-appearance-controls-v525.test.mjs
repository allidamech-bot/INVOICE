import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');

test('document appearance controls persist and drive the renderer/PDF contract',async()=>{
  const [editor,renderer,vault,documents,css]=await Promise.all([read('src/components/EditorPageCore.tsx'),read('src/templates/TemplateRenderer.tsx'),read('src/storage/vault.ts'),read('src/lib/documents.ts'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(editor,/Primary Text[\s\S]{0,260}primaryTextColor/);
  assert.match(editor,/Secondary Text[\s\S]{0,260}secondaryTextColor/);
  assert.match(editor,/Text Size[\s\S]{0,300}textScale/);
  assert.match(renderer,/resolvedAppearanceTokens\(doc\.appearance\)/);
  assert.match(renderer,/--doc-primary-text/);
  assert.match(renderer,/--doc-secondary-text/);
  assert.match(renderer,/--doc-text-scale/);
  assert.match(vault,/primaryTextColor:hexColorValue\(appearance\.primaryTextColor\)/);
  assert.match(vault,/secondaryTextColor:hexColorValue\(appearance\.secondaryTextColor\)/);
  assert.match(vault,/textScale:textScaleValue\(appearance\.textScale\)/);
  assert.match(documents,/primaryTextColor:''[\s\S]{0,120}secondaryTextColor:''[\s\S]{0,120}textScale:'normal'/);
  assert.match(css,/var\(--doc-primary-text,var\(--lrx-light-ink\)\)/);
  assert.match(css,/var\(--doc-primary-text,var\(--lrx-dark-ink\)\)/);
  assert.match(css,/var\(--doc-secondary-text,var\(--lrx-light-muted\)\)/);
  assert.match(css,/var\(--doc-text-scale,1\)/);
  assert.match(css,/\.invoice-page \.party-block\{color:var\(--lrx-light-ink\)!important;\}/,'light party cards stay surface-safe even when a dark template uses custom body text');
});

test('vault migration really preserves manual document appearance values',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {createBlankDocument}=await import('../dist/src/lib/documents.js');
  const {migrateVault}=await import('../dist/src/storage/vault.js');
  const vault=emptyVault();
  const doc=createBlankDocument('proforma','QUO-TEST',vault.company);
  doc.appearance.paletteMode='custom';doc.appearance.primaryTextColor='#112233';doc.appearance.secondaryTextColor='#445566';doc.appearance.textScale='large';
  vault.documents=[doc];
  const migrated=migrateVault(vault);
  assert.equal(migrated.documents[0].appearance.primaryTextColor,'#112233');
  assert.equal(migrated.documents[0].appearance.secondaryTextColor,'#445566');
  assert.equal(migrated.documents[0].appearance.textScale,'large');
});
