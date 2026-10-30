# R07O — Local Secure HTTP Preview Integration (Not Deployed)

Reference: October 31, 2026. Base main `4dbe72ac9eedcd46b5784a18ad4bcf7dc3ea783b`.

## Explicit disabled gates

This work deliberately creates **NO `api/` endpoint, public router, Vercel configuration change, service-worker cache entry, QA URL, production Firebase project, production IAM or security-rule deployment, finance edit, or live frontend mount**. `R07O_PUBLIC_ENDPOINT_ENABLED=false`; R06, R07M and R07N gates remain OFF. Git deployment remains disabled. Only a Node local HTTP listener bound to `127.0.0.1` in official emulator tests exercises the transport.

A new server-side `R07OLocalPreviewHandler` rejects construction unless the Node process is in the demo Firebase project with **matching actual FIRESTORE_EMULATOR_HOST** at localhost/loopback and not in any Vercel or production environment. Allowed origin must be loopback HTTP with explicit port. Handler accepts only POST on the exact unmounted test route, enforces matching `Origin` and `Sec-Fetch-Site: same-origin`, refuses Cookie authentication, requires Bearer, JSON content type, strict operation envelope, bounded UTF-8 stream size and capped response. No CORS headers, cookies, cache or error details are sent. Failure responses use generic codes only.

The client `R07OLocalHttpPreviewPort` holds a **short-lived token getter** in memory and explicitly sends `credentials:omit`, `cache:no-store`, `redirect:error`, `mode:same-origin`; it never persists bearer tokens or performs automatic retries. It uses the R07N fixed-idempotency-key session for user-visible acknowledgment. The client depends on browser-managed Origin/Fetch Metadata; the Node integration harness simulates those forbidden-to-JS browser-generated headers, not a production browser build.

The test-only loopback HTTP handler invokes existing R07M coordinator. That coordinator verifies each request with the R07B JWT identity boundary and independently checks exact tenant/company/branch from `R07B3AdminMembershipStore` stored under the server-only ACL root. The integration test seeds **synthetic ACL records only into official local Firestore Emulator** using Firebase Admin, and invokes the existing `verifyR07FirebasePrincipal` with an injected deterministic test signer. This is NOT a cryptographic real-Firebase JWT or deployed-IAM security acceptance; test signer must NEVER be wired into any production route.

## Evidence and remaining boundaries

Targeted acceptance tests: same-origin HTTP greeting, zero provider and zero finance saves, review-only unsaved quote through R07N UI preview, complete event audit, token substitution refusal, unauthorized branch/ACL revocation, malformed request body, oversized bytes, Cookie/Origin/Sec-Fetch-Site/CORS/no-store checks, and historical idempotency collision without duplicate turns. Prior R07B/R07M/R07N tests run concurrently as regression coverage. Evidence valid only when CI succeeds on FINAL PR SHA.

**Not accepted:** a deployed browser/iPhone Safari run, real QA Firebase isolation, cryptographically verified live tokens, production membership provisioning and deployed rules, restore of real customer records, centralized rate-limiting/billing and DoS prevention, provider routing/NLU, files, finance approvals, or commercial release. No live activation until explicit owner approval and independent QA environment/permissions gate. A successful loopback test is not equivalent to production authorization.
