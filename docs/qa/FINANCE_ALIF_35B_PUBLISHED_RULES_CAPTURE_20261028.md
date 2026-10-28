# LOUREX INVOICE — Plan Alpha axis 35-B, published Firestore Rules capture

Date: 2026-10-28
Status: **TOOL PREPARED; LIVE RULES NOT CAPTURED; NOT SECURITY-APPROVED.**

## Financial/security lane and evidence boundary

This task is **read-only**. The current checked-in `firestore.rules` is NOT proof of the rules currently published in Firebase project `lourex-invoice`. No production security incident or cross-UID leak is asserted from the incomplete 26 October console excerpt. The isolated local Firebase Emulator tests are useful historical evidence, but neither prove deployed-rule parity nor authorized real two-UID isolation (35-C).

## Authorized operator procedure (no paid browser needed)

From the **current reviewed GitHub checkout**, an operator with *read-only Firebase Rules permissions* may use Google Cloud Shell with their **own secure Google session**. The operator must first verify the target project is exactly `lourex-invoice` and the local `firestore.rules` is from the intended reviewed commit. Do not paste an access token, account UID, secret, service-account key or business data into chat, GitHub or CI.

Run only:

```bash
node scripts/inspect-live-firestore-rules.mjs
```

This script calls the Firebase Rules API using GET for the default database's **published** release, GET for its referenced ruleset source, then GET for the published release **again**. If the release identity or update time has changed between reads, it refuses to label the first source as current and stores no evidence. It never calls Firebase data read/write endpoints, deploys rules or obtains owner business records.

When the read-only operation succeeds it saves **three private mode-0600 files** under `~/lourex-firestore-rules-backups/`:

1. `*.rules` — exact complete published rules source (do **not** publish or upload).
2. `*.review.diff` — private full contextual `diff -u` compared to that checkout's `firestore.rules`, with published lines marked `-` and checked-in lines `+`; this is **not** an automated risk assessment.
3. `*.evidence.json` — published release name and time, ruleset name and creation time, source hashes, stable-release recheck, difference status, private diff SHA-256 and required independent-review status; **no rules contents or bearer credentials**.

Compare the whole access-policy structure, including:
- `/users/{userId}`, the recursive read match and the deeper `/{collectionId}/{document=**}` write match;
- `periodStaging`, `accounting`, `workspace`, `vault`, period collections and any more-specific or overlapping wildcard matches;
- `/publicShares/{shareId}` and all get, list, create, update, delete privileges;
- anonymous users, employee claims, disabled/revoked sessions, and the actual two-UID behavior in separately approved QA.

**Evidence outcome:** a byte-identical source means only that this retrieved ruleset matches the checkout. It is NOT a cross-UID test or security approval. Any source difference carries `SOURCE_DIFFERENT_RISK_NOT_ASSESSED` until a qualified reviewer inspects the *private* diff; do not claim a confirmed leak from mismatched or incomplete source excerpts. Even after parity, 35-C needs two authorized real QA identities.

## Release and reviewer gates

The operator must record a trusted UTC capture time, exact checked-out SHA and Firebase release/ruleset identities. A separate security reviewer must inspect the complete retrieved source and sign findings in controlled evidence storage, with no exposed rules source in ordinary PR logs. The finance owner must keep accounting activation **NO-GO** until deployed security controls and 35-C are verified independently. Never publish new Firebase rules, enable GL posting/period close, or touch real customers based on this report.

## Focused non-live tests

The `finance-firestore-rules-evidence.yml` workflow runs pure published-source evidence validation and a **mock-only** Cloud Shell script test. It verifies GET-only behavior, secret avoidance, full private diff generation, and rejection if a release changes during retrieval. No actual Google or Firebase credentials are used. Success proves the inspection mechanism only, not the current live rules.

Scope: Plan Alpha 35-B and future evidence for 39–40; axis 4 deferred and all LOUREX AI work excluded.
