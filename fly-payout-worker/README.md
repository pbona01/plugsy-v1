# Plugsy Fly payout worker

## Architecture

This worker is a stateless, server-to-server egress adapter. The Vercel wallet API continues to authenticate users, validate PINs, enforce idempotency, reserve withdrawals, classify provider results, and invoke every settlement, refund, and manual-review RPC. The Fly worker can only initiate one Flutterwave transfer request or verify one known provider transfer ID through two fixed endpoints.

The worker has no Supabase or Clerk configuration, no wallet data access, no browser CORS policy, no arbitrary proxy route, and no payout-state storage. Its only in-memory state is a bounded five-minute HMAC nonce replay cache.

## Security model

Every payout request is authenticated with these headers:

- `x-plugsy-timestamp`
- `x-plugsy-nonce`
- `x-plugsy-signature`

Vercel hashes the exact serialized UTF-8 body with SHA-256, builds `<timestamp>.<nonce>.<body-sha256>`, and signs that canonical string with HMAC-SHA256. The worker reconstructs the signature from the exact received bytes, compares it with `timingSafeEqual`, permits at most 90 seconds of clock skew, and rejects nonce reuse for at least five minutes. Bodies are limited to 16 KB, schemas reject extra keys, and provider requests have one 15-second timeout and no retry.

Do not expose either service to browser code through CORS, and never place these secrets in `VITE_` variables.

## Environment variables

Fly worker secrets/configuration:

- `FLUTTERWAVE_SECRET_KEY`
- `PLUGSY_PAYOUT_HMAC_SECRET`
- `PLUGSY_CALLBACK_ORIGIN=https://www.plugsy.ng`
- `PORT=8080` (provided by the image/configuration)

Vercel wallet API configuration:

- `PAYOUT_WORKER_URL=https://plugsy-payout-egress-pbona01.fly.dev`
- `PAYOUT_WORKER_HMAC_SECRET` (the same value as the Fly HMAC secret)
- `PAYOUT_WORKER_ENABLED=false` initially

No real secret values belong in Git, Fly configuration files, build arguments, logs, or frontend environment variables.

## Generate the shared HMAC secret

Generate the secret locally and transfer it through the approved secret-management channel. This PowerShell command produces 32 cryptographically random bytes:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$key = [Convert]::ToBase64String($bytes)
Set-Clipboard -Value $key
```

Use the generated value for Fly's `PLUGSY_PAYOUT_HMAC_SECRET` and Vercel's `PAYOUT_WORKER_HMAC_SECRET`. Do not paste it into source control or support messages.

## Deployment order

Do not deploy from a development workstation until the branch, security review, and production change window are approved.

1. Set the production Vercel variable `PAYOUT_WORKER_ENABLED=false` and confirm the deployed wallet API returns `WITHDRAWALS_TEMPORARILY_PAUSED` before reservation.
2. Generate the shared HMAC secret and store it in the approved secret manager.
3. From this directory, create the app if it does not already exist:

   ```powershell
   fly apps create plugsy-payout-egress-pbona01
   ```

4. Set Fly secrets through an approved non-recorded secret-entry method. Set only `FLUTTERWAVE_SECRET_KEY`, `PLUGSY_PAYOUT_HMAC_SECRET`, and `PLUGSY_CALLBACK_ORIGIN`.
5. Deploy exactly one Machine in London and verify its scale:

   ```powershell
   fly deploy --ha=false --app plugsy-payout-egress-pbona01
   fly scale count 1 --region lhr --app plugsy-payout-egress-pbona01
   fly scale show --app plugsy-payout-egress-pbona01
   ```

6. Allocate the recommended app-scoped static egress addresses in `lhr`:

   ```powershell
   fly ips allocate-egress --app plugsy-payout-egress-pbona01 -r lhr
   fly ips list --app plugsy-payout-egress-pbona01
   ```

7. Record the app-scoped **egress IPv4** shown by the allocation/list command. Whitelist that IPv4 in Flutterwave. Do not use the public Fly Proxy ingress address or the IPv6 value as a substitute for the required IPv4 allowlist entry.
8. Keep Vercel disabled. Configure `PAYOUT_WORKER_URL` and the matching `PAYOUT_WORKER_HMAC_SECRET`, deploy the reviewed Vercel release, and verify the pause response still happens before reservation.
9. Check generic readiness only:

   ```powershell
   Invoke-RestMethod "https://plugsy-payout-egress-pbona01.fly.dev/healthz"
   ```

   The expected body is `{ "ready": true }`. Do not attempt either payout endpoint manually.
10. Confirm the Flutterwave allowlist is active, the Fly app has exactly one running `lhr` Machine, the static egress IPv4 is still listed, clocks are synchronized, and monitoring is ready.
11. Change `PAYOUT_WORKER_ENABLED=true` in Vercel and deploy that environment change only during the approved production window.

## Controlled production test checklist

- Confirm there are no unresolved or ambiguous withdrawals that an operator might accidentally retry.
- Use one approved low-risk withdrawal through the normal authenticated Plugsy UI; never call the worker directly.
- Confirm one reservation, one attempt-start marker, one provider initiation, and one submitted/manual-review result for the same idempotency key.
- Confirm the provider callback is verified through the worker before settlement or refund.
- Confirm no complete account number, PIN, secret, HMAC signature, or raw provider body appears in logs.
- If initiation times out, returns a network error, or is otherwise ambiguous, stop. Do not retry it. Follow the existing manual-review process and verify the provider state first.

## Emergency pause

Set the Vercel production variable `PAYOUT_WORKER_ENABLED=false` and redeploy the Vercel environment change. Confirm new withdrawal requests return HTTP 503 with `WITHDRAWALS_TEMPORARILY_PAUSED` before any reservation or provider call. Do not delete the Fly app, rotate secrets, refund records, or retry ambiguous withdrawals as the first response to an incident.

**Never retry an ambiguous withdrawal.** A timeout or network failure can occur after Flutterwave accepted the transfer, and a second initiation could create a second payout.
