# AWS Simulation EGS enrollment one-shot; operator review required
# 
# This document describes only the fiscal subsystem. PR #1287 is Draft.
#
# Verified AWS state as of 2026-11-21 (owner terminal evidence):
# - Code and both systemd units installed on EC2 with exact immutable commit
#   de7947a5ffa9c3a56cbaf95835533d75b1cd4786.
# - Both services remain inactive; neither was enabled or started.
# - /etc/lourex-staging/softhsm2.conf, two root-only 32-byte credentials,
#   /opt/lourex-fiscal/sdk4-R4.0.0 and fiscal Python venv were verified.
# - SDK root copy and Python imports passed; local encrypted backup decrypted.
# - Backup remains on the SAME instance as its passphrase, not off-host verified.
# - No official SDK archive ZIP was found at the inspected EC2 paths.
# - No approved ZATCA trust CA/CRLs/policy, selected QA EGS, worker.json,
#   trusted-runtime-profile.json or enrollment-command.json are verified.
# - No ZATCA Simulation enrollment, clearance or reporting is confirmed.
# - Earlier Developer Sandbox clearance was observed, but is not Simulation
#   or production acceptance.
#
# Follow-on branch-only tooling (not installed on the current EC2 release):
# - prepare-aws-sdk4-manifest.mjs + verify-sdk4-archive.py: require the
#   exact expected vendor archive SHA-256 AND compare all extracted SDK files
#   to its ZIP contents before writing an immutable pin.
# - prepare-aws-fiscal-java.sh: compiles CanonicalInvoice, ClearanceContent
#   and StampInspector into a source-hash-addressed /opt directory, tests
#   canonicalization as restricted service user and reports JAVA_CLASS_PATH.
# - aws-readiness-gate.mjs: read-only HOLD report, never authorizes activation.
# These must be reviewed and included in a future isolated fiscal release;
# absence of their execution cannot be marked as verified.
#
# Approved workflow (one at a time, no automatic retry):
# 1. Provision synthetic EGS config in QA Firestore through the existing
#    authenticated, trusted administrative approval process; it must match
#    the account/workspace/EGS allowlist in worker.json and remain inactive.
# 2. Operator creates root-owned /etc/lourex-staging/enrollment-command.json:
#    {"version":"LOUREX_AWS_ENROLLMENT_COMMAND_V1",
#     "action":"provision",
#     "scope":{"environment":"simulation","accountUid":"<approved-synthetic-uid>",
#       "workspaceId":"<approved-workspace>","egsId":"<approved-egs>"}}
#    The root-owned file is read with O_NOFOLLOW and <=8192 bytes. No OTP,
#    credentials, CSID, taxpayer data, network URL or invoice goes in JSON.
#    The file must be independently reviewed and remain non-world-writable.
# 3. Root operator may START, not ENABLE, the one-shot
#    lourex-aws-enrollment.service only once after the immutable application,
#    systemd secret binding and trusted profile checks pass.
#    This step binds the existing persisted SoftHSM nonexportable EGS key.
# 4. For begin, change ONLY action to "begin", and supply a **short-lived**
#    6-digit OTP as a systemd service-manager credential named "otp".
#    ImportCredential=otp copies it into the unit's private credentials
#    directory. The runner refuses if it is absent, malformed or wrong owner.
#    OTP MUST NEVER be placed in environment variables, command-line flags,
#    shell history, worker.json, enrollment-command.json, GitHub, Firestore
#    or plaintext logs. Provide through an operator-approved systemd
#    encrypted credential / private ephemeral manager path. Never share in chat.
# 5. Once CSR and Compliance CSID are verified by PKIX, each compliance test
#    requires a manually approved "check" with exact expectedVersion.
#    The original enrollment ledger holds any uncertain request: no retries.
# 6. After all required standard/simplified invoice checks are verified,
#    the "operational" step requests the operational Simulation CSID with
#    exact expectedVersion; "activate" verifies key possession, chain,
#    immutable onboarding evidence and binds the EGS to the stored credential.
# 7. Only AFTER actual ZATCA Simulation acceptance may an independent operator
#    review installation and activation of the separate continuous worker.
#    Its dispatch gate LOUREX_AWS_DISPATCH_APPROVED is never set by this
#    one-shot unit. Production taxpayer onboarding is a separate process.
#
# Security invariants:
# - Dedicated manual one-shot; no [Install], Restart=no, no timers, no HTTP.
# - One EGS per root-reviewed instruction; exact pinned synthetic allowlist.
# - Uses existing createStagingFiscalRuntime, enrollment and HSM/SDK4 methods.
# - Console output includes only action and sanitized state, no private data.
# - File ownership root + no symlink + digest pin over runtime trust profile.
# - The two valid credentials directories are literally pinned, not user input.
# - No change to site's general app, Vercel production, IAM or main branch.
#
# Acceptance STILL PENDING: authenticated official SDK archive provenance,
# Java helper compilation on the EC2 host, independent CA/CRL/policy review,
# real QA Firestore EGS configuration, protected operational enrollment, and
# successful authorized ZATCA Simulation clearance and reporting.
# Operator must never place an OTP, CSID or issuer secrets in repo, shell
# history or chat. Production remains blocked; this PR must stay Draft.
