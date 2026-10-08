#!/usr/bin/env node
// LOUREX local-only PR verification. No GitHub Actions, hosted jobs or uploaded artifacts.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
process.chdir(ROOT);
const require=createRequire(import.meta.url);
const MANIFEST={
  "stability": [
    {
      "file": "tests/visual/run-v338-editor-stability.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-v339-ipad-landscape-draft.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-v339-ipad-landscape-commercial.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-v339-ipad-portrait-draft.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-v337-shell-navigation.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-v339-shell-overlay-release.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-v339-signout-guard.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-responsive-batch1.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-search-keyboard-batch1.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-editor-keyboard-batch1.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-modal-viewport-acceptance-batch1.cjs",
      "seconds": 180,
      "args": []
    },
    {
      "file": "tests/visual/run-ai-voice-reliability-batch5.cjs",
      "seconds": 180,
      "args": []
    }
  ],
  "current": {
    "templates": [
      {
        "file": "tests/visual/run-pdf-searchable-v222.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-template-visual-qa.cjs",
        "seconds": 300,
        "args": [
          "visual-qa-output"
        ]
      },
      {
        "file": "tests/visual/run-template-firstpaint-stability.cjs",
        "seconds": 120,
        "args": []
      }
    ],
    "mobile-current": [
      {
        "file": "tests/visual/run-mobile-final-quote-stack.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-mobile-modal-overlap-v176.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-functional-navigation-auth-v200.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-v364-core-workflows.cjs",
        "seconds": 180,
        "args": []
      }
    ],
    "auth-documents": [
      {
        "file": "tests/visual/run-premium-auth-gateway-v187.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-mobile-preview-fit-v241.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-functional-document-workflow.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-functional-editor-controls-v201.cjs",
        "seconds": 180,
        "args": []
      }
    ],
    "business-current": [
      {
        "file": "tests/visual/run-functional-payments.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-import-final-audit-v267.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-commercial-flow-batch1.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-relationship-360-batch2.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-workspace-ux-batch3.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-workspace-closeout-batch3.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-notification-recovery-batch3.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-contextual-ai-batch4.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-commercial-completion-batch6.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-accounting-foundation-batch7.cjs",
        "seconds": 180,
        "args": []
      }
    ],
    "locales-current": [
      {
        "file": "tests/visual/run-saved-items-category-locale-v246.cjs",
        "seconds": 180,
        "args": []
      }
    ],
    "tailadmin-current": [
      {
        "file": "tests/visual/run-obsidian-settings.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-tailadmin-v320.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-v326-business-workspaces.cjs",
        "seconds": 180,
        "args": []
      }
    ],
    "v337-current": [
      {
        "file": "tests/visual/run-v337-draft-output.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-v337-create-center.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-v337-document-actions.cjs",
        "seconds": 180,
        "args": []
      },
      {
        "file": "tests/visual/run-v337-shell-navigation.cjs",
        "seconds": 180,
        "args": []
      }
    ]
  },
  "legacy": {
    "legacy-mobile": [
      {
        "file": "tests/visual/run-mobile-controls-density-v177.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-final-touch-targets-v275.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-mobile-spacing-fit-v198.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-mobile-safari-chrome-v199.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-save-reliability-v217.cjs",
        "seconds": 90,
        "args": []
      }
    ],
    "legacy-business": [
      {
        "file": "tests/visual/run-functional-customers-v196.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-functional-products-operations-v197.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-packing-preview-locale-v244.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-product-category-locale-v245.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-product-unit-locale-v247.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-operations-mobile-tabs-v242.cjs",
        "seconds": 90,
        "args": []
      }
    ],
    "legacy-tailadmin": [
      {
        "file": "tests/visual/run-v326-dashboard-documents.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-v326-access-surfaces.cjs",
        "seconds": 90,
        "args": []
      },
      {
        "file": "tests/visual/run-v326-studio-security-overlays.cjs",
        "seconds": 90,
        "args": []
      }
    ]
  }
};
const CONTRACTS=[
  'tests/b07-procurement-rfq-po-link.test.mjs',
  'tests/b07-supplier-quotation-review.test.mjs',
  'tests/b07-goods-receipt-ledger.test.mjs',
  'tests/b07-supplier-invoice-matching.test.mjs',
  'tests/b07-matched-invoice-posting.test.mjs',
  'tests/b07-sales-order-acceptance.test.mjs',
  'tests/b07-sales-delivery-confirmation.test.mjs',
  'tests/local-verification-no-actions.test.mjs'
];
const args=new Set(process.argv.slice(2));
for(const arg of args)if(!['--quick','--legacy','--help'].includes(arg))throw Error('Unknown argument '+arg);
if(args.has('--help')){
  console.log('Usage: node scripts/verify-local.mjs [--quick] [--legacy]');
  console.log('Default: security, typecheck, production build, PR+B07 contracts and mandatory Chromium/WebKit QA.');
  console.log('--quick: developer-only; skips browsers, NOT a merge signoff.');
  console.log('--legacy: include historical NON-BLOCKING diagnostics.');
  process.exit(0);
}
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(cmd,argv,timeout=600000){
  const result=spawnSync(cmd,argv,{cwd:ROOT,stdio:'inherit',encoding:'utf8',timeout,windowsHide:true,shell:process.platform==='win32'&&cmd===npm});
  if(result.error)throw Error('Command failed: '+cmd+' '+argv.join(' ')+' / '+result.error.message);
  if(result.status!==0)throw Error('Command failed ('+result.status+'): '+cmd+' '+argv.join(' '));
}
function gitFiles(){
  const result=spawnSync('git',['diff','--name-only','origin/main...HEAD','--','tests/'],{cwd:ROOT,encoding:'utf8',windowsHide:true});
  if(result.status!==0||result.error)throw Error('Missing origin/main comparison. Fetch latest origin/main; never skip changed PR tests.');
  return result.stdout.split(/\r?\n/).filter(f=>/^tests\/[^/]+\.test\.mjs$/.test(f));
}
function assertNoActions(){
  const dir=path.join(ROOT,'.github','workflows');
  const files=existsSync(dir)?readdirSync(dir).filter(f=>/\.ya?ml$/.test(f)):[];
  if(files.length)throw Error('GitHub Actions workflow files still exist: '+files.join(', '));
}
function assertBrowserReady(){
  let playwright;
  try{playwright=require('playwright');}
  catch{throw Error('Playwright missing. Run npm install --no-save --package-lock=false playwright@1.55.0');}
  for(const name of ['chromium','webkit']){
    const exe=playwright[name]?.executablePath();
    if(!exe||!existsSync(exe))throw Error(name+' browser missing. Run npx playwright install chromium webkit');
  }
}
async function startServer(){
  try{const occupied=await fetch('http://127.0.0.1:4173/',{signal:AbortSignal.timeout(1000)});if(occupied)throw Error('Port 4173 is already occupied: close the other server to avoid testing stale content.');}
  catch(error){if(error.message?.startsWith('Port 4173 is already occupied'))throw error;}
  const entry=path.join(ROOT,'node_modules','http-server','bin','http-server');
  if(!existsSync(entry))throw Error('http-server missing. Run npm ci.');
  const server=spawn(process.execPath,[entry,'.','-p','4173','-c-1'],{cwd:ROOT,stdio:'ignore',windowsHide:true});
  for(let i=0;i<30;i++){
    if(server.exitCode!==null)throw Error('Local HTTP server exited early');
    try{
      const res=await fetch('http://127.0.0.1:4173/tests/visual/template-visual-qa.html',{signal:AbortSignal.timeout(1000)});
      if(res.ok)return server;
    }catch{}
    await sleep(1000);
  }
  server.kill();throw Error('Local QA fixture server unavailable on port 4173');
}
function runBrowserQa(shard,suites){
  console.log('[LOUREX mandatory browser QA] '+shard+' / '+suites.length+' suites');
  for(const suite of suites)run(process.execPath,[suite.file,...suite.args],suite.seconds*1000);
}
function runLocalChecks(){
  if(Number(process.versions.node.split('.')[0])!==24)throw Error('Node.js 24.x is required');
  if(!existsSync(path.join(ROOT,'node_modules','typescript')))throw Error('Missing dependencies: run npm ci');
  assertNoActions();
  run(npm,['audit','--audit-level=high']);
  run(process.execPath,['scripts/security-check.mjs']);
  run(npm,['run','typecheck']);
  run(npm,['run','build']);
  const tests=[...new Set([...CONTRACTS,...gitFiles()])].sort();
  for(const file of tests)if(!existsSync(path.join(ROOT,file)))throw Error('Mandatory contract missing: '+file);
  run(process.execPath,['--test',...tests],900000);
}
async function main(){
  if(args.has('--quick'))console.warn('DEVELOPMENT ONLY: --quick skips mandatory browser QA; not a merge signoff.');
  runLocalChecks();
  if(!args.has('--quick')||args.has('--legacy')){
    assertBrowserReady();
    const server=await startServer();
    try{
      if(!args.has('--quick')){
        runBrowserQa('stability',MANIFEST.stability);
        for(const [shard,suites] of Object.entries(MANIFEST.current))runBrowserQa(shard,suites);
      }
      if(args.has('--legacy')){
        for(const [shard,suites] of Object.entries(MANIFEST.legacy)){
          try{runBrowserQa('historical: '+shard,suites);}
          catch(error){console.warn('NON-BLOCKING legacy browser diagnostic: '+error.message);}
        }
      }
    }finally{server.kill();}
  }
  if(args.has('--legacy')){
    const files=readdirSync(path.join(ROOT,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f).sort();
    try{run(process.execPath,['--test',...files],1800000);}
    catch(error){console.warn('NON-BLOCKING historical unit baseline failed: '+error.message);}
  }
  console.log(args.has('--quick')?'Quick checks PASS; browser QA NOT RUN.':'Mandatory LOUREX local QA PASS including Chromium/WebKit.');
}
main().catch(error=>{console.error('LOUREX QA FAILED: '+error.message);process.exitCode=1;});
