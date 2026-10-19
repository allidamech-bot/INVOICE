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

test('luxury identities use true dark commercial paper while Obsidian keeps its mixed-surface contract',async()=>{
const base=createBlankDocument('invoice','INV-2026-TONE',defaultCompany()).appearance;
 for(const [id,paper] of Object.entries({obsidian:'#15191c',noir:'#121212',midnight:'#071824',blackivory:'#14130f',carbon:'#1b1d20'})){
  const tokens=resolvedAppearanceTokens({...base,templateId:id,paletteMode:'auto'});
  assert.equal(tokens.page,paper,id);assert.equal(tokens.primary,'#f5f1e9',id);assert.equal(tokens.secondary,'#aeb5ba',id);
  assert.equal(tokens.surfaceInk,'#f5f1e9',id);assert.notEqual(tokens.surface,'#ffffff',id);
 }
});

test('Auto token colors match the authored premium template accents',async()=>{
const base=createBlankDocument('invoice','INV-AUTO',defaultCompany()).appearance;
 const expected={executive:'#ffbc1c',minimal:'#ffc619',trade:'#ff932b',signature:'#57774c',obsidian:'#00bfc2',cobalt:'#00a5d4',editorial:'#f2be22',split:'#f9a821',prism:'#f55378',slate:'#4e8c9b',horizon:'#ff8d22',mono:'#191b22',aurora:'#20bbb0',ledger:'#ef2549',noir:'#c29a52',midnight:'#c6a25e',blackivory:'#b99558',carbon:'#cfaa67'};
 assert.equal(Object.keys(expected).length,18);
 for(const [id,accent] of Object.entries(expected)){
  const tokens=resolvedAppearanceTokens({...base,templateId:id,paletteMode:'auto'});
  assert.equal(tokens.accent,accent,id);assert.ok(tokens.primary.startsWith('#')&&tokens.heading.startsWith('#'),id);
 }
 const css=await read('src/styles/document-premium-redesign-v141.css');
 assert.match(css,/\.section-kicker\{/);assert.match(css,/\.items-table td\{/);
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
const base=createBlankDocument('invoice','INV-ACCENT',defaultCompany()).appearance;
 const t=resolvedAppearanceTokens({...base,templateId:'executive',paletteMode:'custom',accentColor:'#315f7b',primaryTextColor:'#ffffff'});
 assert.equal(t.accent,'#315f7b');assert.equal(t.primary,'#17212b');
 const css=await read('src/styles/document-premium-redesign-v141.css');
 assert.match(css,/\.invoice-page\.palette-custom\{--template-accent:var\(--accent\)\}/);
 assert.match(css,/\.grand-total\{[^}]*background:var\(--accent\);color:var\(--accent-ink\)/);
 assert.match(css,/\.items-table th\{[^}]*background:var\(--table-head\);color:var\(--table-ink\)/);
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
const [renderer,css]=await Promise.all([read('src/templates/TemplateRenderer.tsx'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.match(renderer,/className="term-row"/);
 assert.match(css,/\.term-row b,\.bank-block b\{[^}]*color:var\(--muted\)/);
 assert.match(css,/\.term-row>span,\.bank-block>div>span\{[^}]*color:var\(--ink\)/);
});

test('custom body colors cannot overwrite authored totals, table headers or mastheads',async()=>{
const css=await read('src/styles/document-premium-redesign-v141.css');
 assert.match(css,/--ink:var\(--lrx-primary/);
 assert.match(css,/\.document-masthead\{[^}]*color:var\(--art-ink\)/);
 assert.match(css,/\.items-table th\{[^}]*background:var\(--table-head\);color:var\(--table-ink\)/);
 assert.match(css,/\.grand-total\{[^}]*background:var\(--accent\);color:var\(--accent-ink\)/);
 assert.doesNotMatch(css,/\.palette-custom \.items-table th\{color:var\(--lrx-primary\)/);
});

test('Obsidian protects light party cards, graphite body roles and signing artwork separately',async()=>{
const [css,signing]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/lib/signing-artwork.ts')]);
 assert.match(css,/\.invoice-page\.template-obsidian\{--paper:#15191c/);
 assert.match(css,/\.invoice-page\.template-obsidian \.party-block\{[^}]*background:transparent;color:var\(--ink\)/);
 assert.match(css,/\.document-tone-dark \.signature-media\{background:transparent/);
 assert.match(css,/\.invoice-page \.signature-image\{filter:none;mix-blend-mode:normal\}/);
 assert.match(signing,/outside|contour/i);
});

test('mobile design controls remain touch-safe and one-column without new app chrome',async()=>{
  const [controls,css]=await Promise.all([read('src/components/DocumentDesignControls.tsx'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/appearance-system-grid\{grid-template-columns:1fr!important/);
  assert.doesNotMatch(controls,/bottom-nav|workspace-sidebar|editor-topbar|floating/);
});
