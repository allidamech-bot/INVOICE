# LOUREX fiscal QA preview: keyless command/status identity (candidate only)
Date: 2026-11-21. Branch: feat/fiscal-batch2-remaining-settlements. PR #1287 stays **Draft**.

## Why this is required
Existing fiscal preview `command-runtime.js` and `status-runtime.js` required long-lived Google service-account JSON private keys and could not safely drive a keyless QA acceptance. Their backend Firebase Admin composition now uses scoped Vercel Preview OIDC → Google Security Token Service (STS) → short-lived impersonation of a **dedicated QA service account**. This is limited to tax invoice command/status routes, not the rest of the website. The production fiscal profile and production Vercel OIDC implementation remain **unchanged**.

## Identity design and locked scope
- QA database: `lourex-fiscal-qa`; production database: `lourex-invoice`. Never cross.
- QA impersonated service account (candidate, not installed): `lourex-qa-vercel@lourex-fiscal-qa.iam.gserviceaccount.com`.
- Identity-only source project `lourex-invoice`, Google Workload Identity Pool `lourex-vercel`, new preview-only provider ID `vercel-qa`. The existing production provider ID `vercel` is **not modified**.
- The expected Vercel token subject is `owner:alidaamishs-projects:project:invoice:environment:preview` with Google-enforced `assertion.sub` AND Vercel `project_id` conditions. The token issuer must be the team issuer, `https://oidc.vercel.com/alidaamishs-projects`, and the expected audience `https://vercel.com/alidaamishs-projects`.
- Firebase Admin uses ADC `external_account` for the above preview provider, not `cert(private_key)`. The platform-supplied server OIDC token is refreshed into a 0700 temporary folder with private file permissions; it is never returned to a browser, persisted in GitHub, placed in Firestore or logged.
- The preview service account receives only QA `roles/datastore.user` and `roles/firebaseauth.viewer` for revocation-aware QA Firebase token checking. It receives **zero** production Firestore IAM.
- The existing HTTP handlers still require HTTPS same-origin, explicit owner Firebase Auth ID token, verified active QA project and scoped Firestore owner/workspace/EGS controls. A Vercel workload token alone never authorizes an end user.

## Activation gates and current non-readiness
1. **Review only:** inspect `scripts/fiscal/prepare-google-qa-preview-wif.sh` before any Google Cloud command. Its preflight checks exact Google project numbers, isolated QA database, and billing **disabled**. It is *not executed by this commit*. Script creates only the new provider, candidate QA service account and QA-only IAM. It verifies the existing production provider configuration has not changed. The identity project must have permissions to create a new provider; no keys or billing are created. This is separate from the **already passed** EC2 AWS WIF and AWS QA Firestore data-plane smoke acceptance.
2. **Preview-only config, not production:** fiscal QA preview would require `LOUREX_FISCAL_QA_AUTH_MODE=vercel-oidc`, QA project ID and fiscal status/commands gate flags, plus valid server OIDC token. No production deployment is changed here and **no environment flag is set**.
3. **QA auth user:** a synthetic QA owner Firebase user and authorized synthetic workspace/EGS must exist. This is NOT established by the passed AWS Firestore read. The existing production ID token must **never** be reused as a QA token.
4. **Remote runtime acceptance:** verify actual Vercel Preview → Google STS impersonation, QA-only read/write permissions and explicit production **denial**, revoked Firebase owner token rejection and synthetic queue dispatch. No such test has run.
5. **External authority acceptance:** real ZATCA Simulation CSID, validated trust and SDK4 compliance vectors, clearance/reporting, receipts, ledger and offline PDF/A acceptance remain separate gates. No live issuance, no taxpayer OTP, no real account keys.

## Tests and truth
`tests/fiscal-qa-vercel-federation.test.mjs` uses synthetic unsigned-header/claim fixtures to test prefilter rejection and ADC configuration only. Google STS is the **actual** signature and provider-condition verifier. The source and the test were copied byte-for-byte from GitHub blobs and passed **3/3** local Node22 tests. **No remote WIF acceptance or status/command integration tests have been run**. The other candidate integration tests are included but must pass in the project’s full test environment before any merge.

References: https://vercel.com/docs/oidc/reference ; https://vercel.com/docs/oidc/gcp ; https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation

Owner constraint: all changes are tax/ZATCA-specific. Do not fix, restart, redesign, deploy or troubleshoot unrelated LOUREX website services under this PR.
