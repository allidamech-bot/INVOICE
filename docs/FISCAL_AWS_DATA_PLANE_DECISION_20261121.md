# LOUREX AWS fiscal staging — isolation and worker gates (2026-11-21)

## Confirmed evidence and boundary

The owner verified EC2 role attachment, official SDK4, persistent synthetic SoftHSM signatures, integrated LOUREX-generated XML, and the AWS → Google STS → IAMCredentials identity chain. Those prior acceptance checks stand. **No live QA Firestore data plane, persistent worker service, final authority Simulation cycle or production taxpayer approval has been verified.** PR #1287 remains Draft.

The existing identity project is lourex-invoice (project 985119320046). Its existing provider is lourex-aws-staging / ec2-staging. The identity-only service account in that project must continue to have **no Firestore data permissions**. Existing Vercel federation is untouched.

The fiscal runtime requires an independently operated *-fiscal-qa project with a separate (default) Firestore and Firebase Auth audience. No such project is verified to exist. Do not merely grant the AWS service account Datastore User on lourex-invoice: Admin SDK bypasses client security rules, and Firestore IAM does not securely partition document collections inside the same default database.

Google supports cross-project service-account impersonation from an existing Workload Identity pool. An isolated QA project can reuse the already verified WIF provider (no second AWS instance, pool or provider). The replacement QA provisioning script verifies the pool and the preexisting QA project before granting a QA-only role and never grants a role on lourex-invoice.

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

1. Owner-approved independent QA Firebase project with a verified default database, synthetic-only workspace fixtures and separate Firebase Auth audience. Do not create a named Firestore database or activate billing in the live project.
2. QA-only service account authorization to the existing WIF principal, positive QA read and negative production read tests. No production Firestore grants.
3. Independently reviewed root-owned /etc/lourex-staging/runtime-adapter.mjs implementing actual trusted Simulation certificate chain, CRL, SDK manifest/classpath, staging signer, credential/transport adapters, approved scopes, and certificate trust. No simulated substitute for official authority receipt.
4. Root-controlled worker.json, ADC and secrets; verify absolute Node binary on current EC2. Protect and back up SoftHSM tokens, key-binding registry, wrapping and PIN-derivation secrets as one consistent set. Perform restoration and synthetic signing/decryption check on an isolated restore target. None of these are yet claimed complete.
5. QA end-to-end command → Outbox → EC2 worker → certificate-bound signing → SDK4 → real ZATCA Simulation response → durable evidence → accounting/sync; include standard/simplified, duplicate requests, interruptions, receipt verification, PDF/PDF-A and security. Do not infer these passes from prior component tests.

**Release disposition:** KEEP DRAFT; NO MERGE, NO PRODUCTION DEPLOY, NO REAL TAXPAYER ENROLLMENT, NO NEW BILLING.