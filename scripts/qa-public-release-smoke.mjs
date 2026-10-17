/**
 * Public, read-only release attestation. No account data, auth, API calls, or providers.
 * Designed to run from CI when the ChatGPT environment cannot reach the site.
 * PASS proves publicly served build identity/assets only, never business acceptance.
 */
const ROOT = process.env.LOUREX_SMOKE_URL || 'https://invoice-three-puce.vercel.app';
const EXPECTED_SHA = (process.env.LOUREX_EXPECTED_SHA || '').trim();
const base = new URL(ROOT);
const isLoopback = base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname);
if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    (!isLoopback && (base.protocol !== 'https:' || base.hostname !== 'invoice-three-puce.vercel.app'))) {
  console.error('INCONCLUSIVE_CONFIG: unexpected production target; no requests made.');
  process.exit(2);
}
if (EXPECTED_SHA && !/^[a-f0-9]{40}$/i.test(EXPECTED_SHA)) {
  console.error('INCONCLUSIVE_CONFIG: expected SHA must contain 40 hexadecimal characters.');
  process.exit(2);
}
const probes = [
  ['/', /LOUREX Invoice/i, /styles\/app\.bundle\.css/i],
  ['/health.html', /LOUREX Invoice/i, /health\.js/i],
  ['/health.js', /EXPECTED_OWNER=['"]allidamech-bot['"]/, /EXPECTED_REPO=['"]INVOICE['"]/],
  ['/sw.js', /lourex-invoice-/, /LOCAL_CORE/],
  ['/runtime-config.js', /^window\.__LOUREX_RUNTIME__=/m, null],
];
const result = [];
let failure = false;
let inconclusive = false;
let config = null;
for (const [path, marker1, marker2] of probes) {
  try {
    const res = await fetch(new URL(path, base), {
      redirect:'manual', signal:AbortSignal.timeout(10000),
      headers:{'Accept':'text/html, text/javascript, application/javascript, */*','Cache-Control':'no-cache'},
    });
    if ([401,403,429].includes(res.status) || res.status >= 300 && res.status < 400) {
      inconclusive = true;
      result.push({path, state:'INCONCLUSIVE_ACCESS', status:res.status});
      continue;
    }
    if (res.status !== 200) {
      failure = true;
      result.push({path,state:'FAIL_STATUS',status:res.status});
      continue;
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 500_000) {failure = true;result.push({path,state:'FAIL_SIZE'});continue;}
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 500_000) {failure = true;result.push({path,state:'FAIL_SIZE'});continue;}
    const contents = new TextDecoder().decode(bytes);
    if (!marker1.test(contents) || (marker2 && !marker2.test(contents))) {
      failure = true;
      result.push({path,state:'FAIL_CONTENT',status:200});
      continue;
    }
    if (path === '/runtime-config.js') {
      const json = contents.match(/^window\.__LOUREX_RUNTIME__=(\{[^\r\n]*\});?\s*$/m)?.[1];
      try {config = JSON.parse(json || 'null');} catch {}
      if (!config || typeof config !== 'object') {
        failure = true;
        result.push({path,state:'FAIL_RUNTIME_FORMAT',status:200});
        continue;
      }
      if (config.environment !== 'production' ||
          config.sourceRepoOwner !== 'allidamech-bot' ||
          config.sourceRepoSlug !== 'INVOICE' ||
          config.projectId !== 'prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ') {
        failure = true;
        result.push({path,state:'FAIL_DEPLOYMENT_IDENTITY',status:200});
        continue;
      }
      if (EXPECTED_SHA && config.commitSha !== EXPECTED_SHA) {
        failure = true;
        result.push({path,state:'FAIL_STALE_COMMIT',status:200,
          servedSha:String(config.commitSha || '').slice(0,12), expectedSha:EXPECTED_SHA.slice(0,12)});
        continue;
      }
      result.push({path,state:EXPECTED_SHA?'PASS_COMMIT_MATCH':'PASS_IDENTITY_SHA_NOT_ASSERTED',status:200,
        servedSha:String(config.commitSha || '').slice(0,12),buildTime:config.buildTime||'unknown'});
      continue;
    }
    result.push({path,state:'PASS',status:200});
  } catch (error) {
    inconclusive = true;
    result.push({path,state:'INCONCLUSIVE_NETWORK',reason:error?.name || 'network error'});
  }
}
// Print only safe public asset and deployment metadata. Never dump runtime config or response bodies.
console.log(JSON.stringify({type:'LOUREX_PUBLIC_RELEASE_SMOKE',results:result},null,2));
if (failure) {console.error('FAIL: release public-shell evidence mismatched. Does not imply customer data damage.');process.exitCode=1;}
else if (inconclusive) {console.error('INCONCLUSIVE: unable to attest all public assets. Not proof of an app outage.');process.exitCode=2;}
else console.log('PASS: public static app shell and deployment identity verified. Authenticated E2E still pending.');
