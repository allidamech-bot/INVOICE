import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {migrateVault} from '../dist/src/storage/vault.js';
import {resolvedAppearanceTokens} from '../dist/src/lib/appearance.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('document appearance fields are backward-compatible and persisted on the document',async()=>{
  const augmentation=await read('src/document-appearance-augmentation.d.ts');
  for(const field of ['headingTextColor','primaryTextColor','secondaryTextColor','documentTitleScale','sectionHeadingScale','bodyTextScale','tableTextScale'])assert.match(augmentation,new RegExp(`${field}\\?`));
  assert.match(augmentation,/'small' \| 'normal' \| 'large'/);
});

test('section 06 keeps the complete design workflow in its existing location',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  const designAt=editor.indexOf('<span>06</span><h2>{t(\'Design\'');
  const attachmentAt=editor.indexOf('<DocumentAttachmentsSection');
  assert.ok(designAt>=0,'section 06 Design must exist');
  assert.ok(attachmentAt>designAt,'document attachments must remain after the Design section');
  const design=editor.slice(designAt,attachmentAt);
  assert.match(design,/TemplateThumbnails/);
  assert.match(design,/DocumentDesignControls appearance=\{d\.appearance\}/);
  assert.match(design,/watermark-editor-card/);
  assert.match(design,/showBank/);
  assert.match(design,/showSignature/);
  assert.match(design,/showStamp/);
  assert.match(design,/showHsCode/);
  assert.match(design,/showOrigin/);
  assert.match(design,/showPacking/);
  assert.match(design,/Refresh Company Details/);
});

test('custom palette exposes precise bounded roles while Auto uses binary surface contrast',async()=>{
  const controls=await read('src/components/DocumentDesignControls.tsx');
  assert.match(controls,/value="auto"/);
  assert.match(controls,/value="custom"/);
  assert.match(controls,/Accent \/ Highlight/);
  assert.match(controls,/Section Heading Color/);
  assert.match(controls,/Primary Text \/ Values/);
  assert.match(controls,/Secondary Text \/ Labels/);
  assert.match(controls,/Automatic contrast/);
  assert.match(controls,/Readability guard is always on/);
  assert.match(controls,/does not recolor dark mastheads or totals text/);
});

test('typography exposes fonts and bounded hierarchy controls',async()=>{
  const controls=await read('src/components/DocumentDesignControls.tsx');
  assert.match(controls,/LATIN_FONT_OPTIONS/);
  assert.match(controls,/ARABIC_FONT_OPTIONS/);
  assert.match(controls,/Document Title Size/);
  assert.match(controls,/Section Heading Size/);
  assert.match(controls,/Body \/ Values Size/);
  assert.match(controls,/Table Text Size/);
  assert.match(controls,/Small/);
  assert.match(controls,/Normal/);
  assert.match(controls,/Large/);
});

test('vault migration preserves every custom document design choice across reload and restore',()=>{
  const vault=emptyVault();
  const doc=createBlankDocument('invoice','INV-2026-DESIGN',defaultCompany());
  doc.appearance={...doc.appearance,paletteMode:'custom',accentColor:'#345678',headingTextColor:'#234567',primaryTextColor:'#17212b',secondaryTextColor:'#4d5b68',textScale:'large',documentTitleScale:'large',sectionHeadingScale:'small',bodyTextScale:'large',tableTextScale:'small'};
  vault.documents=[doc];
  const appearance=migrateVault(vault).documents[0].appearance;
  assert.equal(appearance.paletteMode,'custom');
  assert.equal(appearance.accentColor,'#345678');
  assert.equal(appearance.headingTextColor,'#234567');
  assert.equal(appearance.primaryTextColor,'#17212b');
  assert.equal(appearance.secondaryTextColor,'#4d5b68');
  assert.equal(appearance.textScale,'large');
  assert.equal(appearance.documentTitleScale,'large');
  assert.equal(appearance.sectionHeadingScale,'small');
  assert.equal(appearance.bodyTextScale,'large');
  assert.equal(appearance.tableTextScale,'small');
});

