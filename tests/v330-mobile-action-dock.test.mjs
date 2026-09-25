import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('v330 keeps Save Preview PDF Share reachable after single-scroll recovery', async () => {
  const [css,editor] = await Promise.all([
    read('src/styles/v330-template-contrast-guard.css'),
    read('src/components/EditorPageCore.tsx')
  ]);
  assert.match(editor, /mobile-editor-actionbar/);
  assert.match(editor, /mobile-action-buttons/);
  assert.match(css, /\.screen-editor \.mobile-editor-actionbar\s*\{[\s\S]*?position:fixed!important[\s\S]*?bottom:0!important/);
  assert.match(css, /\.screen-editor \.mobile-action-buttons\s*\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css, /\.screen-editor \.mobile-total\{display:none!important\}/);
});

test('v330 final AI position stays on right above the action dock', async () => {
  const css = await read('src/styles/v330-template-contrast-guard.css');
  assert.match(css, /\.screen-editor \.lourex-ai-launcher\s*\{[\s\S]*?right:max\(12px,env\(safe-area-inset-right,0px\)\)!important[\s\S]*?top:auto!important[\s\S]*?bottom:calc\(92px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
});
