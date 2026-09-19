import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files=(await readdir('tests'))
  .filter(name=>name.endsWith('.test.mjs'))
  .sort();

if(!files.length)throw new Error('No unit test files found.');

for(const name of files){
  const file=path.join('tests',name);
  process.stdout.write(`\n[LOUREX tests] ${file}\n`);
  const result=spawnSync(process.execPath,['--test',file],{
    stdio:'inherit',
    env:process.env
  });
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}

process.stdout.write(`\n[LOUREX tests] ${files.length} test files passed.\n`);
