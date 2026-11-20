# AWS-to-Google existing-project identity validation, staged release hold

Confirmed source context: existing Google project **lourex-invoice**, number **985119320046**; existing Vercel workload pool **lourex-vercel**. The previously introduced **lourex-fiscal-qa** name has not been shown as a created project. Do not run prepare-google-staging-identity.sh against a presumed project.

AWS role **lourex-zatca-staging-wif** is now attached to the existing EC2 instance, verified by owner IMDSv2 read of the precise role. The original signed LOUREX standard/simplified XML also passed pinned SDK4 locally with a synthetic certificate.

This change prepares AWS identity federation on the existing **lourex-invoice** project using a **separate provider and separate IAM service account**. The AWS provider is pinned to one account, one role and one EC2 instance. The service account receives only `roles/iam.workloadIdentityUser` binding, **no Firestore read or write permissions**. The identity exchange probe cannot read or mutate any customer data, and the existing Vercel provider is untouched.

This is **not** a complete Firebase runtime connection. Stage-to-production Firestore authorization must not be granted unilaterally: Firestore IAM roles broadly access the default database and Admin SDK bypasses client Firestore Rules. A dedicated QA project is optional, not established; creating another Firestore database on a Spark project would require billing plan upgrade. Defer data-plane permission/deployment until approved isolated tenant and store authorizer passes integrated acceptance. No billing, new project or Firestore database creation is authorized here.

On Google Cloud Shell: run pinned `prepare-google-aws-identity.sh` for IAM federation. On EC2: install a root-owned, fixed local ADC configuration from the known provider IDs then run `probe-aws-google-identity.mjs` as `lourex-staging`. Neither command prints tokens. Production issuance and PR merge remain disabled.

## Provider identifier correction

The initial provider creation failed in Google Cloud Shell because `ec2` has only three characters; Google requires a provider ID of 4–32 lowercase letters, digits or hyphens. The canonical ID is **`ec2-staging`** throughout the Google setup script, EC2 ADC configuration, identity validator and targeted test. The existing pool `lourex-aws-staging` was created successfully and must be reused. The provider and service-account federation have not yet been confirmed created or tested. Do not grant Firestore access or activate production.
