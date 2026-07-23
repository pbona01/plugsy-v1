# Plugsy User Flows

## USER FLOW:
1. User signs up → Clerk creates account → profile auto-created in Supabase
2. User selects plan → enters purchase code (optional) → clicks pay
3. Frontend calls /api/payments/initialize → gets Paystack URL
4. User completes payment on Paystack
5. Paystack fires webhook to /api/payments/webhook
6. Webhook creates order with status="paid" delivery_status="pending_login"
7. Webhook sends automated chat message to user
8. Webhook credits referral commission if purchase code was used
9. Webhook sends Telegram notification to admin group
10. Admin sees order in pending queue at /admin/pending
11. Admin pastes login details and clicks Send Login
12. Login sent to user chat, order marked completed, subscription starts
13. User sees login in chat at /dashboard/messages
14. Subscription timer starts on user dashboard

## REFERRAL FLOW:
1. Every user has a unique purchase_code in profiles table
2. When user A shares their code with user B
3. User B enters code at checkout — validated via get_code_owner RPC
4. Code owner ID stored in Paystack metadata
5. After payment webhook fires, 10% of order amount credited to code owner
6. Code owner sees balance update on their dashboard
7. Code owner can request withdrawal from dashboard

## ADMIN FLOW:
1. Admin logs in → redirected to /admin
2. Overview shows stats: revenue, orders, active subs, pending
3. Pending Queue shows orders needing login delivery
4. All Orders shows complete order history
5. Subscriptions shows active subscriptions
6. Users shows all registered users
7. Withdrawals shows pending withdrawal requests
8. Admin confirms withdrawals → balance deducted → user notified
