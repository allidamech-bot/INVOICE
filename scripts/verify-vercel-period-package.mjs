import assert from 'node:assert/strict';
import {copyFile,glob,lstat,mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';

// Local packaging approximation: nft's full trace plus the function's actual
// includeFiles assets. This is not a Vercel deployment or a live readiness test.
export async function verifyPeriodPackage(tracedFiles){
  const root=process.cwd(),config=JSON.parse(await readFile('vercel.json','utf8'));
  const include=config.functions?.['api/ai-core.js']?.includeFiles;
  assert.ok(typeof include==='string'||Array.isArray(include),'Missing finance includeFiles configuration');
  const rewrite=config.rewrites.find(row=>row.source==='/api/workspace-commit');
  assert.equal(typeof rewrite?.destination,'string','Missing period transport rewrite');
  const files=new Set(tracedFiles);
  for await(const file of glob(include,{cwd:root}))if((await lstat(resolve(root,file))).isFile())files.add(file);
  const bundle=await mkdtemp(join(tmpdir(),'lourex-period-package-'));
  try{
    assert.ok(relative(root,bundle).startsWith('..'+sep),'Package must be outside the checkout');
    for(const file of files){
      assert.ok(!isAbsolute(file)&&!file.split(/[\\/]/).includes('..'),'Unsafe traced package path');
      const target=join(bundle,file);await mkdir(dirname(target),{recursive:true});
      await copyFile(resolve(root,file),target);
    }
    const probe='tests/fixtures/period-package-probe.mjs';
    await mkdir(join(bundle,dirname(probe)),{recursive:true});
    await copyFile(resolve(root,probe),join(bundle,probe));
    const run=()=>spawnSync(process.execPath,[
      '--permission','--allow-fs-read='+bundle,probe,rewrite.destination
    ],{
      cwd:bundle,encoding:'utf8',timeout:30_000,maxBuffer:2_000_000,
      // Do not inherit service accounts, provider keys, NODE_PATH or flags.
      env:{PATH:process.env.PATH,LANG:'C.UTF-8',NODE_ENV:'production',
        LOUREX_PERIOD_SERVER_ENABLED:'false',LOUREX_PERIOD_RULES_VERSION:'1'}
    });
    const complete=run();
    assert.ifError(complete.error);
    assert.equal(complete.status,0,'Isolated period package failed:\n'+complete.stderr+'\n'+complete.stdout);
    assert.match(complete.stdout,/PERIOD_PACKAGE_PROBE_PASS/);
    console.log(complete.stdout.trim());
    // A fresh process must detect a missing dynamic asset, rather than pass
    // from module cache or fall back to the source checkout's dist directory.
    await rm(join(bundle,'dist/src/lib/period-close.js'));
    const incomplete=run();assert.ifError(incomplete.error);
    assert.notEqual(incomplete.status,0,'Missing compiled finance asset escaped the package check');
    assert.match(incomplete.stderr,/ERR_MODULE_NOT_FOUND/);
    assert.match(incomplete.stderr,/period-close\.js/);
    console.log('PERIOD_PACKAGE_NEGATIVE_CONTROL_PASS missing period-close.js rejected');
    console.log('PERIOD_PACKAGE_PASS',JSON.stringify({files:files.size,includeFiles:include,liveAccess:false}));
  }finally{await rm(bundle,{recursive:true,force:true});}
}
