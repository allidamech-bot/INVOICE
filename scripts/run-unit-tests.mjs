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

  const label=`[LOUREX tests] group ${index+1}/${chunkCount}: ${chunk.length} files`;
  process.stdout.write(`\n${label}\n`);
  const result=spawnSync(process.execPath,['--test',...chunk],{
    encoding:'utf8',
    env:process.env,
    maxBuffer:20*1024*1024
  });
  if(result.error)throw result.error;
  if(result.status!==0){
    process.stderr.write(`\n${label} FAILED\n`);
    process.stderr.write(`[LOUREX tests] files: ${chunk.join(', ')}\n`);
    if(result.stdout)process.stderr.write(`\n--- test stdout ---\n${result.stdout}`);
    if(result.stderr)process.stderr.write(`\n--- test stderr ---\n${result.stderr}`);
    process.exit(result.status??1);
  }
  process.stdout.write(`${label} passed\n`);
}

process.stdout.write(`\n[LOUREX tests] ${files.length} test files passed across ${chunkCount} groups.\n`);
