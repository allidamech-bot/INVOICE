# LOUREX — Local release verification and safe GitHub branch QA

Read-only, branch-scoped GitHub Actions workflows are retained. The local release verifier must **not** reject their existence: it runs `tests/local-verification-no-actions.test.mjs` as an early safety/manifest preflight. That test rejects dangerous triggers, production deployments, secrets usage, and unscoped push branches. A green automated check (or an absent check) is **not** a substitute for final-HEAD local signoff.

## Prepare on Windows / Linux / macOS

Node.js 24.x, Git with origin/main fetched, and npm are required. Run from the repository root:

```sh
npm ci
npm install --no-save --package-lock=false playwright@1.55.0
npx playwright install chromium webkit
node scripts/verify-local.mjs
```

A local signoff may take significantly longer than the former parallel hosted matrix because all required suites now run serially. On Linux install Playwright system libraries with `npx playwright install-deps chromium webkit` if missing.
Playwright is installed without changing package.json or the lockfile. It is NOT uploaded as a GitHub artifact.

## Fiscal QA prerequisites

The permanent local contract manifest includes all fiscal tests (not just changed files). Install JDK 17+ (`java` and `javac`) and OpenSSL on PATH for the offline canonicalization and certificate tests. These tests do not establish official SDK, live Firestore/KMS or actual FATOORA simulation acceptance. Fiscal PR release requires separately recorded official SDK and six-document simulation results, isolated Firebase auth/rules and transaction acceptance, and all statutory/application integration gates in `docs/TAX_00_FISCAL_INTEGRATION.md`. No production credentials or paid infrastructure are required for the focused offline tests.

## Mandatory before merge

Default verification runs the safe-workflow preflight, `npm audit --audit-level=high`, `scripts/security-check.mjs`, TypeScript, production build, every changed PR top-level test contract, the Batch 7 tests, and ten permanent stock-issue, invoice-void, sales-return, accounting, reporting, AI-isolation and two-device cloud-race contracts. It also runs the current Chromium/WebKit QA shards and iPad/mobile/editor stability suites. A failure or missing dependency blocks local signoff. Keep full console output and the tested commit SHA in the Pull Request.

`node scripts/verify-local.mjs --quick` is for development ONLY and does not run browsers. Do not merge based on a quick pass.
`node scripts/verify-local.mjs --legacy` also runs old diagnostic suites (reported separately and historically non-blocking).

Feature branch → PR → final-head local verification → recorded manual signoff → merge. Do not bypass or weaken security, WebKit, iPad or mobile tests.

Required status checks and branch protection were not audited by this change. If obsolete contexts block a verified merge, only an authorized repository admin should reconcile them; do not bypass an active, relevant required check.

This release-gate fix does not modify Vercel deployment or domain settings and does not edit application behavior, Firebase rules or financial data.

## Fiscal PDF/A verification prerequisites

Install Python 3.11+ in an isolated virtual environment and run `python -m pip install -r scripts/fiscal/requirements-pdfa.txt`. Use the environment's Python via `LOUREX_FISCAL_PYTHON` (defaults to python3 on POSIX and python on Windows) when running the local verifier. The permanent fiscal PDF/A structural regression invokes the Python suite, so dependency absence fails the local gate. Actual PDF/A-3b verification also requires the official veraPDF CLI installed separately (absolute trusted path) and synthetic validated fiscal renderer fixtures; the structural test does not replace validation of the final PAdES-stamped output. Never use mock validator output as acceptance evidence. No paid or production infrastructure is implied.

The fiscal PDF renderer additionally requires WeasyPrint 68.0 system dependencies (Pango, Fontconfig and Noto Sans Arabic/DejaVu Sans fonts); install on the isolated QA machine before the local verifier. Tests exercise the actual renderer and QR decoder, not a mocked pass. PDF/A-3 XMP generation is not certification; use real veraPDF before/after packaging and after PAdES signing.

The fiscal PDF wrapper also exercises actual synthetic secp256k1 PAdES signing with asn1crypto, cryptography and OpenSSL 3.x. The IPC adapter is an offline candidate only; a successful local detached CMS verification is not official PAdES acceptance. Validate the final signed PDF with veraPDF and official applicable acceptance tooling. Do not treat a synthetic or mocked result as the release gate.

## Official SDK matrix (isolated QA only)

Install the genuine ZATCA Java SDK obtained from the official download page, independently verify its origin and record the archive SHA-256. Prepare six unique LOUREX synthetic XML artifacts, not the SDK sample files: standard-invoice, standard-credit, standard-debit, simplified-invoice, simplified-credit, simplified-debit. The manifest must contain environment `simulation`, syntheticOnly `true`, sourceCommit (exact 40-hex Git SHA), sdkVersion, sdkArchiveSha256, and documents keyed by those six types with relative `file` and exact `sha256` fields. Run `python scripts/fiscal/verify_sdk_matrix.py --manifest /private/qa/manifest.json --launcher /verified-sdk/fatoora --sdk-version VERSION --output /private/qa/new-evidence`. The directory must not already exist. Parser regression: `python -m unittest discover -s scripts/fiscal -p test_verify_sdk_matrix.py`. Keep logs and matrix outside Git; review the installed package provenance, actual SDK-version output semantics and source-commit linkage independently. A matrix is not authority acceptance. Standard checks here are pre-clearance; separately verify actual authority stamp/QR and all additional statutory cases. Do not pass real customer data, production credentials or private keys.


## Private SDK4 single-document validation

The configured simulation preparation bundle now requires `preparation.sdk` rather than an arbitrary `validateOfficial` callback. Provide the absolute trusted `pythonExecutable`, `installationRoot`, `manifestPath`, `javaHome` and independently approved `manifestSha256`; keep the manifest outside the installation and Git. Its JSON fields are exactly `sdkVersion` (4.0.0), `sdkArchiveSha256` (the independently checked archive hash in the fiscal record), `launcher`, `sdkConfig` (both relative paths within the installation) and `files` (every relative regular-file path mapped to lowercase SHA-256). Configure SDK_CONFIG with suitable absolute resource paths inside the isolated SDK installation and pin the resulting reviewed configuration. File modifications, symlinks and unlisted files fail closed; use a read-only install and private temporary output, no real taxpayer data or production credentials. Verify the actual SDK setup and its output independently; do not treat the synthetic IPC fixture as acceptance. See the existing six-document matrix instructions above. The exact validated proof is persisted at preparation, not substituted by logs from a different document. SDK setup background: https://pkg.go.dev/github.com/talha7k/zatca-go/conformance and https://zatca1.discourse.group/t/signing-invoice-issue-private-key-file-is-not-found/8126 (implementation references, not official authorization).


Actual R4.0.0 validation requires FATOORA_HOME pointing to the launcher directory. The validator supplies it automatically. It copies the pinned configuration into private per-invocation temporary storage, replaces privateKeyPath with an intentionally absent path for validation-only, and for simplified documents derives certPath from the exact single embedded public X509Certificate. This is a validation profile, not an authority trust decision. The protected signing session still verifies trust and revocation independently. Do not place real private keys inside an SDK installation. The six basic domestic synthetic cases have now passed official SDK 4.0.0 through this corrected adapter; other statutory scenarios and actual simulation enrollment/acceptance are separate gates.
