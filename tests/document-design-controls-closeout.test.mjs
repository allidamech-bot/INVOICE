import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('document appearance fields are backward-compatible and persisted on the document',async()=>{
  const augmentation=await read('src/document-appearance-augmentation.d.ts');
  for(const field of ['headingTextColor','primaryTextColor','secondaryTextColor','documentTitleScale','sectionHeadingScale','bodyTextScale','tableTextScale']){
    assert.match(augmentation,new RegExp(`${field}\\?`));
  }
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

test('custom palette exposes the agreed colors while Auto stays simple',async()=>{
  const controls=await read('src/components/DocumentDesignControls.tsx');
  assert.match(controls,/value="auto"/);
  assert.match(controls,/value="custom"/);
  assert.match(controls,/Accent Color/);
  assert.match(controls,/Heading Color/);
  assert.match(controls,/Primary Text/);
  assert.match(controls,/Secondary Text \/ Labels/);
  assert.match(controls,/Auto protection/);
  assert.match(controls,/Readability guard is always on/);
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

test('preview and all output modes consume one renderer token source',async()=>{
  const [editor,renderer,appearance]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/templates/TemplateRenderer.tsx'),
    read('src/lib/appearance.ts')
  ]);
  assert.match(editor,/TemplateRenderer document=\{this\.state\.previewDoc\}/);
  assert.match(editor,/TemplateRenderer document=\{previewDocument\(d\)\}/);
  assert.match(editor,/onPrint\(this\.state\.doc,mode\)/);
  assert.match(renderer,/resolvedAppearanceTokens\(doc\.appearance\)/);
  for(const token of ['--lrx-primary','--lrx-secondary','--lrx-heading','--lrx-title-scale','--lrx-heading-size','--lrx-body-size','--lrx-table-size'])assert.match(renderer,new RegExp(token));
  assert.match(appearance,/safeTextColor/);
});

test('the reported dark-template terms regression is covered at the actual markup selectors',async()=>{
  const [renderer,css]=await Promise.all([
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(renderer,/className="term-row"/);
  assert.match(renderer,/<b>\{localized\(doc,row\[0\],row\[1\]\)\}<\/b><span dir="auto">\{row\[2\]\}<\/span>/);
  assert.match(css,/\.terms-block \.term-row>b\{color:var\(--lrx-secondary/);
  assert.match(css,/\.terms-block \.term-row>span\{color:var\(--lrx-primary/);
});

test('mobile design controls remain touch-safe and one-column without new app chrome',async()=>{
  const [controls,css]=await Promise.all([
    read('src/components/DocumentDesignControls.tsx'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/appearance-system-grid\{grid-template-columns:1fr!important/);
  assert.doesNotMatch(controls,/bottom-nav|workspace-sidebar|editor-topbar|floating/);
});
