import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v96 matte dark layer loads last and ships in the PWA shell',async()=>{
  const [html,sw,manifest]=await Promise.all([read('index.html'),read('public/sw.js'),read('public/manifest.webmanifest')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.equal(styles.at(-1),'matte-dark-v96.css');
  assert.match(html,/name="theme-color" content="#111214"/);
  assert.match(sw,/lourex-invoice-v96/);
  assert.match(sw,/\.\/styles\/matte-dark-v96\.css/);
  assert.match(manifest,/"background_color": "#111214"/);
  assert.match(manifest,/"theme_color": "#111214"/);
});

test('matte dark theme uses neutral black surfaces with restrained functional accents',async()=>{
  const css=await read('src/styles/matte-dark-v96.css');
  assert.match(css,/--dm-bg:#111214/);
  assert.match(css,/--dm-surface:#181a1d/);
  assert.match(css,/--dm-surface-2:#1e2125/);
  assert.match(css,/--dm-text:#f1f3f5/);
  assert.match(css,/--dm-blue:#5b9bd5/);
  assert.match(css,/--dm-green:#55b985/);
  assert.match(css,/--dm-gold:#c7a15e/);
  assert.match(css,/--dm-red:#e07474/);
  assert.match(css,/\.documents-overview>button\.has-ready:before\{background:var\(--dm-green\)/);
  assert.match(css,/\.document-kind-pill\{background:var\(--dm-gold-soft\)/);
});

test('dark application layer stays isolated from printable document and A4 output',async()=>{
  const css=await read('src/styles/matte-dark-v96.css');
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.a4[-_]/i);
  assert.match(css,/\.app-ui \.preview-stage\{background:#0e0f11/);
  assert.match(css,/Printable document\/A4 selectors are intentionally excluded/);
});
