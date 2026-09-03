import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v127 does not force a details-only page from bank/signature/terms alone',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  const quality=await read('src/lib/document-quality.ts');

  for(const source of [renderer,quality]){
    assert.match(source,/hardOverflow=detailsChars>1400/);
    assert.match(source,/complexClosing=score>=10/);
    assert.match(source,/tentative=paginateItems\(doc\.items,true,/);
    assert.match(source,/lastWeight/);
    assert.match(source,/allowedLastWeight=score>=16\?2:score>=13\?3:5/);
    assert.doesNotMatch(source,/return score\s*>=\s*10\s*\|\|\s*detailsChars/);
  }
});

test('v127 still reserves a dedicated details page for genuinely huge closing prose',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/values\.some\(value=>value\.length>520\)/);
  assert.match(renderer,/notes\.length>900/);
  assert.match(renderer,/if\(hardOverflow\)return true/);
});