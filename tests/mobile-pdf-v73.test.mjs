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

test('iPhone PDF save and share normalize Safari colors and preserve high-resolution signature/stamp artwork', async () => {
  const [html, bridge, review, documents, sw] = await Promise.all([
    read('index.html'),
    read('public/ios-print-bridge.js'),
    read('src/components/DocumentReviewModal.tsx'),
    read('src/components/DocumentsPage.tsx'),
    read('public/sw.js')
  ]);

  assert.match(html, /<script src="\.\/ios-print-bridge\.js"><\/script>/);
  assert.doesNotThrow(() => new Function(bridge));
  assert.match(bridge, /window\.__LOUREX_PREPARE_PDF__\s*=\s*preparePdfWindow/);
  assert.doesNotMatch(bridge, /window\.open\('about:blank'/);
  assert.match(bridge, /buildPdfFile/);
  assert.match(bridge, /html2canvas@1\.4\.1/);
  assert.match(bridge, /jspdf@2\.5\.2/);
  assert.match(bridge, /new File\(\[blob\]/);
  assert.match(bridge, /normalizeUnsupportedColors/);
  assert.match(bridge, /replaceColorFunction/);
  assert.match(bridge, /display-p3/);
  assert.match(bridge, /srgb-linear/);
  assert.match(bridge, /getComputedStyle\(node\)/);
  assert.match(bridge, /normalizeUnsupportedColors\(stage\)/);
  assert.match(bridge, /SHARP_MEDIA_SELECTOR\s*=\s*'\.signature-image,\.stamp-image'/);
  assert.match(bridge, /collectSharpMedia/);
  assert.match(bridge, /visibility','hidden','important'/);
  assert.match(bridge, /addSharpMedia/);
  assert.match(bridge, /pdf\.addImage\(prepared\.data,prepared\.format,asset\.x,asset\.y,asset\.w,asset\.h,asset\.alias,'NONE'\)/);
  assert.match(bridge, /maxDimension\s*=\s*2600/);
  assert.match(bridge, /navigator\.share\(\{ files: \[file\] \}\)/);
  assert.match(bridge, /navigator\.canShare/);
  assert.match(bridge, /download=\"\$\{escapeHtml\(file\.name\)\}\"/);
  assert.match(bridge, /Open PDF \/ فتح PDF/);
  assert.match(bridge, /shareWatchdogTimer/);
  assert.match(bridge, /Save PDF \/ حفظ PDF/);
  assert.match(bridge, /Share PDF \/ مشاركة PDF/);
  assert.match(bridge, /lourex-ios-output-fallback/);
  assert.match(bridge, /window\.print=function lourexPrintBridge/);
  assert.match(bridge, /releaseParentPrintState/);
  assert.match(bridge, /dispatchEvent\(new Event\('afterprint'\)\)/);
  assert.match(review, /__LOUREX_PREPARE_PDF__\?\.\(mode\)/);
  assert.match(review, /mode==='pdf'\|\|mode==='share'\|\|mode==='print'/);
  assert.match(documents, /private reserveOutput=/);
  assert.match(documents, /runOutput\('pdf'/);
  assert.match(documents, /runOutput\('share'/);
  assert.match(sw, /lourex-invoice-v92/);
  assert.match(sw, /html2canvas@1\.4\.1/);
  assert.match(sw, /jspdf@2\.5\.2/);
  assert.match(sw, /FRESH_PATHS = new Set\(\['\/ios-print-bridge\.js','\/pull-to-refresh\.js'\]\)/);
});