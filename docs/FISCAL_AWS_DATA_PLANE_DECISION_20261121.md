# LOUREX AWS fiscal staging — isolation and worker gates (2026-11-21)

## Confirmed evidence and boundary

The owner verified EC2 role attachment, official SDK4, persistent synthetic SoftHSM signatures, integrated LOUREX-generated XML, and the AWS → Google STS → IAMCredentials identity chain. The owner subsequently executed the isolated Cloud Shell bootstrap and its output confirmed QA Firebase, native default Firestore, disabled billing, QA service-account creation and WIF binding. Those reported passes stand. **EC2-to-QA Firestore read and explicit production-denial test both passed by owner-observed AWS execution. Persistent worker service, full ZATCA Simulation cycle and taxpayer approval remain unverified.** PR #1287 remains Draft.

The existing identity project is lourex-invoice (project 985119320046). Its existing provider is lourex-aws-staging / ec2-staging. The identity-only service account in that project must continue to have **no Firestore data permissions**. Existing Vercel federation is untouched.

The fiscal runtime requires an independently operated *-fiscal-qa project with a separate (default) Firestore and Firebase Auth audience. The project `lourex-fiscal-qa`, number `448656707310`, is now confirmed ACTIVE. The Cloud Shell bootstrap reported Firebase enabled, default native Firestore available and billing DISABLED. The QA Firebase Auth issuer and Vercel preview command authentication are not yet proven. Do not merely grant the AWS service account Datastore User on lourex-invoice: Admin SDK bypasses client security rules, and Firestore IAM does not securely partition document collections inside the same default database.

Google supports cross-project service-account impersonation from an existing Workload Identity pool. The existing QA project now reuses the verified WIF provider, without a second EC2, pool or provider. The owner-run Cloud Shell bootstrap created the separate service account `lourex-aws-worker@lourex-fiscal-qa.iam.gserviceaccount.com` and reported binding QA-scoped `roles/datastore.user`, with no role granted on `lourex-invoice`. The owner subsequently verified the EC2 data plane under the restricted `lourex-staging` identity, including a QA Firestore read and production Firestore denial. This is **data-plane isolation evidence**, not a full fiscal end-to-end pass.

**Cost decision:** Firestore grants a free quota to only one database per project. A second named database in the existing production project requires billing, so is not an approved zero-billing solution. A separate Spark Firebase QA project may remain within free-tier quotas, subject to the actual account and project eligibility. No project creation or billing is authorized or performed by this change.

## Repository engineering (not deployed)

- api/_fiscal/staging-service-supervisor.js: single-flight sequential polling for an explicit, immutable list of synthetic account/workspace/EGS scopes. Rejects production, duplicate/broad scopes, malformed counters and partial worker failures.
- scripts/fiscal/run-aws-staging-worker.mjs: outbound-only fail-closed worker bootstrap with root-owned config and trusted runtime adapter. No fallback fake authority or crypto verifier. Both the real isolated QA Firestore data plane and independently reviewed adapter are required for startup.
- deploy/fiscal/lourex-aws-staging.service: hardened candidate systemd unit for the existing restricted Linux account, with restart and shutdown controls. Installation/start and actual Node path verification are pending. It is not an active service.
- scripts/fiscal/probe-aws-firebase.mjs and api/_fiscal/staging-aws-firebase.js: pinned existing WIF audience; QA-only read probe and short-lived ADC impersonation; static private keys disallowed.
- scripts/fiscal/prepare-google-staging-identity.sh: must be run only AFTER a separate QA Firebase project/default Firestore are confirmed. Uses existing WIF from lourex-invoice, creates or reuses a service account ONLY inside QA and grants Datastore User ONLY inside QA.
- Existing ledger/outbox logic preserves durable exclusive claim, response receipts, and held/uncertain recovery without re-submission. No claim of new integrated success is implied by the new supervisor.


## Additional Vercel command-plane gate

Repository review confirmed that api/_fiscal/command-runtime.js and api/_fiscal/status-runtime.js currently require QA service-account JSON private keys and a separate QA Firebase Auth issuer. This is NOT compatible with the desired keyless final architecture. A valid QA database and AWS worker alone will not make the customer-to-worker flow functional.

The current api/_accounting/vercel-federated-credential.js is strictly pinned to the *production* Vercel project/environment and production-associated Google service account. Do not reuse its production token for QA or loosen its production restrictions. A separately audited preview-compatible keyless credential path or a secure authenticated command broker must be completed and accepted before exposing QA customer commands. The existing production Vercel IAM binding must remain untouched. Neither preview identity nor end-to-end command issuance is verified by the AWS identity tests.

## Required before enabling the worker

1. QA Firebase project, Firestore and billing-disabled bootstrap are **complete by owner Cloud Shell evidence**. Still required: synthetic-only workspace fixtures and a verified separate QA Firebase Auth issuer. Do not activate billing or create a database in the production project.
2. QA-only service account WIF binding, positive AWS QA read and explicit denied production read under the same temporary QA principal are **complete by owner AWS/Cloud Shell evidence**. No production Firestore grants were applied by the setup scripts.
3. Independently reviewed root-owned /etc/lourex-staging/runtime-adapter.mjs implementing actual trusted Simulation certificate chain, CRL, SDK manifest/classpath, staging signer, credential/transport adapters, approved scopes, and certificate trust. No simulated substitute for official authority receipt.
4. Root-controlled worker.json, ADC and secrets; verify absolute Node binary on current EC2. Protect and back up SoftHSM tokens, key-binding registry, wrapping and PIN-derivation secrets as one consistent set. Perform restoration and synthetic signing/decryption check on an isolated restore target. None of these are yet claimed complete.
5. QA end-to-end command → Outbox → EC2 worker → certificate-bound signing → SDK4 → real ZATCA Simulation response → durable evidence → accounting/sync; include standard/simplified, duplicate requests, interruptions, receipt verification, PDF/PDF-A and security. Do not infer these passes from prior component tests.

