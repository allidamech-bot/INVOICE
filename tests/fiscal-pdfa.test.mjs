import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('statutory PDF packaging structural regression suite',()=>{
  const python=process.env.LOUREX_FISCAL_PYTHON||(process.platform==='win32'?'python':'python3');
  for(const file of ['test_package_pdfa.py','test_render_fiscal.py','test_pades_fiscal.py']){
    const run=spawnSync(python,['scripts/fiscal/'+file],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
    assert.equal(run.status,0,run.error?.message||run.stderr||run.stdout);
  }
});
