# LOUREX AI Next — R04 Guarded Financial Drafts and Approval Safety

Date: 2026-10-30
Branch: feature/ai-next-r04-guarded-drafts
PR: #1193
Status: Isolated engineering component, NOT authorized financial execution

## Implemented

- guarded-finance/drafts.ts: document proposals only; immutable revision SHA-256, line ID targeted edits, revisioned undo/redo, no inference of unknown selling price, exact customer/currency/quantity/unit validation, and 120-item limit matching the existing approved finance editor. Review needs every line checked and current source/coverage; file-backed lines additionally require source-linked, human-verified selling-unit-price evidence.
- guarded-finance/approvals.ts: HMAC-bound approval receipts, explicit UI action schema and actor, strict role/account/company/branch/authorization epoch, server-resolved reviewed-draft attestation, signed immutable draft revision, verified current company baseline, source-manifest hash, operation ID, short expiry, idempotent approval/retry, revoke/reject tombstones, and one-operation ID per scope in a synthetic atomic store.
- guarded-finance/tool-policy.ts: narrow read/calculation/prepare allowlist, authoritative permission dependency, deny all execution and unknown tool IDs, Advisor read-only.
- tests/ai-next/r04-guarded-finance.test.mjs: synthetic tests for product pricing, typed draft revisions, physical evidence checks, missing selling prices, mixed currency/units, approval tampering/expiry/stale revision, concurrency/idempotency, tenant boundary, revocation and disabled execution.
- .github/workflows/ai-next-r04-guarded-finance.yml: offline TypeScript, compilation and R01–R04 regression suite.

## Guarantee boundaries

- The code does **NOT** save, issue, post, delete or otherwise mutate an invoice, quotation, inventory, payable, receivable, accounting period or any financial record. Exported execute method throws R04_LIVE_EXECUTION_DISABLED and the tool policy denies execute.
- Neither SyntheticDraftEditor nor SyntheticApprovalStore is persistent across device/process; storage and server-only validation/attestation are not wired into production Firebase.
- The R04 HMAC key is generated for synthetic tests; production keys must reside exclusively in a verified server secret manager with rotation policy.
- An HMAC approval is **not** financial truth. No existing finance mutation API is wired, no domain-level exactly-once ID is verified, and no read-after-write business proof exists. Any future execution remains blocked until R07 verified integration with a transactional ledger and financial domain.
- A bounded 120-line financial editor limit is distinct from the much larger R02 source-processing capacity. Exceeding 120 rows must surface an explicit editor limit and cannot silently truncate.
- The existing client selected operator is not a new trusted role. R04 requires independent server identity and authorized finance ACL and cannot be activated merely by UI approval, model responses, or synthetic unit tests.
- The source-review function assumes caller supplies server-verified coverage/evidence; the real server boundary is not yet implemented. No incomplete/unreviewed/OCR evidence can authorize a quote in this revision.
- No financial data, UI, legacy conversation, Firestore rules, provider config, or Vercel production deployment is changed.

## Required before production acceptance

1. Resolve R00 physical server-only storage/privacy/cost and account authority, then prove DB CAS transactions, global uniqueness, per-business revision, authenticated review attestation and revocation durability on multiple devices.
2. Register a strictly bounded existing-finance adapter with verified role, period lock, stock, VAT, and canonical document rules; finance team must approve any adapter changes. There is NO authorized direct writer in R04.
3. Prove real approved user action, app logout/relogin, duplicate requests across server instances, crash after unknown write, replayed revoked approval, and exact financial read-after-write operation ID. If absent, execution stays disabled.
4. Test real R02 PDF/Excel evidence and human review in Safari/iPhone. Prove matching source/row/price/currency/unit and all pages/rows, including partial OCR and 10 attachments, before allowing save.
5. Complete R05–R07 and independently approve release. No automatic production rollout.

## Review evidence

Final branch SHA and exact GitHub Actions typecheck, synthetic regression counts, Vercel Node isolation and compare-to-main changed-file list must be attached to PR #1193 before a safe **code-only** merge. Passing these tests is not proof of live financial execution.
