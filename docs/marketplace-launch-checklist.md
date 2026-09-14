# Marketplace foundation: handoff and launch gates

## Implemented locally

- Dedicated marketplace icon and entry points on the dashboard/navigation.
- Buy, Sell and My library pages, category filtering and product search.
- Owner-only listing creation, editing, publishing and pausing; edits return products to draft.
- Share-only private listing pages; delivery links are excluded from public responses.
- Server-authenticated buyer library and delivery access.
- Transactional wallet checkout with buyer-scoped idempotency, immutable delivery snapshot and 10-hour seller hold.
- Atomic buyer reports: reporting locks the order and freezes funds before the release worker can proceed.
- Authenticated release worker, disabled by default alongside purchases.
- Database structure for verification, listing resale preferences and negotiated resale requests.

## Not ready for a public money-taking launch

1. The user reported applying the first four migrations and passing the isolated rollback checks. The new Premium migration still needs to be applied and fixture-tested. Isolated checks do not prove compatibility with real wallet transactions or concurrent sessions; do not test financial operations on customer accounts.
2. Test concurrent double-clicks/retries, insufficient funds, private-token rejection, stolen order IDs, delivery secrecy, hold expiry and report/release races.
3. Admin dispute resolution, atomic wallet refunds, entitlement revocation and an audit console are now implemented at `/admin/marketplace`. Test them against the existing wallet constraints; evidence uploads and seller response tools remain pending.
4. Trust now derives from completed orders and upheld buyer disputes: `100 * completed / (completed + upheld)`, rounded. New sellers have no score. This provisional policy still needs founder approval and abuse/confidence review before launch.
5. Dojah widget launch and server-side result lookup are implemented, disabled until credentials and a published EasyOnboard flow are configured. Only a matching opaque reference, successful overall result, approved ID type and successful ID/selfie steps can grant verification. No live verification is claimed. The ₦1,500/month, manually renewed Wallet-funded public seller plan is implemented in migration `20260914190000`; apply and fixture-test this NEW migration before paid activation. Private listing links have no publishing fee. Do not enable payments yet.
6. Approved reseller grants/codes, percentage requests, seller decisions and a separate held commission ledger are now implemented. Refunds before release cancel the whole split; release credits seller and reseller once. Test concurrent grants/revocations, retry attribution and real withdrawals. Rejected offers cannot yet be renegotiated in-place.
7. Private R2 uploads, validation, per-seller quota reservation and five-minute entitled downloads are implemented. Configure a private bucket/credentials/CORS and integrate malware scanning. Files remain quarantined: there is deliberately no browser control to mark them clean. Scan approval must ensure the upload URL can no longer overwrite the scanned object (or copy to an immutable delivery key). External links are not DRM and can be copied.
8. Resend receipt/refund/release email outbox and a leased, retrying worker are implemented. Configure/test the verified sending domain and scheduler. Build guest email checkout separately: current checkout requires a signed-in account and funded wallet. Handle bounces and alert on failed jobs before launch.
9. Configure a frequent, authenticated release scheduler. The current daily jobs are not enough to promise release precisely at 10 hours. Workspace GET requests do not move money.
10. Purchase and Premium activation keys now persist across refreshes, scoped to actor and product; ambiguous failures retain the key. Add durable API abuse limits and operational alerts before launch.
11. Test real Flutterwave-funded wallet settlement, refunds, reconciliation and withdrawal reserves in staging. Existing wallet funding is reused; no new Flutterwave charge/webhook flow was added.
12. Complete responsive visual QA, keyboard/focus testing and the full test suite before removing the preview banner.

Keep `MARKETPLACE_PAYMENTS_ENABLED` absent or `false` until these launch gates pass. The switch is server-only and must never be exposed as a `VITE_` variable.

## Checks performed