test('vault migration rejects malformed design colors and free-form text sizes',()=>{
  const vault=emptyVault();
  const doc=createBlankDocument('invoice','INV-2026-DESIGN-SAFE',defaultCompany());
  Object.assign(doc.appearance,{paletteMode:'custom',accentColor:'red',headingTextColor:'javascript:bad',primaryTextColor:'#fff',secondaryTextColor:'#12345g',documentTitleScale:'huge',sectionHeadingScale:'22px',bodyTextScale:'tiny',tableTextScale:'999'});
  vault.documents=[doc];
  const appearance=migrateVault(vault).documents[0].appearance;
  assert.equal(appearance.accentColor,'#b58b4f');
  assert.equal(appearance.headingTextColor,'');
  assert.equal(appearance.primaryTextColor,'');
  assert.equal(appearance.secondaryTextColor,'');
  assert.equal(appearance.documentTitleScale,undefined);
  assert.equal(appearance.sectionHeadingScale,undefined);
  assert.equal(appearance.bodyTextScale,undefined);
  assert.equal(appearance.tableTextScale,undefined);
});

test('luxury identities use true dark commercial paper while Obsidian keeps its mixed-surface contract',()=>{
  const base=createBlankDocument('invoice','INV-2026-TONE',defaultCompany()).appearance;
  const lightPapers={noir:'#121212',midnight:'#071824',blackivory:'#14130f',carbon:'#1b1d20'};
  for(const [templateId,paper] of Object.entries(lightPapers)){
    const tokens=resolvedAppearanceTokens({...base,templateId,paletteMode:'auto'});
    assert.equal(tokens.page,paper,`${templateId} effective paper`);
    assert.equal(tokens.primary,'#17212b',`${templateId} Auto body copy must use the safe primary ink`);
    assert.equal(tokens.secondary,'#4d5b68',`${templateId} Auto labels must keep a softer semantic ink`);
    assert.notEqual(tokens.heading,'#ffffff',`${templateId} Auto heading must not become inverse ink on a light sheet`);
  }
  const obsidian=resolvedAppearanceTokens({...base,templateId:'obsidian',paletteMode:'auto'});
  assert.equal(obsidian.page,'#15191c');
  assert.equal(obsidian.primary,'#f5f1e9');
  assert.equal(obsidian.secondary,'#aeb5ba');
  assert.equal(obsidian.heading,'#b68d4e');
  assert.equal(obsidian.surface,'#f1f2f2');
  assert.equal(obsidian.surfaceInk,'#17212b');
});

test('Auto token colors match the authored premium template accents',async()=>{
  const base=createBlankDocument('invoice','INV-2026-AUTO',defaultCompany()).appearance;
  const expected={executive:'#bd9659',minimal:'#242b30',trade:'#ad8747',signature:'#aa8143',obsidian:'#b68d4e',cobalt:'#246ea8',editorial:'#1e2529',split:'#527382',prism:'#4f7d78',slate:'#566874',horizon:'#235269',mono:'#111111',aurora:'#477b74',ledger:'#314e5d',noir:'#b58a46',midnight:'#c19b59',blackivory:'#26231f',carbon:'#a98148'};
  for(const [templateId,accent] of Object.entries(expected))assert.equal(resolvedAppearanceTokens({...base,templateId,paletteMode:'auto'}).accent,accent,templateId);
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.palette-auto:not\(\.template-obsidian\)/,'Auto must explicitly protect light document surfaces');
  assert.match(css,/\.invoice-page\.palette-auto\.template-obsidian/,'Auto must explicitly protect the dark Obsidian body');
  assert.match(css,/Auto foreground is semantic and surface-aware/);
});

test('custom text colors are contrast guarded while safe choices remain user controlled',()=>{
  const base=createBlankDocument('invoice','INV-2026-CONTRAST',defaultCompany()).appearance;
  const unsafe=resolvedAppearanceTokens({...base,paletteMode:'custom',primaryTextColor:'#ffffff',secondaryTextColor:'#ffffff',headingTextColor:'#ffffff'});
  assert.equal(unsafe.primary,'#17212b');
  assert.equal(unsafe.secondary,'#4d5b68');
  assert.notEqual(unsafe.heading,'#ffffff');
  const safe=resolvedAppearanceTokens({...base,paletteMode:'custom',primaryTextColor:'#111111',secondaryTextColor:'#333333',headingTextColor:'#222222'});
  assert.equal(safe.primary,'#111111');
  assert.equal(safe.secondary,'#333333');
  assert.equal(safe.heading,'#222222');
  const obsidianUnsafe=resolvedAppearanceTokens({...base,templateId:'obsidian',paletteMode:'custom',primaryTextColor:'#111111',secondaryTextColor:'#222222'});
  assert.equal(obsidianUnsafe.primary,'#f5f1e9');
  assert.equal(obsidianUnsafe.secondary,'#aeb5ba');
});

