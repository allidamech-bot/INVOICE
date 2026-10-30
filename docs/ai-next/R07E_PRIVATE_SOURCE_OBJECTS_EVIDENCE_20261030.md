# LOUREX AI NEXT — R07E Private Original Source Objects

Date: October 30, 2026. Starting main: b6a96e8a8f15533ac7fd5e2b12563d6ffdb07765.

## Component (inactive)

The existing R02 source engine requires retention of full immutable original file bytes. R07E adds a backend-compatible repository which stores these bytes into an injected private **Google Cloud Storage / Firebase Admin bucket**. No credential, bucket initialization, download URL, signed URL, client upload endpoint or frontend access is introduced.

- Object key is a SHA-256 digest under `ai-next/private-sources/v1/<scopeHash>/<objectHash>`; the complete trusted nine-field scope (including user, account, company, branch, actor, role and auth epoch) plus source ID controls identity.
- The adapter verifies nonzero bytes, the 60 MB per-file R02 bound, exact SHA-256, file format and filename. It snapshots bytes and metadata before awaiting cloud IO.
- The GCS/Firebase Admin generation precondition `ifGenerationMatch:0` creates an immutable object or rejects the second writer. A duplicate with identical bytes and metadata is an idempotent replay; a different source never replaces the original.
- Reads require exact private key and verify metadata, full downloaded bytes, size and SHA-256. Missing sources return null, but storage failures reject rather than pretending data never existed.
- Tests use a simulated bucket with independent repository instances, concurrent creates, read tampering, digest mismatch, changed header, ACL-scope isolation, unavailable storage and R02 text/CSV ingestion with original bytes preserved.

## Release blockers

1. No live bucket, service credentials, cloud IAM, data-region selection, encryption/customer-data privacy review, per-object quota, backup/restore, lifecycle/retention, deletion policy, malware scanning or end-user consent has been configured or tested.
2. Current tests are mocked GCS API behavior, NOT proof of live object consistency or cross-device use. Real large PDFs, scanned OCR, password-protected documents and malicious/ZIP bomb handling remain open.
3. Scope hashes do not equal access control: **every server request must first pass R07B1/B3 trusted JWT and server membership resolution**. A caller may never submit an arbitrary full scope key or private bucket path.
4. Do not serve arbitrary source objects to the browser, permit public download tokens or use a client-writable cloud bucket rule. No authorization, provider configuration, Firebase rules, finance writes or production flags are changed.
5. Source metadata may contain sensitive filenames; IAM, retention policy and administrative auditing require explicit approval. SHA-256 catches corruption, not a privileged attacker able to replace metadata and bytes.

Result: only an isolated code interface with synthetic acceptance; R07 cross-device persistent storage and production readiness remain BLOCKED.
