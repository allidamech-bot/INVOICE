# LOUREX — read-only QA Preview WIF acceptance boundary

Date: 2026-11-21. Scope: fiscal QA only, not platform deployment or live taxpayer invoicing.

## What is already implemented

The isolated QA command/status runtimes already use the keyless Vercel-preview
OIDC federation adapter in `api/_fiscal/vercel-qa-federation.js`. Its
Firebase Auth audience is `lourex-fiscal-qa`, and Google impersonation is
pinned to `lourex-qa-vercel@lourex-fiscal-qa.iam.gserviceaccount.com`.
The underlying source project `lourex-invoice` hosts only the identity
provider; it must never grant the QA Vercel principal production Firestore
access. The client-side ID token must be independently verified by Firebase
Admin with the isolated QA issuer and revocation check.

## New offline-safe operator observation

An authorized Google operator with **read permissions** on both projects may
run from the reviewed repository checkout:

```sh
node scripts/fiscal/audit-google-qa-preview-wif.mjs
```

The script uses `spawnSync` (not a shell) to run **read-only**
`gcloud projects describe`, `gcloud billing projects describe`,
`gcloud firestore databases describe`,
`gcloud iam workload-identity-pools providers describe`,
`gcloud iam service-accounts describe/get-iam-policy` and
`gcloud projects get-iam-policy`.

It verifies pinned:
- QA project/default native Firestore, project numbers and billing **disabled**.
- Vercel preview OIDC provider issuer, audience, subject attribute mapping
  and exact project/environment attribute condition.
- Single approved preview-subject impersonation grant on the QA service account.
- Exactly `roles/datastore.user` and `roles/firebaseauth.viewer`
  directly granted to that QA principal **in QA**.
- No direct production-project IAM role for that QA service-account principal.

IAM policy JSON, account tokens and personal information are **never printed**.
Missing read permission, invalid/extra principal, broad IAM privilege,
conditional grant, absent default QA Firestore, or changed billing returns a
sanitized HOLD code. No script change is authorized to make an invalid live
configuration appear passing.

## Interpretation

`CONFIG_VERIFIED_ONLY` is deliberately **not** a release approval.
This read-only snapshot cannot prove inheritance/organization IAM, a
cryptographically verified Vercel -> Google STS exchange, QA Firebase Auth ID
token issuer/expiry/revocation acceptance, real synthetic-only source
fixtures, the signed official SDK package on EC2, authorized ZATCA Simulation
CSIDs, official clearance/reporting receipts, key backup/restore, or an
operational trusted worker.

No Google policy change, billing activation, token creation, EC2 start,
Vercel deployment, authority request or production taxpayer operation occurs.

**Release disposition:** HOLD external acceptance until the authorized
operator separately confirms the above. The QA observation is distinct from
production and must not be reused as a ZATCA production eligibility claim.
