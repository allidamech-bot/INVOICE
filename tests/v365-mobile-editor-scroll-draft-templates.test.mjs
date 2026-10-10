import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const TEMPLATE_IDS=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('v365 gives mobile document editors one bounded scroll owner with action-dock clearance',async()=>{
  const [css,owner]=await Promise.all([
    read('src/styles/v365-mobile-editor-scroll-draft-templates.css'),
    read('src/styles/v337-template-layout-balance.css')
  ]);
  assert.match(owner,/v365-mobile-editor-scroll-draft-templates\.css\?v=365-1/);
  assert.match(css,/\.ta-shell\.ta-shell\.is-editor>\.ta-main,[\s\S]*?height:100dvh!important;[\s\S]*?max-height:100dvh!important;[\s\S]*?overflow-y:auto!important;/);
  assert.match(css,/height:calc\(100dvh - 64px\)!important;[\s\S]*?max-height:calc\(100dvh - 64px\)!important;/);
  assert.match(css,/\.ta-editor-workspace \.editor-scroll,[\s\S]*?\.ta-draft-studio-workspace \.draft-studio-scroll[\s\S]*?padding-bottom:calc\(116px \+ env\(safe-area-inset-bottom,0px\)\)!important;/);
  assert.match(css,/\.mobile-editor-actionbar,[\s\S]*?\.draft-mobile-actionbar[\s\S]*?position:fixed!important;/);
  assert.match(css,/bottom:calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
  assert.match(css,/draft-studio-identity>span[\s\S]*?display:inline-flex!important/);
});

test('v365 Draft uses the exact shared 18-template selector instead of a separate four-design fork',async()=>{
  const [editor,thumbs,renderer]=await Promise.all([
    read('src/components/DraftDocumentEditor.tsx'),
    read('src/templates/TemplateThumbnails.tsx'),
    read('src/components/DraftDocumentRenderer.tsx')
  ]);
  assert.match(editor,/TemplateThumbnails/);
  assert.match(editor,/<TemplateThumbnails document=\{d\} onSelect=\{this\.setTemplate\}\/>/);
  assert.match(editor,/appearance:\{\.\.\.doc\.appearance,templateId:id\}/);
  assert.doesNotMatch(editor,/DraftPdfDesign/);
  assert.doesNotMatch(editor,/DRAFT_PDF_DESIGNS/);
  for(const id of TEMPLATE_IDS)assert.match(thumbs,new RegExp(`id: '${id}'`));
  assert.match(renderer,/template-\$\{doc\.appearance\.templateId\}/);
});

test('v365 Draft persists purpose semantics and never labels a company letter as a quotation',async()=>{
  const [types,extras,editor,renderer]=await Promise.all([
    read('src/types.ts'),
    read('src/lib/document-extras.ts'),
    read('src/components/DraftDocumentEditor.tsx'),
    read('src/components/DraftDocumentRenderer.tsx')
  ]);
  assert.match(types,/preset: 'blank' \| 'formal-letter' \| 'company-letter' \| 'letter-of-intent' \| 'memo' \| 'notice'/);
  assert.match(extras,/preset==='company-letter'/);
  assert.match(extras,/preset==='letter-of-intent'/);
  assert.match(editor,/nameEn:'Company Letter'/);
  assert.match(editor,/nameEn:'Letter of Intent'/);
  assert.match(renderer,/'company-letter':\['Company Letter','خطاب شركة'\]/);
  assert.match(renderer,/'letter-of-intent':\['Letter of Intent','خطاب نوايا'\]/);
  assert.doesNotMatch(renderer,/Quotation|عرض السعر/);
});

test('v365 premium editor layer covers both commercial EditorPageCore and Draft Studio mobile controls',async()=>{
  const css=await read('src/styles/v365-mobile-editor-scroll-draft-templates.css');
  assert.match(css,/:where\(\.editor-screen,\.draft-studio\)/);
  assert.match(css,/:where\(\.editor-section,\.draft-control-section\)/);
  assert.match(css,/min-height:48px!important/);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('v365 editor presentation stays isolated from auth and PIN recovery surfaces',async()=>{
  const css=await read('src/styles/v365-mobile-editor-scroll-draft-templates.css');
  assert.doesNotMatch(css,/\.ta-auth(?:-|\b)|\.unlock-screen\b|\.pin-recovery\b|\.pin-migration\b/);
});
