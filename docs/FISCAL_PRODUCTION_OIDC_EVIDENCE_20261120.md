# Production OIDC connectivity evidence — 2026-11-20

Owner-provided Vercel build log; branch oidc-probe, commit 8bb3bbd54c243df414a98ae6b03e3ff3754656d6. Production rebuild in iad1 at 15:59 local log time. This evidence is a real read-only build-environment connectivity probe, not a runtime Firebase Admin SDK integration test.

```
LOUREX_OIDC_PROBE scope PASS
LOUREX_OIDC_PROBE STS PASS
LOUREX_OIDC_PROBE IAM PASS
LOUREX_OIDC_PROBE Firestore PASS
LOUREX_OIDC_PROBE FirebaseAuth PASS
LOUREX_OIDC_PROBE RESULT PASS_READ_ONLY
LOUREX_OIDC_PROBE INTENTIONAL_BUILD_STOP: no production application will be published
```

No database writes, existing document reads, issuance or production promotion. Intentional build failure prevents the probe from replacing the application. Do not rerun this probe merely because its deployment status is Error.

Remaining release gates: real runtime token/ADC path, Firestore period-rule compatibility, independently verified taxpayer eligibility, HSM provisioning and wrapping key (not authorized for paid provisioning), production authority trust/CRL and official SDK hosting, independent PDF archive verification and actual ZATCA live enrollment/issuance. Do not enable live flags based on the probe. The new registration coordinator is private; it validates a pre-existing HSM public key and scopes the pending customer request to a deterministic EGS ID before the existing independent eligibility and transaction guards. It does not approve or provision keys automatically.
