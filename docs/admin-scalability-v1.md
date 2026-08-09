# Plugsy Admin scalability v1

Phase 3 reduces Admin read amplification while preserving authorization,
financial semantics, mutations, and existing Admin navigation.

## Before

The Admin mount ran a broad loader that requested profiles, orders,
subscriptions, chats, plans, withdrawals, portfolio purchases, and settings
independently of the selected tab. Several reads used `select("*")` and list
endpoints returned up to 1,000 rows. Users and published One Links also had
large response paths.

## After

The main loader is tab-scoped and uses a request coordinator so a tab change
invalidates stale work. Heavy list responses are bounded and list controls use
server-side pages rather than downloading a table and slicing it in the
browser. Search input for users and published One Links is normalized,
truncated, and debounced before requesting the server.

| Dataset | Before | After | Page size |
| --- | --- | --- | ---: |
| Users | full normalized response | bounded API page + server search | 50 |
| Orders / pending / medals | broad Admin load, up to 1,000 | active-tab API page | 50 |
| Login-sent subscriptions | unbounded direct read | active-tab bounded range | 50 |
| Withdrawals | `select("*")`, unbounded history | explicit columns + bounded range | 50 |
| Published One Links | full response to browser | bounded API page + server search | 50 |
| Communities / support chats | loaded on mount | bounded explicit-column summary shared for badge/routing; full list only on chat tabs | 50 |
| Plans and settings | small configuration reads | loaded only on their tabs | unchanged |

## API contract changes

Admin list endpoints accept `page` and `pageSize`. Values are normalized to a
default of 50 and a maximum of 100. List responses include:

```json
{
  "pagination": { "page": 1, "pageSize": 50, "total": 0, "hasMore": false }
}
```

`list-users` and `list-published-onelinks` also accept bounded `search` input.
The users response remains compatible with the existing `users` and `admins`
arrays; older clients that omit pagination metadata remain parseable.

## Intentionally not changed

- Admin authorization, Clerk authentication, RLS, and mutation authorization.
- Wallet balances, transaction semantics, funding reconciliation, withdrawals,
  payments, orders, subscriptions, and notification behavior.
- Financial dashboard formulas and detailed ledger semantics. This remains a
  high-risk read path for a dedicated follow-up if transaction pagination can
  be added without changing reconciliation meaning.
- Overview metric definitions and server-side aggregate inputs. The overview
  endpoint remains the source of truth; only the browser preview reads are
  bounded.
- Admin chat routing, canonical support-chat resolution, and non-Admin chat.
- Database schema, indexes, migrations, and production data.

## Known limitations

The users and published One Link APIs still reconcile their source records
before slicing the response because Clerk/profile identity matching and
published-state derivation must remain consistent. The browser payload is
bounded, but deeper provider-side aggregation is deferred. Financial history
is intentionally unchanged for correctness.

## Next phase

Consider provider-native cursoring for Clerk/profile reconciliation and a
dedicated, semantics-preserving financial ledger pagination design. Any such
work requires separate authorization, accounting, and query-plan review.
