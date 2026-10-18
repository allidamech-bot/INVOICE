import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('design customization stays in section 06 and exposes the agreed bounded controls',async()=>{
  const [editor,controls]=await Promise.all([read('src/components/EditorPageCore.tsx'),read('src/components/DocumentDesignControls.tsx')]);
  assert.match(editor,/section-heading[\s\S]{0,120}06[\s\S]{0,120}Design/);
  assert.match(editor,/DocumentDesignControls appearance=\{d\.appearance\} onChange=\{this\.appearance\}/);
  assert.match(controls,/Auto — matched to template/);
  assert.match(controls,/Accent \/ Highlight/);
  assert.match(controls,/Section Heading Color/);
  assert.match(controls,/Primary Text \/ Values/);
  assert.match(controls,/Secondary Text \/ Labels/);
  assert.match(controls,/English Font/);
  assert.match(controls,/Arabic Font/);
  assert.match(controls,/Document Title Size/);
  assert.match(controls,/Section Heading Size/);
  assert.match(controls,/Body \/ Values Size/);
  assert.match(controls,/Table Text Size/);
});

test('design controls are mobile-safe and do not add navigation or header UI',async()=>{
  const [css,controls]=await Promise.all([read('src/styles/template-surface-contrast-v366.css'),read('src/components/DocumentDesignControls.tsx')]);
  assert.match(css,/design-advanced-panel[\s\S]*min-height:44px/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*appearance-system-grid\{grid-template-columns:1fr!important/);
  assert.doesNotMatch(controls,/workspace-sidebar|bottom-nav|editor-topbar/);
});
