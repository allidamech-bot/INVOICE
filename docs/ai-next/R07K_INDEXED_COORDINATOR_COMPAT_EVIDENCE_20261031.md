# R07K — Indexed journal / local Controller-Advisor compatibility

Reference: October 31, 2026. Starting main: e94b28525e8863c31eecb0d8af7b9132ce331310.

**Disabled / no production routes / zero financial writes.** New R07KIndexedCoordinatorLedger implements the existing R07B2 snapshot/append contract through the R07J indexed journal. The R07B2 local coordinator's trusted JWT/ACL authorization, local greeting and review-only quotation workflow are unchanged. R07J remains in a distinct new root collection and R07D persists only unsaved quotation drafts under a separate root collection.

The bridge's snapshot() invokes auditFullHistory and its append() invokes indexed R07J CAS followed by full verification before returning the required R03 snapshot. This deliberately protects the original semantics and resuming a request across coordinator instances at the **cost of replaying the full history**. This is an integration/compatibility proof, **not the final fast controller implementation** and not approval to connect it to production. A later durable operational read model is necessary to remove O(history) recovery and projection during each controller step. The bridge always returns a full-audited snapshot; it never passes the R07J narrow receipt as an authoritative history snapshot.

Tests cover greeting, review-only unsaved draft, idempotent replay, simultaneous identical requests, missing draft storage, revoked server ACL, separate coordinator instances, and actual Firebase Admin clients against the official local Firestore Emulator. **All real financial execution remains disabled.** No private model calls, customer content, deployed ACL/rules changes, new HTTP route, or production deployment.

Still open: actual trusted production Firebase membership source/IAM/root-deny rules; file/source end-to-end; durable optimized materialized operational state; cost and time limits on large conversations; real multi-device/physical iPhone acceptance; privacy, retention, backups and T22–T24.
