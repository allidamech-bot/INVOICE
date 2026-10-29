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

## 28 October follow-up — Git checkout provenance

The inspector now verifies a real Git `HEAD` and checks that the local
`firestore.rules` bytes equal `git show HEAD:firestore.rules` **before**
requesting a Google Cloud access token. A copied standalone rules file,
uncommitted rules edit, or unversioned folder fails closed. The private
`*.evidence.json` records `checkoutCommitSha`; no Git credentials are read.
The operator must independently verify this exact SHA is the finance release
candidate later matched to the deployed production SHA. Do not silently move
the candidate SHA just to satisfy an offline checker.

The 39/40 evidence dossier cannot mark the published-rules gate complete unless
it identifies the same `checkoutCommitSha` as the reviewed `githubMainSha`,
the second release-read remained stable, source hashes are identical, the
original difference status was byte-identical and provenance timestamps are
chronologically possible. These additions are necessary **but never sufficient**:
only an independent security reviewer can authenticate the local artifacts,
evaluate deployed access controls and approve actual 35-B/35-C.


## 29 October 2026 — Owner-observed published Rules capture, still NOT APPROVED

**This addendum supersedes the 28 October "LIVE RULES NOT CAPTURED" status for the owner's observed capture only.** A Cloud Shell terminal screenshot supplied in the finance conversation showed the read-only inspector ended with `READ_ONLY_COMPLETE` and published-release stability recheck `PASSED` (two observations). The inspector identified `SOURCE_DIFFERENT_RISK_NOT_ASSESSED`, not byte-identical rules. The checkout used for this observed comparison was `358cd40cc960eada2583617207d57bb1fc164087`. The instrument reportedly stored private full Rules, contextual diff and provenance evidence in the owner's own session; this documentation author did **not** access or independently verify those private artifacts or the live Firebase API.

A screenshot of the contextual diff indicated **permission-relevant structural differences involving accounting/period namespaces**, not merely file formatting, but the complete overlapping-match semantics, deployed release provenance and effective authorization were **not** independently classified. No conclusion that a different UID accessed financial records, or that any business data was changed, follows from these screenshots. The reported four local emulator tests passing against the captured published Rules are *simulation evidence only* and do not certify effective production client permissions or real two-UID access.

**State: `CAPTURE_OBSERVED / SOURCE_DIFFERENT / PRIVATE_RISK_REVIEW_OUTSTANDING / 35-B NO-GO`.** GitHub main later advanced through finance #1164 to `88146e5c295bc01bf2c4b0436717067fb233cd74`; the 35-B evidence from the **older checkout** must not be relabelled as parity with this newer release. The terminal screenshots do not contain sufficient attested ruleset ID/time and entire reviewed diff to finish the independent reviewer gate.

**Non-interactive handoff:** the user expressly requested **no further Cloud Shell commands or trial-and-error**. Use an authorized security operator/approved connector for a separately approved, read-only full-diff security review. Do not ask the owner to copy the private file into GitHub or chat. If a Rules change is necessary, propose and independently test it on isolated QA with explicit owner publication authorization **later**, not through this task. Keep period authority and real GL posting disabled; keep 35-C and 39/40 blocked.
