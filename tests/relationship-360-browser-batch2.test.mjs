import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Batch 2 mobile EN/AR browser QA is blocking in business-current',async()=>{
  const [ci,runner,fixture]=await Promise.all([
    read('.github/workflows/ci.yml'),
    read('tests/visual/run-relationship-360-batch2.cjs'),
    read('tests/visual/relationship-360-batch2.html')
  ]);
  assert.match(ci,/business-current[\s\S]*run_qa 180 node tests\/visual\/run-relationship-360-batch2\.cjs/);
  assert.match(runner,/viewport:\{width:390,height:844\}/);
  assert.match(runner,/mobile-en/);
  assert.match(runner,/mobile-ar/);
  assert.match(runner,/scrollWidth<=geometry\.innerWidth\+1/);
  assert.match(runner,/height>=44/);
  assert.match(runner,/textAlign==='right'/);
  assert.match(runner,/Not Accounts Payable\|ليس حساب ذمم موردين/);
  assert.match(fixture,/Customer360Panel/);
  assert.match(fixture,/Supplier360Panel/);
  assert.match(fixture,/currency:'EUR'/);
  assert.match(fixture,/currency:'USD'/);
});
