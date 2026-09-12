import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('production build injects a fail-open searchable PDF text layer while preserving raster A4 rendering',async()=>{
  const [bridge,buildStep,sw,fontStat,licenseStat]=await Promise.all([
    read('dist/ios-print-bridge.js'),
    read('scripts/pdf-searchable-text-v222.mjs'),
    read('dist/sw.js'),
    stat('dist/vendor/lourex-search-amiri.ttf'),
    stat('dist/vendor/lourex-search-amiri-OFL.txt')
  ]);
  const imageIndex=bridge.indexOf("pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',0,0,210,297,undefined,'FAST')");
  const textIndex=bridge.indexOf('__LOUREX_ADD_SEARCHABLE_TEXT_LAYER__?.(pdf,page)');
  const sharpIndex=bridge.indexOf('await addSharpMedia(pdf,sharpMedia)');
  assert.ok(imageIndex>=0,'existing raster A4 page must remain the visual source');
  assert.ok(textIndex>imageIndex,'searchable text layer must be added after the page image');
  assert.ok(sharpIndex>textIndex,'signature/stamp overlays must remain after the text layer');
  assert.match(bridge,/renderingMode:'invisible'/);
  assert.match(bridge,/pdf\.addFileToVFS\(FONT_FILE,fontBase64\)/);
  assert.match(bridge,/pdf\.addFont\(FONT_FILE,FONT_NAME,'normal'\)/);
  assert.match(bridge,/catch \{ \/\* Preserve the existing image PDF if text-layer preparation fails\. \*\//);
  assert.match(buildStep,/Amiri-Regular\.ttf/);
  assert.ok(fontStat.size>100000,'embedded Arabic-capable TTF must be vendored');
  assert.ok(licenseStat.size>3000,'font license must ship with the vendored font');
  assert.match(sw,/\.\/vendor\/lourex-search-amiri\.ttf/);
});

test('searchable text layer preserves logical DOM text instead of replacing it with shaped presentation forms',async()=>{
  const bridge=await read('dist/ios-print-bridge.js');
  assert.match(bridge,/const normalizedText=/);
  assert.match(bridge,/NodeFilter\.SHOW_TEXT/);
  assert.match(bridge,/runs\.push\(\{text,x:Math\.max\(0,x\),y:Math\.max\(0,y\),width,fontPt\}\)/);
  assert.match(bridge,/pdf\.text\(run\.text,run\.x,run\.y/);
  assert.doesNotMatch(bridge,/processArabic\(run\.text\)|processArabic\(text\)/);
});
