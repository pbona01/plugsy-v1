# Security audit — 2026-08-11

## Scope

Reviewed browser-exposed configuration, Vercel handlers, the standalone Express
server, Clerk authorization boundaries, service-role Supabase access, scheduled
jobs, outbound email, push notifications, video uploads, and repository secret
patterns.

## Fixed findings

| Severity | Finding | Remediation |
| --- | --- | --- |
| Critical | Category update/delete handlers used the Supabase service role without authentication. | Require a verified Clerk administrator and remove permissive cross-origin responses. |
| Critical | Anyone could create a YouTube resumable-upload session backed by Plugsy's OAuth credentials. | Require verified Clerk authentication, validate upload metadata, and protect video-status lookups. |
| Critical | The standalone server exposed up to 5,000 profiles and messages to every signed-in user. | Require the existing administrator middleware on all bulk data endpoints. |
| Critical | Any signed-in user could send arbitrary recipient/subject/HTML through Resend. | Retire the open-relay endpoint; keep only constrained, admin-only template triggers. |
| High | Booking notification work could be triggered by unauthenticated requests. | Require cron authentication for scheduled expiry work and verified admin access for manual booking alerts. |
| High | Generic admin write routes could target any table through the service role. | Restrict writes to the explicit collections used by the admin UI. |
| Medium | Purchase-code validation returned a code owner's email address. | Return only the referral owner ID and display name required by checkout. |
| Medium | Production Supabase values and a Gemini key convention could be compiled into browser builds. | Remove hard-coded production fallbacks and remove the `VITE_GEMINI_API_KEY` client use. Missing configuration now fails closed. |

## Required deployment actions

1. Rotate the Gemini API key immediately if it was ever set as
   `VITE_GEMINI_API_KEY`; Vite makes such variables visible in deployed
   JavaScript. Store its replacement only as `GEMINI_API_KEY` on a server-side
   integration.
2. Verify Vercel/production has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   Clerk verification settings, `CRON_SECRET`, and the notification variables
   documented in `.env.example` before deploying.
3. Apply `supabase/migrations/20260811100000_scheduled_job_leases_v1.sql` before
   deploying the scheduled-job changes.
4. Review Supabase RLS policies in the production dashboard. This repository
   does not contain a complete, authoritative RLS policy export, so it cannot be
   validated offline.

## Verification performed

- Syntax checks passed for all changed JavaScript API handlers.
- `tests/security-boundaries-v1.test.mjs` and
  `tests/onesignal-notifications-v1.test.mjs` passed: 47 tests total.
- `git diff --check` passed.

The full TypeScript build was not run because this checkout has no
`node_modules` directory. Install the locked dependencies and run `npm run lint`
and `npm run build` before publishing.
