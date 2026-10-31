# R07M/R07D Two-Root Actual Firestore SDK Reconciliation

October 31, 2026. Production remains disabled. This change supplies additional **official local Firestore Emulator** evidence only.

## Objective

Verify a single synthetic Arabic review-edit request across an authenticated R07M journal and an independent R07D review draft store, with two independent real Firebase Admin SDK clients talking to the *same local demo Firestore Emulator*. The test intentionally commits R07D first and omits the R07M checkpoint to simulate a lost network acknowledgement. A second client then verifies the R07D receipt, writes the checkpoint, and a later retry is idempotent.

## Scenarios

- End-to-end local quotation draft, synthetic semantic turn, verified customer review edit, missing audit checkpoint, recovery on another client and idempotent retry.
- Two real Admin SDK clients concurrently append the same audit checkpoint; exactly one event is created.
- No pre-existing draft edit receipt: checkpoint rejected without fabricated success.
- Changed expected hash or foreign branch: rejected.
- Revoked company/branch membership: no receipt replay.
- Corrupted immutable applied receipt hash: fails closed without checkpoint.

## NOT proven

Firestore Admin bypasses client security rules. These tests do NOT authorize production Firebase access or prove production IAM, deployed Firestore security rules, encrypted cloud storage, paid provider behavior, real customer master data, mobile Safari, multi-device user authentication or final user-facing natural edit outcome. There is no common transaction across R07M and R07D; recoverability is the tested goal. T22/T23/T24 and production activation stay OPEN.

No finance files, provider configurations, live Firebase project, Vercel settings, production flags or customer data are changed. The final GitHub Actions run determines exact acceptance results.
