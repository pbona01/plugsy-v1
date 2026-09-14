# Plugsy Marketplace — Build Brief

## Product outcome

Build a trusted Nigerian digital-products marketplace inside Plugsy. It must feel native to the existing Plugsy dashboard, work well on mobile, and use the current Clerk, Supabase, Plugsy Wallet and Flutterwave funding setup. Do not create fake sales, trust, payout, or identity-verification data.

## Decisions already made

- The marketplace has **Buy** and **Sell** modes.
- Sellers can keep a listing **private** (share-only link) or publish it publicly. Public publishing is restricted to a future Premium seller plan; the UI must explain this without pretending the plan exists yet.
- Products are digital. A customer may buy with a Plugsy account and access the product in **My library**. Email delivery is a follow-up channel, not the only proof of ownership.
- Plugsy Wallet is funded through Flutterwave. Marketplace purchases debit the buyer's wallet.
- Money is held for a **10-hour buyer-protection window**. Buyers receive the digital product immediately, but the seller cannot withdraw this marketplace revenue until the hold ends.
- Buyers may open a dispute during the hold if a product is materially different, unavailable, or misleading. A seller's trust score falls only from upheld/repeated valid complaints; it must never be arbitrary.
- Listings can allow resale: disabled, a fixed seller-set percentage, or seller approval/negotiation. The original seller is always visible in the resale chain.
- Purchase/referral codes remain separate from marketplace reseller attribution. Marketplace commissions remain held through the buyer-protection window.
- Seller identity verification (NIN, passport, driver's licence) is a launch gate for public selling, not a browser-only checkbox. Store verification state and provider reference only — never raw identity documents in the app database.

## Security invariants

1. The browser never writes marketplace orders, balances, seller earnings, trust scores, or entitlements directly.
2. Listing ownership and buyer identity are rechecked server-side for every mutation.
3. Purchases use a database transaction with idempotency. A retry cannot charge twice.
4. Funds are debited atomically, held in an order ledger, and released only after the hold expires without an open dispute.
5. Private delivery URLs are never included in public listing responses. They are returned only to the entitled buyer or the listing owner.
6. Public responses expose only published listings and aggregate, non-sensitive seller trust information.
7. Marketplace metrics derive from orders/disputes, never client counts.

## First release scope

- Marketplace home with search, categories, Buy/Sell switch, listing cards, trust indicator, and clear buyer-protection terms.
- Seller workspace: create a draft, choose private/public visibility, publish or pause, set resale policy, inspect held/released sales and library access.
- Buyer library, purchase detail and delivery access.
- Secure schema and server endpoints for listings, orders, entitlements, disputes, seller profile and resale requests.
- A protected hold/release job endpoint ready for a scheduler.
- Dashboard and global navigation entry points using a dedicated Plugsy marketplace mark.

## Explicitly deferred, never faked

- Live NIN/passport/licence verification provider integration.
- Automatic outgoing seller payouts.
- Premium seller subscription enforcement.
- Live-tested email delivery and malware-cleared file delivery (outbox and expiring download primitives exist).
- Full negotiated resale chat (percentage requests/decisions exist) and evidence-based seller response tools.

## Launch configuration still required

- Apply the marketplace migration before deploying this feature.
- Schedule `POST /api/marketplace?action=release-due` with `Authorization: Bearer <CRON_SECRET>` at a cadence suitable for the 10-hour hold. Workspace reads do not release money. A scheduler is required for hands-off releases.
- Purchases and scheduled releases default to disabled. Do not set `MARKETPLACE_PAYMENTS_ENABLED=true` until transactional wallet, dispute, delivery and moderation tests have passed against a staging database.
- Reseller attribution now requires an approved grant. Separate commission entries remain held alongside the seller's money and are credited atomically on release; these need real database tests before launch.
- Guest checkout, premium billing, automated identity verification, malware scanning and deployed schedulers still need implementation/configuration. R2 upload/download, email outbox and moderation/refund resolution now exist but are not live-tested.

Implement the release foundation first; leave clear integration points for these production services.
