import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files=(await readdir('tests'))
  .filter(name=>name.endsWith('.test.mjs'))
  .sort()
  .map(name=>path.join('tests',name));

if(!files.length)throw new Error('No unit test files found.');

const chunkCount=Math.min(8,files.length);

for(let index=0;index<chunkCount;index+=1){
  const start=Math.floor(files.length*index/chunkCount);
  const end=Math.floor(files.length*(index+1)/chunkCount);
  const chunk=files.slice(start,end);
  if(!chunk.length)continue;

  process.stdout.write(`\n[LOUREX tests] group ${index+1}/${chunkCount}: ${chunk.length} files\n`);
  const result=spawnSync(process.execPath,['--test',...chunk],{
    stdio:'inherit',
    env:process.env
  });
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}

process.stdout.write(`\n[LOUREX tests] ${files.length} test files passed across ${chunkCount} groups.\n`);
