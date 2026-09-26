import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v351 final mobile page-end clearance has enough specificity to beat historical page owners',async()=>{
  const [reliability,html]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('index.html')
  ]);
  const start=reliability.indexOf('/* The fixed mobile navigation clearance is reserved once by the shell.');
  const end=reliability.indexOf('@media screen and (max-width:720px)',start);
  assert.ok(start>=0&&end>start,'final mobile clearance contract must exist');
  const contract=reliability.slice(start,end);
  assert.match(contract,/html body \.app-ui :is\(/);
  assert.doesNotMatch(contract,/html body \.app-ui :where\(/);
  assert.match(contract,/\.ta-finance-dashboard,[\s\S]*\.ta-reports-page[\s\S]*padding-bottom:24px!important/);
  assert.ok(html.indexOf('tailadmin-reliability-bridge-v320.css')>html.indexOf('tailadmin-design-mobile-priority-v323.css'),'reliability must remain after mobile page presentation in source order');
});