**Release disposition:** KEEP DRAFT; NO MERGE, NO PRODUCTION DEPLOY, NO REAL TAXPAYER ENROLLMENT, NO NEW BILLING.

## 2026-11-21 — AWS data-plane smoke gate prepared

- `scripts/fiscal/probe-aws-qa-data-plane.mjs`: bound to exact WIF audience, QA project/service account and IMDSv2. Read-only SDK probe of a non-customer QA document, followed by a **denied-production-read requirement** on another deliberately absent non-customer document. An empty production document with a successful read is treated as a security failure. Network/404/unknown errors are **not** accepted as proof of denial. No credentials or raw errors are logged.
- `scripts/fiscal/check-aws-qa-data-plane-on-ec2.sh`: single EC2 preflight for the existing instance/role/Node24/user/deps. Downloads the git-blob-pinned probe, creates only the public keyless QA ADC configuration under `/etc/lourex-staging/aws-adc.json` if absent (never overwrites mismatched config), and executes the nonmutating data-plane probe as `lourex-staging`. No SDK/tool reinstallation, service startup, real taxpayer data, ZATCA call, inbound port change, infrastructure creation or billing changes.
- That original preflight failed on the home-directory access boundary. A subsequent isolated-runner acceptance passed; see the accepted evidence below. Enrollment and dispatch must remain disabled until the separate worker and end-to-end gates pass.


## 2026-11-21 — Confirmed restricted-user home-directory denial and isolated fix

The owner executed the exact pinned EC2 smoke check. Actual EC2 marker:
`LOUREX AWS QA PROBE FAILED: NODE_PACKAGE_ACCESS_FILESYSTEM_PERMISSION_DENIED`.
This confirms the **lourex-staging service user cannot read the package.json via the Ubuntu-owned checkout path**. No Google/Firebase data-plane request was made during that failing cycle. Do not infer Firestore permission defects or repeat Cloud Shell provisioning.

The old preflight checked dependencies with the Ubuntu shell and the smoke probe then tried to access `/home/ubuntu/lourex/package.json` as `lourex-staging`. The repair makes the probe resolve its package relative to its own isolated runtime directory. `scripts/fiscal/run-isolated-aws-qa-check.sh` copies the **existing** Node dependencies into a freshly created temporary restricted directory, checks the pinned Git blob, provides a root-owned group-readable copy, executes the probe as `lourex-staging` and removes all temporary files. It never recursively chmods or chowns `/home/ubuntu`, grants new IAM privileges, alters the existing SoftHSM tokens, calls ZATCA, installs Node or enables any service. The temporary-copy probe is for read-only QA data-plane and production-denial acceptance **only**, not the production worker.

For eventual persistence, `deploy/fiscal/lourex-aws-staging.service` now targets an **unprovisioned, candidate, immutable root-owned** application release at `/opt/lourex-fiscal/current`. Do not install/start that unit until the release directory actually exists, has reviewed contents/dependencies, real trusted adapter and secrets, and all stated authorization/restore gates pass. Never make `/home/ubuntu` world-traversable merely to run a service.

The owner executed the isolated EC2 runner and the QA read + production-denial checks **passed**. This resolves the data-plane smoke gate, but does **not** prove that the persistent worker, ZATCA Simulation, backing-up/restoring keys, Vercel commands, accounting/sync, PDF-A or production compliance gates have passed.


## 2026-11-21 — ACCEPTED: EC2 QA data-plane and production isolation

Owner-provided AWS EC2 Instance Connect screenshot at approximately 03:15 Europe/Istanbul on 2026-11-21 shows execution of the SHA-pinned `scripts/fiscal/run-isolated-aws-qa-check.sh` on existing instance `i-05530aee6c25c984e`. The accepted terminal output is:

```text
LOUREX AWS QA FIRESTORE READ PASSED
LOUREX PRODUCTION FIRESTORE ACCESS DENIED AS REQUIRED
LOUREX AWS QA DATA PLANE READY
LOUREX AWS QA AND PRODUCTION ISOLATION PASSED
NO SYSTEMD/PRODUCTION/ZATCA CHANGES
```

Interpretation: the restricted Linux identity could execute the QA client with a temporary, locally copied, group-restricted Node dependency tree; AWS federation into the isolated QA service account produced sufficient permission for a read of the deliberately non-customer QA probe document. An attempted read of an equally non-customer location in `lourex-invoice` was rejected by Google as a permission denial, rather than mistaken for a missing document or network failure. The helper deleted its temporary copy and did not install/start systemd, make a ZATCA request, alter IAM or deploy production.

This result **closes the previously failing NODE_PACKAGE_ACCESS_FILESYSTEM_PERMISSION_DENIED smoke gate** without widening the Ubuntu home directory. It does not prove that the final root-managed `/opt/lourex-fiscal/current` worker release has been provisioned or that its protected cryptographic secrets and trusted adapter are configured. It does not prove cross-device sync, the complete issuance workflow, restart backup/restore, or regulatory production eligibility. Keep PR #1287 DRAFT; no merge or release.
