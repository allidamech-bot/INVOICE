# AWS Simulation EGS enrollment one-shot; operator review required
# 
# This document describes only the fiscal subsystem. PR #1287 is Draft.
#
# Current AWS state:
# - EC2-to-QA Firestore read and negative production isolation ACCEPTED.
# - Immutable /opt release, officially pinned CA/CRLs, actual SDK4 path,
#   protected secrets and operator-approved synthetic EGS remain NOT READY.
# - This service has NOT been installed, enabled or run on EC2.
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
# Acceptance STILL PENDING: package verification, Node version, two systemd
# credentials, approved official CA+CRL+policy, actual QA command access and
# successful ZATCA Simulation standard clearance and simplified reporting.
