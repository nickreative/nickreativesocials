# Account access

Assign `role` (`admin` or `client`) and, for clients, `client` in Supabase Auth app_metadata using trusted administrative tooling. Never accept these assignments from user_metadata or user input. Preserve existing provider metadata when assigning access. New accounts without assignments have no post or media write access.

Existing accounts were assigned through a reviewed explicit email mapping during the security rollout; the migration deliberately does not copy user-editable metadata. Keep account provisioning server-side; never expose service credentials in the portal.

Portals refresh sessions on entry to receive current assignments. JWT authorization changes take effect when tokens refresh or expire. Display names can remain in user_metadata.

The social-media bucket retains its existing public URLs. Public media is accessible to anyone with its URL; private draft media would require a separate private-bucket and signed-URL migration. Upload, update and delete operations are restricted to admins and the social-media bucket.

Run supabase/tests/post_access.sql against a test database with the existing client fixtures. It rolls back every test write and temporarily disables the existing review webhook only within that rolled-back transaction. It exercises RLS as actual database anon/authenticated roles, including spoofed user metadata.

# Shared calendar

calendar_ideas stores dates, descriptions, notes and server-stamped author credit. Admins manage all client calendars. Clients read their assigned calendar and edit or archive only their own ideas. Attribution and client ownership cannot be changed. Removals are soft archives.

New client ideas and content changes always enqueue an admin email. Admin ideas/changes enqueue client emails only when notify_clients is selected. Recipients come from protected Auth app_metadata assignments. The email function uses the existing RESEND_API_KEY, FROM_EMAIL, NOTIFY_TO_EMAIL and WEBHOOK_SECRET configuration. Its JWT gateway check is off because it verifies the private webhook secret itself, failing closed if the secret is absent. No service or webhook secret appears in browser code.

calendar_notifications is service-only: RLS is enabled and anon/authenticated have no grants or policies. Its no-policy advisor INFO is intentional. The dispatch secret is stored in Vault. A trigger dispatches immediately; calendar-email-retry checks pending/failed jobs every five minutes. The worker atomically claims jobs and uses provider idempotency keys. It retries failed jobs up to five attempts and recovers stale claims after ten minutes. A sent status means the provider accepted the email, not confirmed inbox delivery. Check calendar_notifications for failed jobs when troubleshooting.

The archived Calendar setup verification entry records the live admin-only email test. It is excluded from the visible calendar. No client test emails were sent.

Calendar dates are all-day planning dates, not publication schedules. This feature does not publish to social networks. Tests: tests/calendar-model.test.mjs, tests/calendar-email.test.mjs and rollback-only supabase/tests/calendar_access.sql. Email unit tests require Node 24 TypeScript stripping support.

# Feedback receipts

Each saved client feedback submission with changes_requested creates a snapshot in feedback_receipts, including the post/caption/media, actual submitter's account email/name and server submission time. Only that submitter receives the receipt, with Reply-To set to nicholasgoodridge@hotmail.com. Approvals do not create feedback receipts. The existing post-review-email function also detects updated submissions when review_status stays unchanged, preserving admin visibility.

The receipt queue is service-only, with an explicit service_role policy and no anon/authenticated grants. The feedback-receipt-email worker authenticates the existing private webhook secret, claims jobs atomically and uses Resend idempotency keys. Failed deliveries retry up to five times through feedback-receipt-retry every five minutes. Sent indicates provider acceptance; inbox delivery is not assumed. Replies are ordinary email and have no inbound CMS integration. The receipt email has plain text and HTML versions, a saved-content snapshot, AEST submission time and a post-specific portal link that survives login.

Validation uses tests/feedback-receipt.test.mjs and rollback-only supabase/tests/feedback_receipts.sql. The Post 000 setup email was sent only to Nick's Hotmail address using sample data; no client feedback or posts were modified by that test.