- Focused marketplace/verification/notification regression tests pass. Full suite reports 237 passing and 19 failing checks in other existing admin, OneLink and Wallet areas; do not treat this as a clean public-payment release.
- Production frontend build and server bundling passed; existing large-bundle warnings remain.
- Full TypeScript checking is not clean: the latest default run exhausted Node's 2 GB heap. Earlier runs reported existing animation, Clerk, PersonalChat and PortfolioDashboard errors. Production bundling succeeds; it is not a substitute for a clean typecheck.
- User confirmed the first four marketplace migrations and isolated rollback fixture checks passed. These are sequential fixtures, not real settlement/concurrency tests. Private Cloudflare bucket `plugsy-marketplace` was created, scoped credentials saved as Production-only Vercel secrets, and exact Plugsy-domain CORS saved. No live upload, scan, KYC or payment has been verified yet.

## Supabase setup order (main project, purchases OFF)

1. Run `supabase/marketplace_production_preflight.sql` first and share the results for review. It reads schema/constraints and duplicate counts, not user rows or secrets. Do not drop wallet protections to bypass a failure.
2. After preflight review, run the four migration files in order: `20260914133000`, `20260914150000`, `20260914160000`, `20260914170000`. They add marketplace structures and do not charge users. Do not run the checkout/release RPC manually against a real user.
3. Run ALL of `supabase/marketplace_rollback_verify.sql` at once. It creates fixtures and copied RPCs in a separate schema, then rolls the schema back. It does not copy user data, fire production email triggers or use a real wallet. It tests sequential invariants, not multi-session races or the real wallet's schema constraints.
4. Keep `MARKETPLACE_PAYMENTS_ENABLED=false` throughout. Complete the remaining launch gates before changing it.

Server-only storage variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_MARKETPLACE_BUCKET`. Use bucket-scoped credentials, keep the bucket private and allow only Plugsy's actual origins in bucket CORS. Do not put secrets in chat or client `VITE_` variables.

Schedule authenticated POST calls to `release-due` and `process-emails` on `/api/marketplace`, using `CRON_SECRET`. Email processing uses existing `RESEND_API_KEY` and sends from `hello@plugsy.ng`. No schedule has been deployed here.

Storage implementation follows the [official Cloudflare R2 S3 SDK guidance](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

## Dojah configuration (not connected live yet)

Server-only settings: `DOJAH_APP_ID`, `DOJAH_PUBLIC_KEY` (intentionally returned to the widget), `DOJAH_SECRET_KEY`, `DOJAH_WIDGET_ID`, `MARKETPLACE_DOJAH_ENABLED`. Keep the enabled flag absent until the correct published flow and test keys are configured. Require valid NIN or passport/licence and selfie ownership/liveness in EasyOnboard; document all configured optional checks and test their failure outcomes. ID numbers, document URLs, selfies and full provider responses are not persisted by this integration. Failed/pending/abandoned/unsupported results never approve the seller. Provider errors preserve pending state. This version uses authenticated server lookup after the callback or Check result, not an unverified webhook.

Integration follows [Dojah's web widget](https://docs.dojah.io/api-reference/widget-sdks/web-javascript), [server verification lookup](https://docs.dojah.io/api-reference/verifications/get-verification) and [result-status guidance](https://docs.dojah.io/api-reference/core-concepts/webhooks-signatures). Provider credentials, flow configuration, consent/privacy review and live tests remain launch gates.

## Notification fixes in this rollout

- A queued click callback no longer prevents the SDK script from loading.
- PWA and OneSignal use one root worker (`/sw.js`) instead of replacing each other's registration.
- Server app-ID fallback accepts the existing public `VITE_ONESIGNAL_APP_ID`; secret keys stay server-only.
- Message notifications re-read persisted rows through RLS, ignore self messages and permit member-to-member alerts outside the active conversation.
- Portfolio views no longer generate invented global reaction notifications.
- A no-subscribers HTTP 200 is not reported as successful push delivery.

On iOS, web push still requires a Home Screen installation and explicit user permission. Test a self notification and messages with two consented test accounts after deployment. Do not claim external delivery from unit tests alone.
