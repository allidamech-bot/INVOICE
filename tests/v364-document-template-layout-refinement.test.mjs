import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('measured A4 starts with room for rows and moves intact fragments on overflow',async()=>{
 const source=await readFile('src/templates/TemplateRenderer.tsx','utf8');
 assert.match(source,/paginateItems\(fragments,false,10,doc.language/);
 assert.match(source,/items.pop\(\)/);
 assert.match(source,/pages\[i\+1\]!.unshift\(moved\)/);
 assert.match(source,/footer.getBoundingClientRect\(\).top-8\*scale/);
 assert.match(source,/document.fonts\?\.ready/);
});
