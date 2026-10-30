# R07H — Real Firestore Emulator acceptance (isolated)

This gate upgrades R07G evidence from a handcrafted Firestore mock to a **real Firebase Admin SDK** connected to the official **local Firestore Emulator** running in GitHub Actions, with a `demo-` project ID and `FIRESTORE_EMULATOR_HOST` guard.

Scope: completely synthetic business identity and events. Tests cover 99 events crossing the 96-event chunk boundary, exact reconstruction from two distinct Firebase Admin app instances, idempotency replay, concurrent write conflict, tenant/authorization-version isolation and fail-closed corrupted historical chunks. No network access to any live Firebase project is authorized.

The workflow pins Node 24, Java 21, and Firebase CLI 14.16.0, and uses a separate emulator-only JSON configuration without modifying the repository's main Firebase configuration. The Firestore emulator may download its binary in CI.

**Boundaries:** Firestore Emulator is not production Firestore. It cannot certify real-service IAM, deployed Firestore rules, production ACL membership records, encryption/retention/cost policy, physical-device persistence, backup/restore or financial execution. This test creates no customer records. It does not enable `R07G_PRODUCTION_SHARDED_STORAGE_ACTIVATED`. T22/T24 remain open.

Cross-instance here means two separate Admin SDK app clients using the same emulator, not distinct deployed servers, processes or devices. Full-history R03 projection remains a performance bottleneck.
