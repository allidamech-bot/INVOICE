import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Vercel release gate is either fully locked or main-only',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  const gate=config.git?.deploymentEnabled;
  if(gate===false){
    assert.equal(gate,false);
    return;
  }
  assert.deepEqual(gate,{main:true,'*':false});
  assert.equal(gate['*'],false,'feature branches must never deploy automatically');
});
