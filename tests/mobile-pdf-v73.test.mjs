import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile preview preserves physical A4 geometry instead of shrinking document layout', async () => {
  const [html, css] = await Promise.all([
    read('index.html'),
    read('src/styles/a4-mobile-print-v73.css')
  ]);

  assert.match(html, /styles\/a4-mobile-print-v73\.css/);
  assert.match(css, /\.mobile-preview-stage \.invoice-page/);
  assert.match(css, /width:\s*210mm\s*!important/);
  assert.match(css, /height:\s*297mm\s*!important/);
  assert.match(css, /\.mobile-preview-overlay\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /\.mobile-preview-open \.mobile-preview-overlay\s*\{\s*display:\s*block\s*!important/);
  assert.match(css, /\.lower-grid\s*>\s*\.totals-block/);
  assert.match(css, /min-width:\s*66mm/);
});

test('iPhone PDF confirmation has a synchronous gesture-safe preview and direct Save PDF fallback', async () => {
  const [html, bridge, review] = await Promise.all([
    read('index.html'),
    read('public/ios-print-bridge.js'),
    read('src/components/DocumentReviewModal.tsx')
  ]);

  assert.match(html, /<script src="\.\/ios-print-bridge\.js"><\/script>/);
  assert.doesNotThrow(() => new Function(bridge));
  assert.match(bridge, /window\.__LOUREX_PREPARE_PDF__\s*=\s*preparePdfWindow/);
  assert.match(bridge, /window\.open\('about:blank', '_blank'\)/);
  assert.match(bridge, /modal-footer-actions \.btn-primary/);
  assert.match(bridge, /Save PDF \/ حفظ PDF/);
  assert.match(bridge, /onclick="window\.print\(\)"/);
  assert.match(bridge, /window\.print = function lourexPrintBridge/);
  assert.match(bridge, /\.print-portal \.invoice-page/);
  assert.match(bridge, /styleLinks/);
  assert.match(bridge, /releaseParentPrintState/);
  assert.match(bridge, /dispatchEvent\(new Event\('afterprint'\)\)/);
  assert.match(review, /__LOUREX_PREPARE_PDF__/);
  assert.match(review, /mode==='pdf'/);
});
