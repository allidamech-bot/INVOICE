/**
 * LOUREX AI Living Workspace — local-first release gate.
 *
 * Usage:
 *   node scripts/ai-living-workspace-release-gate.mjs
 *   node scripts/ai-living-workspace-release-gate.mjs --targeted
 *   node scripts/ai-living-workspace-release-gate.mjs --targeted --no-build
 *
 * Runs locally, not in GitHub Actions. A full pass is NOT a substitute for
 * authenticated browser/device QA or explicit release authorization.
 */
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = new Set(process.argv.slice(2));
const valid = new Set(['--targeted', '--no-build']);
for (const value of args) if (!valid.has(value)) {
  console.error('Unknown flag: ' + value);
  process.exit(2);
}
const targeted = args.has('--targeted');
const skipBuild = args.has('--no-build');
const targetTests = [
  'tests/ai-living-workspace-mode-foundation.test.mjs',
  'tests/ai-living-workspace-motion-batch2.test.mjs',
  'tests/ai-living-workspace-mode-integration.test.mjs',
  'tests/ai-living-workspace-preview-batch4.test.mjs',
  'tests/ai-living-workspace-preferences-batch4.test.mjs',
  'tests/ai-intelligence-foundation.test.mjs',
  'tests/ai-conversation-workspace.test.mjs',
  'tests/ai-conversation-hierarchy.test.mjs',
  'tests/ai-composer-v449.test.mjs',
  'tests/ai-conversation-loading-recovery.test.mjs',
];
const start = Date.now();
const stages = [];
function run(label, command, argv, options = {}) {
  console.log('\n=== LOUREX AI Gate: ' + label + ' ===');
  const at = Date.now();
  const result = spawnSync(command, argv, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: options.shell || false,
    windowsHide: true,
    timeout: options.timeout ?? (20 * 60 * 1000),
  });
  const status = result.status === 0 && !result.error ? 'PASS' : 'FAIL';
  stages.push({ label, status, seconds: Math.round((Date.now() - at) / 1000) });
  if (result.error) console.error(result.error.message);
  if (status === 'FAIL') {
    report();
    process.exit(result.status && result.status > 0 ? result.status : 1);
  }
}
function npmRun(name) {
  const windows = process.platform === 'win32';
  run('npm run ' + name, windows ? 'npm.cmd' : 'npm', ['run', name], { shell: windows });
}
function report() {
  console.log('\n=== LOUREX AI QA SUMMARY ===');
  for (const step of stages) console.log(step.status + '  ' + step.label + ' (' + step.seconds + ' s)');
  console.log('Elapsed: ' + Math.round((Date.now() - start) / 1000) + ' s');
  console.log('Authenticated Firebase login, browser screenshots, iOS WebKit, Gemini provider, and Production acceptance are NOT included.');
}
for (const path of targetTests) {
  try { accessSync(resolve(root, path), constants.R_OK); }
  catch { console.error('Required regression test missing: ' + path); process.exit(2); }
}
npmRun('typecheck');
if (!skipBuild) npmRun('build');
if (skipBuild) {
  try { accessSync(resolve(root, 'dist/src/lib/ai-conversation-mode.js'), constants.R_OK); }
  catch { console.error('--no-build requires a previously built dist tree.'); process.exit(2); }
}
if (targeted) run('targeted AI regression suite', process.execPath, ['--test', ...targetTests]);
else run('all Node test discovery (full local regression)', process.execPath, ['--test']);
report();
console.log(targeted
  ? '\nTARGETED DEV GATE PASSED — full regressions and live QA still required.'
  : '\nAUTOMATED LOCAL GATE PASSED — authenticated device QA still required.');