test('custom Accent actually drives bounded structural accents without owning foreground readability',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.palette-custom\{--template-accent:var\(--accent\)!important;\}/);
  assert.match(css,/\.invoice-page\.palette-custom \.page-accent\{background:var\(--accent\)!important;\}/);
  assert.match(css,/\.invoice-page\.palette-custom \.party-customer\{border-color:var\(--accent\)!important;\}/);
  assert.match(css,/\.invoice-page\.palette-custom \.grand-total\{border-top-color:var\(--accent\)!important;\}/);
});

test('preview and all output modes consume one renderer token source',async()=>{
  const [editor,renderer,appearance,app]=await Promise.all([read('src/components/EditorPageCore.tsx'),read('src/templates/TemplateRenderer.tsx'),read('src/lib/appearance.ts'),read('src/app/App.tsx')]);
  assert.match(editor,/TemplateRenderer document=\{this\.state\.previewDoc\}/);
  assert.match(editor,/TemplateRenderer document=\{previewDocument\(d\)\}/);
  assert.match(editor,/onPrint\(this\.state\.doc,mode\)/);
  assert.match(app,/<TemplateRenderer document=\{this\.state\.printDoc\} scale=\{1\}/);
  assert.match(renderer,/resolvedAppearanceTokens\(doc\.appearance\)/);
  for(const token of ['--lrx-primary','--lrx-secondary','--lrx-heading','--lrx-title-scale','--lrx-heading-size','--lrx-body-size','--lrx-table-size'])assert.match(renderer,new RegExp(token));
  assert.match(appearance,/safeTextColor/);
});

test('the reported terms regression is covered at the actual current markup selectors',async()=>{
  const [renderer,css]=await Promise.all([read('src/templates/TemplateRenderer.tsx'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(renderer,/className="term-row"/);
  assert.match(renderer,/<b>\{localized\(doc,row\[0\],row\[1\]\)\}<\/b><span dir="auto">\{row\[2\]\}<\/span>/);
  assert.match(css,/\.palette-custom \.terms-block \.term-row>b\{color:var\(--lrx-secondary/);
  assert.match(css,/\.palette-custom \.terms-block \.term-row>span\{color:var\(--lrx-primary/);
});

test('custom body colors cannot overwrite authored totals, table headers or mastheads',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  const primaryRule=css.match(/\.invoice-page\.palette-custom :is\(([^)]*terms-block \.term-row>span[^)]*)\)\{color:var\(--lrx-primary/);
  assert.ok(primaryRule,'semantic custom-body rule must exist');
  assert.doesNotMatch(primaryRule[1],/totals-block/);
  assert.doesNotMatch(primaryRule[1],/items-table thead/);
  assert.doesNotMatch(primaryRule[1],/header-modern|header-executive|header-trade|header-signature/);
  assert.match(css,/Deliberately absent: custom foreground rules/);
});

test('Obsidian protects light party cards, graphite body roles and signing artwork separately',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/template-obsidian \.party-block\{color:var\(--lrx-surface-ink/);
  assert.match(css,/template-obsidian :is\(\.items-table tbody td[\s\S]*terms-block \.term-row>span[\s\S]*bank-block>div>span\)\{color:var\(--lrx-primary/);
  assert.match(css,/template-obsidian :is\(\.terms-block \.term-row>b,\.bank-block>div>b,\.doc-footer\)\{color:var\(--lrx-secondary/);
  assert.match(css,/template-obsidian \.signature-media\{background:#fff!important/);
  assert.match(css,/template-obsidian \.signature-image\{filter:none!important;mix-blend-mode:normal!important;\}/);
});

test('mobile design controls remain touch-safe and one-column without new app chrome',async()=>{
  const [controls,css]=await Promise.all([read('src/components/DocumentDesignControls.tsx'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/appearance-system-grid\{grid-template-columns:1fr!important/);
  assert.doesNotMatch(controls,/bottom-nav|workspace-sidebar|editor-topbar|floating/);
});
