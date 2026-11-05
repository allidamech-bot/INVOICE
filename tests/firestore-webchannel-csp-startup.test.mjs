import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Firestore WebChannel image probe is allowed narrowly without weakening scripts or accounting APIs',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const csp=config.headers?.flatMap(group=>group.headers||[]).find(row=>row.key==='Content-Security-Policy')?.value||'';
  const getDirective=name=>csp.match(new RegExp('(?:^|; )'+name+' ([^;]*);'))?.[1]||'';
  const imageSources=getDirective('img-src').split(/\s+/);
  assert.ok(imageSources.includes('https://www.google.com/images/cleardot.gif'),'Firestore reachability GIF must not be blocked on Safari');
  assert.ok(!imageSources.includes('https://*.google.com'),'do not allow broad third-party image hosts');
  assert.equal(getDirective('script-src'),"'self' https://apis.google.com https://www.gstatic.com");
  assert.equal(getDirective('connect-src').includes('https://*.googleapis.com'),true);
  assert.equal(getDirective('frame-ancestors'),"'none'");
});
