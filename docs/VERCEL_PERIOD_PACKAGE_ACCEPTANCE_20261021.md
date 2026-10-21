# Period server package acceptance — 21 October 2026

Baseline: `09e81c9e335d5cc8a6320361da354301c8d54073` (merged voucher hardening #942).
Scope: follow-up evidence for audit OVERLAP-08 and the package portion of OVERLAP-06.

## Confirmed verification defect

The existing `scripts/verify-vercel-nft-trace.mjs` supplied a custom `readFile`
callback that threw on absent candidate files. In @vercel/nft 1.11.0, absent
files/directories must instead return `null`, allowing resolution to continue
to hoisted dependencies. The implementation contract is visible in the pinned
package's `out/fs.js` (`_internalReadFile`) and `out/resolve-dependency.js`.

Before the correction, the script reported full-trace success with 499 files,
but a fresh process using those files and the configured finance assets failed
with `Cannot find module 'extend'`. This proves a defect in the local/CI verifier;
it does not prove that an actual Vercel deployment omitted that dependency.

## Limited change

- Preserve diagnostic tracing while matching nft's missing-file contract.
- Copy the full trace plus actual `includeFiles` glob results to a temporary
  package outside the checkout. Do not copy the complete dependency directory.
- Start a fresh Node 24 process with read permission restricted to that package,
  a sanitized environment, synthetic signing keys and blocked external I/O.
- Exercise the configured financial rewrite through the real entry point,
  both URL/query transport forms, authentication/role/scope/body rejection and
  the disabled-service response. The service remains disabled throughout.
- Load the original finance modules, round-trip a synthetic workspace and
  reject a changed closed-period expense. No replacement finance engine.
- Remove `period-close.js` and require a fresh process to fail, demonstrating
  detection of missing dynamic assets without reuse of module cache.
- Trigger the gate for runtime, build, configuration and probe changes too.

## Local evidence

Full production build passed. All 98 focused period/server/cloud/local/backup
and runtime-loader tests passed, with zero skips. Corrected full trace: 1,036
files; trace plus configured assets: 1,355 files. The isolated probe passed
eight transport cases, reported zero external requests and zero Firebase apps,
and the missing-module negative control passed. File counts are observations
of this locked install, not permanent acceptance thresholds.

## What remains open

This is a local packaging approximation using the pinned tracer and repository
configuration, not a Vercel build artifact or a deployed cold start. It does not
verify published Firebase rules, production activation flags, credentials,
authenticated live inspection, real-device behavior or every financial path.
Those release checks require a separately authorized synthetic environment.
No deployment, data migration, rule change, enrollment, close or reopen is part
of this change. The original forty-item mapping remains incomplete; this
evidence does not create or close unknown original items.
