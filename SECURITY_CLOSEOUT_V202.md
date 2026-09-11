# LOUREX Invoice Security Closeout v202

This release hardens the application without changing accounting formulas, document schemas, Firebase ownership rules, printable template design, or encrypted vault compatibility.

## Included in code

- Fresh workspaces default to a 15-minute inactivity lock while existing explicit preferences remain compatible.
- Sign-out removes the persisted device CryptoKey while preserving encrypted vault data.
- New account creation uses a shared 12-character minimum password policy and rejects trivial repeated-character passwords.
- Password-reset success messaging is account-enumeration neutral.
- The AI background-removal proxy requires same-origin browser intent, validates real image signatures, bounds request/output sizes, and applies best-effort per-instance abuse limiting.
- Production headers add stricter transport and cross-origin protections while preserving the existing self-only script CSP.
- `.gitignore` blocks common secret, credential, and platform metadata files.
- CI now runs `npm audit --audit-level=high` and a LOUREX-specific static security gate before typecheck/tests.
- PWA runtime generation is advanced to v202 and precaches the new account-security module.

## External controls still required

These cannot be safely enabled from repository code alone and must be configured in their owning control planes:

1. Protect GitHub `main` with required pull requests and the LOUREX Invoice CI status check; disable direct pushes/force pushes.
2. Enable Firebase App Check for the web app (prefer reCAPTCHA Enterprise for new web integrations), observe metrics, then enforce it for Firestore and supported Authentication flows.
3. Configure Firebase Authentication password policy and email-enumeration protection server-side so the backend enforces the same or stronger policy than the client.
4. Restrict the Firebase Web API key to the required Google APIs and approved web origins in Google Cloud.
5. Add a platform-level rate limit/WAF rule for `/api/remove-background`; the in-process limiter is intentionally only a secondary best-effort layer in serverless environments.

## Residual architecture note

The account-managed vault secret is stored under the authenticated user's Firestore path so the same account can recover encrypted data across devices. This protects data at rest from ordinary storage disclosure but is not a zero-knowledge design against a fully privileged Firebase administrator. Changing that trust model requires a separate key-recovery architecture and migration plan and is intentionally outside this compatibility-preserving release.
