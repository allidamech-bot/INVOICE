import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');

test('document appearance controls persist and drive the audited renderer/PDF contract',async()=>{
  const [editor,controls,renderer,vault,documents,css]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/components/DocumentDesignControls.tsx'),
    read('src/templates/TemplateRenderer.tsx'),
    read('src/storage/vault.ts'),
    read('src/lib/documents.ts'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(editor,/DocumentDesignControls appearance=\{d\.appearance\} onChange=\{this\.appearance\}/);
  assert.match(controls,/Primary Text \/ Values[\s\S]{0,280}primaryTextColor/);
  assert.match(controls,/Secondary Text \/ Labels[\s\S]{0,280}secondaryTextColor/);
  assert.match(controls,/Section Heading Color[\s\S]{0,280}headingTextColor/);
  assert.match(controls,/Document Title Size[\s\S]{0,360}documentTitleScale/);
  assert.match(controls,/Section Heading Size[\s\S]{0,360}sectionHeadingScale/);
  assert.match(controls,/Body \/ Values Size[\s\S]{0,360}bodyTextScale/);
  assert.match(controls,/Table Text Size[\s\S]{0,360}tableTextScale/);
  assert.match(renderer,/resolvedAppearanceTokens\(doc\.appearance\)/);
  assert.match(renderer,/--lrx-primary/);
  assert.match(renderer,/--lrx-secondary/);
  assert.match(renderer,/--lrx-heading/);
  assert.match(renderer,/--lrx-title-scale/);
  assert.match(renderer,/--lrx-body-size/);
  assert.match(renderer,/--lrx-table-size/);
  assert.match(vault,/primaryTextColor:hexColorValue\(appearance\.primaryTextColor\)/);
  assert.match(vault,/secondaryTextColor:hexColorValue\(appearance\.secondaryTextColor\)/);
  assert.match(vault,/headingTextColor:hexColorValue\(appearance\.headingTextColor\)/);
  assert.match(vault,/documentTitleScale:textScaleValue\(appearance\.documentTitleScale\)/);
  assert.match(vault,/sectionHeadingScale:textScaleValue\(appearance\.sectionHeadingScale\)/);
  assert.match(vault,/bodyTextScale:textScaleValue\(appearance\.bodyTextScale\)/);
  assert.match(vault,/tableTextScale:textScaleValue\(appearance\.tableTextScale\)/);
  assert.match(documents,/primaryTextColor:''[\s\S]{0,120}secondaryTextColor:''[\s\S]{0,120}textScale:'normal'/);
  assert.match(css,/\.palette-custom \.terms-block \.term-row>b\{color:var\(--lrx-secondary/);
  assert.match(css,/\.palette-custom \.terms-block \.term-row>span\{color:var\(--lrx-primary/);
  assert.match(css,/Deliberately absent: custom foreground rules/);
});

test('vault migration really preserves manual document appearance values',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {createBlankDocument}=await import('../dist/src/lib/documents.js');
  const {migrateVault}=await import('../dist/src/storage/vault.js');
  const vault=emptyVault();
  const doc=createBlankDocument('proforma','QUO-TEST',vault.company);
  Object.assign(doc.appearance,{paletteMode:'custom',accentColor:'#224466',headingTextColor:'#203040',primaryTextColor:'#112233',secondaryTextColor:'#445566',textScale:'large',documentTitleScale:'large',sectionHeadingScale:'small',bodyTextScale:'large',tableTextScale:'small'});
  vault.documents=[doc];
  const appearance=migrateVault(vault).documents[0].appearance;
  assert.equal(appearance.accentColor,'#224466');
  assert.equal(appearance.headingTextColor,'#203040');
  assert.equal(appearance.primaryTextColor,'#112233');
  assert.equal(appearance.secondaryTextColor,'#445566');
  assert.equal(appearance.textScale,'large');
  assert.equal(appearance.documentTitleScale,'large');
  assert.equal(appearance.sectionHeadingScale,'small');
  assert.equal(appearance.bodyTextScale,'large');
  assert.equal(appearance.tableTextScale,'small');
});

test('appearance resolver protects each effective surface from unsafe custom ink',async()=>{
  const {defaultCompany}=await import('../dist/src/lib/defaults.js');
  const {createBlankDocument}=await import('../dist/src/lib/documents.js');
  const {resolvedAppearanceTokens}=await import('../dist/src/lib/appearance.js');
  const base=createBlankDocument('invoice','INV-APPEARANCE-SAFE',defaultCompany()).appearance;
  const lightPapers={noir:'#fffdf8',midnight:'#fcfaf4',blackivory:'#fbf6eb',carbon:'#fafafa'};
  for(const [templateId,paper] of Object.entries(lightPapers)){
    const auto=resolvedAppearanceTokens({...base,templateId,paletteMode:'auto'});
    assert.equal(auto.page,paper);
    assert.equal(auto.primary,'#17212b');
    assert.equal(auto.secondary,'#4d5b68');
    assert.notEqual(auto.heading,'#ffffff');
  }
  const unsafe=resolvedAppearanceTokens({...base,paletteMode:'custom',primaryTextColor:'#ffffff',secondaryTextColor:'#ffffff',headingTextColor:'#ffffff'});
  assert.equal(unsafe.primary,'#17212b');
  assert.equal(unsafe.secondary,'#4d5b68');
  assert.notEqual(unsafe.heading,'#ffffff');

  const obsidian=resolvedAppearanceTokens({...base,templateId:'obsidian',paletteMode:'auto'});
  assert.equal(obsidian.page,'#15191c');
  assert.equal(obsidian.primary,'#f5f1e9');
  assert.equal(obsidian.secondary,'#aeb5ba');
  assert.equal(obsidian.heading,'#b68d4e');
  assert.equal(obsidian.surface,'#f1f2f2');
  assert.equal(obsidian.surfaceInk,'#17212b');
  const obsidianUnsafe=resolvedAppearanceTokens({...base,templateId:'obsidian',paletteMode:'custom',primaryTextColor:'#111111',secondaryTextColor:'#222222',headingTextColor:'#111111'});
  assert.equal(obsidianUnsafe.primary,'#f5f1e9');
  assert.equal(obsidianUnsafe.secondary,'#aeb5ba');
  assert.notEqual(obsidianUnsafe.heading,'#111111');
});

test('Auto owns only binary surface-safe foreground while Custom Accent stays bounded',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.palette-auto:not\(\.template-obsidian\)/);
  assert.match(css,/\.invoice-page\.palette-auto\.template-obsidian/);
  assert.match(css,/\.invoice-page\.palette-custom\{--template-accent:var\(--accent\)!important;\}/);
  assert.match(css,/\.invoice-page\.palette-custom \.page-accent\{background:var\(--accent\)!important;\}/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-custom \.totals-block[^\n]*color:var\(--lrx/);
});
