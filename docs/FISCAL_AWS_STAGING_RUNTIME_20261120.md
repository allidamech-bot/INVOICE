# AWS fiscal staging continuation — 2026-11-20

Scope: existing PR #1287; no production activation or merge.

## Implemented candidate

- Local AES-256-GCM envelope key wrapping with tenant, EGS, reference and credential-kind associated data. The existing Firestore vault keeps the encrypted credentials. An independent binary wrapping secret is required; never upload it into GitHub, Firebase or Vercel.
- Software PKCS#11 persistent token/key identities, deterministic per-EGS PIN domains derived from a separate 32-byte secret; immutable local digest receipt; explicit trusted provisioning approval; no reinitialization of an existing token. Loss of a previously recorded token must fail, not create a replacement.
- Separate enrollment/session constructors for SOFTWARE_PKCS11_STAGING. The original hardware and production paths remain unchanged. Certificate chain, CRLs, identity and signature checks remain mandatory.
- Staging runtime composes the existing simulation enrollment, commercial preparation, official SDK local validation, ledger, attempt receipts, and independent clearance verifier. It requires approved synthetic fixtures and trusted certificate identity/chain resolver. No fabricated trust or developer portal equivalence.
- Existing Outbox gets an explicit owner-approved dispatch request bound to document/UUID/version/artifact/snapshot/EGS. Atomic ledger claim is required before network dispatch. Recovery after five minutes moves interrupted calls to uncertainty, never resubmits. A held result may reconcile only against the immutable durable receipt. The Vercel opt-in QA flag is LOUREX_FISCAL_AWS_QUEUE_ENABLED; do not enable before integration acceptance.
- AWS ADC adapter requires an isolated *-fiscal-qa project, exact workload identity audience and QA service account, IMDSv2 and short-lived Google access tokens. It rejects static AWS credential environment variables and production project use. The AWS IAM instance role, GCP federation provider and permissions must actually be provisioned and proved before this can run.

## Service/backup boundary

Do not generate any taxpayer keys or use production credentials. Persistent service identity is lourex-staging. Separate root-managed credentials (wrapping key, PIN derivation secret) must be loaded with systemd credentials, not environment variables. Use root-owned code, SDK, Java classes, certificate pins and ADC config; allow writes only to the private state/token directories. No inbound HTTP listener is needed. Before enabling a persistent worker, configure and verify exact isolated Firebase project, AWS role and provider, approved scope list, independently verified ZATCA Simulation trust and identity resolver, pinned SDK manifest and clearance verification. No paid resource is automatically created. Service deployment, restart and live Firestore testing remain pending.

Back up the two independent secrets, token directory and immutable local binding registry as a consistent protected set (stop provisioning during copy); retain encrypted off-instance copies with restricted access and independently verified hashes. Restore into an isolated instance/directory, compare every bound public-key digest against the immutable Firestore configuration, and prove a synthetic signature plus credential decrypt before re-enabling dispatch. Do not regenerate a lost bound key; revoke/re-enroll via independently approved lifecycle. No backup snapshot or export was taken by this change, and neither rotation nor cross-instance restoration should be declared proven until tested.

## Acceptance boundary

The already verified SDK4 installation and earlier smoke evidence remain intact. New targeted tests: staging envelope, AWS ADC boundary, persistent SoftHSM key acceptance, modified enrollment/signing/ledger regressions. The new runtime has not been run against AWS, Firestore or Simulation; no integration, PDF, production, real taxpayer or regulatory compliance pass is inferred. Production remains on release hold. Do not enable real OTP or remove transient objects until the server SDK is confirmed retained.
