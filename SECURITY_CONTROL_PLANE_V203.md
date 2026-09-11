# LOUREX Invoice Security Control Plane v203

This file defines the remaining account/platform security controls for the dedicated LOUREX Invoice deployment only.

Authorized source and production target:

- GitHub: `allidamech-bot/INVOICE`
- Vercel project: `invoice`
- Vercel project ID: `prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ`
- Production host: `invoice-three-puce.vercel.app`

Never apply these settings to `lourex-bf110a8a`, `lou-rex.com`, `www.lou-rex.com`, or another LOUREX project.

## 1. GitHub main protection

Configure `main` so the repository workflow is enforced by GitHub rather than convention alone:

- Require a pull request before merging.
- Require the `verify` status check to pass before merging.
- Do not require another-person approval while the repository is operated by a single maintainer.
- Require conversation resolution before merge when review threads exist.
- Block force pushes.
- Block branch deletion.
- Do not allow bypass of required checks for normal development work.

The current ChatGPT GitHub connection does not have repository-administration write access, so this setting must be applied with an administrator-capable GitHub session.

## 2. Firebase App Check rollout

v203 vendors `firebase-app-check-compat.js` and initializes App Check synchronously inside the first Firebase initialization, before Auth or Firestore is requested.

Use reCAPTCHA Enterprise for the web app.

Safe rollout order:

1. In Google Cloud, create a score-based reCAPTCHA Enterprise Web key for the LOUREX Invoice production host only.
2. In Firebase Console > App Check, register the existing LOUREX Invoice web app with that Enterprise key.
3. In the dedicated Vercel `invoice` project, add the Production environment variable `FIREBASE_APP_CHECK_ENTERPRISE_KEY` with the public Enterprise site key.
4. Leave `FIREBASE_APP_CHECK_REQUIRED` unset or `0` for the first monitored rollout.
5. Deploy the application and confirm Firebase App Check metrics show valid requests from real production sessions.
6. Enable App Check enforcement for Cloud Firestore.
7. Enable App Check enforcement for Firebase Authentication after Auth metrics are confirmed healthy.
8. Set Vercel Production environment variable `FIREBASE_APP_CHECK_REQUIRED=1` and redeploy. From that point, a production build without the App Check key fails closed.

Do not enable Firebase enforcement before step 5. Existing clients must first receive the App Check-capable runtime.

Never enable or commit an App Check debug token in production.

## 3. Firebase Authentication policy

Align the backend policy with the v202/v203 client policy:

- Minimum password length: 12.
- Maximum password length: 128 if the Firebase policy UI supports the desired maximum; otherwise leave the backend maximum higher while the LOUREX client continues enforcing 128 for new accounts.
- Enforcement: Require for new passwords.
- Force upgrade on sign-in: Off initially, so existing users are not locked out solely because an older password does not meet the new creation policy.
- Enable email-enumeration protection.

After activation, verify create-account, sign-in, forgot-password, and existing-account recovery in both English and Arabic.

## 4. Firebase / Google API key restrictions

The Firebase web API key is a public client identifier, not a server secret, but it should still be restricted against abuse.

Review the browser key in Google Cloud Credentials:

- Apply HTTP referrer restriction to `https://invoice-three-puce.vercel.app/*` and only other explicitly authorized Invoice production hosts if they are added later.
- Do not authorize `lou-rex.com`, `www.lou-rex.com`, or unrelated Vercel projects.
- Restrict the key to only the Google/Firebase APIs actually required by LOUREX Invoice.
- Re-test Auth and Firestore after API restrictions are published.

## 5. Vercel WAF rate limiting

The serverless `/api/remove-background` endpoint already has same-origin intent checks, payload validation, provider-key isolation, and best-effort in-instance rate limiting. Add a platform rule as the outer layer:

- Project: dedicated `invoice` project only.
- Match path: `/api/remove-background`.
- Method: POST when the rule builder supports method matching.
- Count by: IP.
- Limit: 12 requests per 5 minutes.
- Action: Rate Limit.

The project is on Vercel Hobby. Vercel currently supports WAF rate limiting on Hobby, with one rate-limit rule per project, so use that rule for this paid/upstream API endpoint.

## 6. Production smoke test after control-plane activation

Run these checks only after the settings above are live:

- New account with a compliant password succeeds.
- Weak new password is rejected by Firebase as well as the client.
- Existing account with an older valid password can still sign in.
- Forgot-password response remains enumeration-neutral.
- Firestore cross-account access remains denied.
- Valid production sessions show valid App Check tokens/metrics.
- Requests without valid App Check are rejected once enforcement is enabled.
- `/api/remove-background` succeeds for normal use and rate-limits repeated abuse.
- Sign out removes the device session key and requires a fresh authenticated restoration.
- Auto-lock still locks fresh workspaces after 15 minutes of inactivity.
- PWA/Safari receives cache generation v203 and can sign in, sync, create a document, and reopen successfully.

## Completion condition

Security control-plane closeout is complete only when GitHub branch protection, Firebase App Check enforcement, Firebase Auth policy/enumeration protection, Google API-key restrictions, and the Vercel WAF rule are all verified live on the dedicated Invoice project.
