# LOUREX — AWS persistent fiscal worker, next-stage engineering handover
Date: 2026-11-21. Branch: feat/fiscal-batch2-remaining-settlements. PR #1287 must remain Draft.

## Completed, supported by actual owner AWS evidence
The existing t4g.small EC2 i-05530aee6c25c984e has an attached lourex-zatca-staging-wif IAM role; AWS identity federation → Google STS → short-lived IAMCredentials impersonation passed. The separate project lourex-fiscal-qa (448656707310) has a Native (default) Firestore with billing disabled. The owner executed the isolated staging QA read and production-denial probe, returning:
- LOUREX AWS QA FIRESTORE READ PASSED
- LOUREX PRODUCTION FIRESTORE ACCESS DENIED AS REQUIRED
- LOUREX AWS QA DATA PLANE READY
- LOUREX AWS QA AND PRODUCTION ISOLATION PASSED

The verified official ZATCA SDK4, synthetic SoftHSM signing, CSR and local LOUREX-generated invoice XML/SDK validation remain intact. These are **component passes**, not end-to-end ZATCA Simulation approval.

## New candidate persistent worker engineering (repository only, not installed)
- api/_fiscal/aws-worker-configuration.js pins exact QA project, exact QA service account, existing WIF provider, root-managed ADC path and finite synthetic account/workspace/EGS allowlist.
- The worker now requires a **third, explicit** operator flag LOUREX_AWS_DISPATCH_APPROVED=true in addition to the existing staging and worker flags. This third flag is intentionally absent from the candidate systemd unit and MUST NOT be set before full Simulation acceptance.
- /etc/lourex-staging/worker.json must specify exactly projectId, serviceAccount, audience, adcPath, scopes and profileSha256. The last field must be the SHA-256 of the independently reviewed root-owned /etc/lourex-staging/trusted-runtime-profile.json. An arbitrary root-owned executable adapter is **no longer loaded**.
- api/_fiscal/aws-trusted-runtime-profile.js validates the existing staging runtime's input contract and binds that original implementation, without substituting a fake SDK, signer, transport, certificate validator or clearance verifier. Trust material is root-owned, symlink-free, SHA-256 pinned and located under /opt/lourex-fiscal or /etc/lourex-staging. Certificate material is also bound to the exact QA account, workspace, EGS and credential leaf digest. Each scope remains subject to readStagingContext's Firestore tenant/EGS authorization checks.
- systemd credentials, not environment strings, supply the wrapping and PIN-derivation master keys. Only /run/credentials/lourex-aws-staging.service is accepted. The candidate service runs lourex-staging, ProtectHome=true, read-only application code, private writable token/state storage and outbound-only network operation.
- The process invokes the existing createStagingFiscalRuntime which uses the existing persistent SoftHSM key registry, authorized enrollment, SDK4, credential vault, immutable ledger/outbox, idempotency and uncertainty recovery. Failures stop the process, and service restart cannot simply retransmit a held/uncertain attempt.
- Local focused tests: 6/6 passed on Node 22 for QA config and pinned profile contract, scope/tenant rejection, no default trust, credential-directory checking, evidence digest checking and the existing runtime factory binding. These are **isolated tests**, not proof of installed service, final SDK invocation or live ZATCA transport.

## Exact release blockers, grouped (no pointless repeated setup)
1. **Root-managed immutable release:** The existing tested SDK4 and Python virtualenv are currently under /home/ubuntu; ProtectHome=true intentionally prevents worker access. Provision reviewed, SHA-checked copies under /opt/lourex-fiscal on the EXISTING EC2 and install the reviewed worker code there. This has NOT been performed. Confirm the actual Node24 binary path before unit installation.
2. **Authorized Simulation trust and certificate profile:** Independently review approved ZATCA Simulation root/EGS certificates, CRLs, policy document, classpath and official SDK4 installation manifest. Supply their exact hashes in a root-owned profile with known account/workspace/EGS. An actual Simulation CA and valid non-expired CRL are required. No invented trust anchors or fabricated approval. Currently not supplied or approved.
3. **Root-managed secrets and protected restore:** Confirm existing SoftHSM keys/binding registry, wrapping and PIN secret files, secure backups and isolated restoration; test CSR, signed XML and decrypt after restore. No live taxpayer keys. No backup/restore pass has been evidenced.
4. **Authenticated QA commands:** Existing Vercel preview command/status code still expects long-lived QA service-account JSON keys. Do not reuse production Vercel identity or enable QA commands with static private keys. Complete and verify a separate keyless QA command authentication path and synthetic-only workspace data.
5. **Full acceptance:** Authorized owner/EGS enroll → CSR → genuine ZATCA Simulation CSID and certificate lifecycle → standard clearance and simplified reporting with exact XML SDK4 checks → immutable receipt/outbox recovery/duplicate and interruption rejection → accounting, PDF/PDF-A and cross-device sync. No fake or developer sandbox response may count as final operational pass. Validate Saudi privacy, retention and software-key acceptability before any real taxpayer.

## Go/no-go
KEEP PR #1287 DRAFT. No production deployment, merge, service activation, paid infrastructure, real taxpayer onboarding or OTP yet. The AWS–QA data-plane gate is DONE; the five release blocks above are NOT DONE. Avoid asking the owner to repeat AWS IAM, Google WIF, Cloud Shell project creation, SDK4/SoftHSM component tests or the passed AWS Firestore read/isolation check.
