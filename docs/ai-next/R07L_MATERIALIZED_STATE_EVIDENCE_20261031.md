# R07L — Transactional materialized operational state (inactive)
Reference date: October 31, 2026.

## Scope and trust

R07L adds a **bounded, latest-turn only** materialized state document inside the already-isolated R07J root collection, in the SAME transaction as each immutable event, event ID, idempotency receipt and head CAS. It does not alter financial storage, legacy AI, provider routes, production Firebase rules, IAM or deployed flags.

The materialized record includes scoped latest turn and task, exact current revision/last-hash/last-event time, whether the latest turn's original user message was observed, and the most recent assistant reply. It includes a deterministic canonical SHA-256 checksum, with strict document-size cap and domain contract validation. A new `readOperationalState` loads just the thread head and model in ONE read-only Firestore transaction; no entire event-history fetch. Its response always marks `completeHistory:false` and `authoritativeForFinancialExecution:false`.

The read model is **not a complete historical snapshot** and cannot replace evidence/approval/financial reconciliation. It is safe only as a current-turn status signal after server identity and company/branch membership have been validated independently. Corruption, missing state for an existing head, revision/hash mismatches and oversized materialization fail closed; **no silent reconstruction or migration**.

Full `auditFullHistory` still verifies all immutable event hashes and R03 domain transitions and, additionally, cross-checks the latest materialized state against the entire reconstructed projection. This expensive audit is used for recovery/evidence, **not every normal read**. SHA-256 is not a keyed MAC and cannot prevent forgery by an administrator with write privileges.

The new model adds an operational document write per event and read transaction overhead. Costs and true p95 latency must be compared against full replay, not assumed better. Long messages remain subject to the 350 KB model cap. Cross-process backup/restore is proven only by local emulator export-import, not production backup/DR.

## Gate boundary

R07K compatibility bridge still uses full replay for each coordinator step. **R07L does not activate an optimized production coordinator**, nor does it accept old R07J streams without materialization. A future coordinator integration may consume the bounded read model after separate contract, authorization and replay correctness tests. Existing 20,000-event R03 ceiling remains. No real bank/accounting writes, PDF, providers, user content, actual security-rule deployment, or mobile device acceptance.

Targets: 320-event bounded operational read parity, task/message state parity, injected missing/tampered state, true Firestore Emulator cross-Admin consistency and restart-export/import recovery. All claims depend on CI evidence. Feature flags remain OFF.
