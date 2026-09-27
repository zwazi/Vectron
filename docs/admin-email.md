# Admin email notifications

New pending `mapSubmissions` and `accounts` documents trigger `emailMapReview`
and `emailRegistrationReview` in the repository project. New
`featureSuggestions` documents trigger `emailFeatureSuggestion` in the identity
project, independently of the existing Messages delivery. This includes a
suggestion from the only administrator, for which there is no other Messages
recipient. Existing queue items are not mailed on deployment.

The portable `functions/admin-email.js` and its test are identical in Vectron
and NeotronWebsite; keep both copies synchronized when changing delivery logic.
The existing Resend configuration is stored in the identity project's
`TRONNER_ADMIN_EMAIL` Secret Manager secret as JSON with `apiKey`, `sender`, and
`recipient`. Each runtime has secretAccessor on this individual secret only.
There are no mail credentials in the browser or repository. No new mail provider
or paid tier is required. Changing this secret requires a function redeploy to
flush cached configuration.

`adminEmailDeliveries` records hold a frozen payload, provider acknowledgement,
and durable sent marker. Transactions reserve each notification once. Resend's
idempotency key protects retries after an ambiguous network failure. Cloud
Functions retries failures for its event retry window. After 23 hours an
ambiguous send is retained as `needs-attention` to avoid re-sending beyond the
provider's 24-hour idempotency guarantee. Inspect function error logs and these
records when investigating failed mail. Do not blindly delete delivery records
or replay old ambiguous deliveries; first check the provider's delivery log.

Each project reserves at most 50 notifications/day and 240/month, in UTC, using
`adminEmailState/quota`; reports retain their separate server limit. Limits
count reservations, including failed attempts, conservatively. Exceeding the
limit causes retries until event expiry; the source submission remains available
for admin review even if its email cannot be sent. Email means provider
acceptance, not proof that the recipient read it.

Deploy only the named notification functions with the Firebase CLI. `--force`
is needed for enabling their retry policy. Test with `npm test --prefix functions`.
Rollback by deleting/disabling only the new notification functions; submissions
and the original Messages path remain available. Retain delivery records so a
later redeployment or controlled replay cannot duplicate acknowledged mail.
