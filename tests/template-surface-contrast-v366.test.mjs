import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');
test('appearance controls do not repaint commercial A4 output',async()=>{
 const controls=await read('src/styles/template-surface-contrast-v366.css');
 assert.doesNotMatch(controls,/\.invoice-page|\.items-table|\.doc-footer/);
 assert.match(controls,/design-control-card/);
});
test('canonical typography has independent title, heading, body and table sizes',async()=>{
 const [css,renderer]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/templates/TemplateRenderer.tsx')]);
 for(const role of ['--lrx-title-scale','--lrx-heading-size','--lrx-body-size','--lrx-table-size','--lrx-table-heading-size']){assert.ok(css.includes(role));assert.ok(renderer.includes(role));}
 assert.doesNotMatch(css,/font-size:[567]px/);
 assert.match(css,/font-weight:400/);assert.match(css,/font-weight:700/);
});
