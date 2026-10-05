# Plugsy Android / Google Play release runbook

Plugsy's first Android release is a Trusted Web Activity (TWA) backed by the production PWA. The Play build must be treated as a companion experience until Plugsy has either integrated Google Play Billing for digital goods or received a written policy determination that its in-app commerce flow is exempt.

## Release identity

- Package name: `ng.plugsy.app`
- Production host: `https://www.plugsy.ng`
- Target SDK: Android API 36
- Output: signed Android App Bundle (`.aab`)
- Play App Signing: enabled
- Signing key: store outside this repository and back it up securely

## Before building

1. Run `pnpm verify:release` and require a completely green result.
2. Apply every pending Supabase migration, including `20261004120000_account_deletion_v1.sql`.
3. Set `ANDROID_APP_PACKAGE=ng.plugsy.app` in Vercel.
4. After Play App Signing generates the app-certificate SHA-256 fingerprint, set it as `ANDROID_APP_SHA256_CERT_FINGERPRINT` in Vercel.
5. Confirm `https://www.plugsy.ng/.well-known/assetlinks.json` returns one JSON association containing that exact package and fingerprint. A `503` or empty array is not release-ready.
6. Verify the PWA manifest, service worker, offline/error state, deep links, Prembly camera permission and OneSignal permission on a physical Android device.

## Bubblewrap build

Use Bubblewrap from a clean machine with a supported JDK and Android SDK. Generate the project from `https://www.plugsy.ng/manifest.webmanifest`, set the package to `ng.plugsy.app`, target API 36 and build an AAB. Do not commit the signing keystore or passwords.

The Android start URL should identify the Play distribution in a future billing-aware release. Until that work exists, do not expose purchase, Premium or storage checkout inside the Play-distributed experience.

## Play Console declarations

- Organization identity and D-U-N-S details
- Privacy Policy: `https://www.plugsy.ng/privacy`
- Account deletion URL: `https://www.plugsy.ng/account-deletion`
- Data Safety form covering Clerk, Supabase, Prembly, Flutterwave, OneSignal, Daily and analytics actually enabled in production
- Financial Features declaration for wallet, payments, transfers and marketplace payouts
- Content rating, target audience, ads declaration and app-access reviewer credentials
- Camera permission explanation for Prembly liveness/face verification
- Notification permission explanation for messages, orders and account alerts

## Mandatory test journeys

Use separate buyer, seller, reseller, support and administrator accounts. Test signup, login, deletion, wallet funding, internal transfer, withdrawal, private/public listing, referral code, paid checkout, delivery, dispute, verification, support messaging, notifications, revoked access and offline recovery. Reconcile every money test against both the Plugsy ledger and provider dashboard.

If the Play account is subject to Google's personal-account testing rule, keep at least 12 opted-in testers continuously enrolled for 14 days before requesting production access.

## External release gates

The following cannot be completed by repository code: Play Console identity verification, Play App Signing enrollment, creation of Play Billing products, tester enrollment, provider-dashboard confirmation, Nigerian privacy/financial legal review, and final Google review. Record the owner and completion evidence for each gate before submission.
