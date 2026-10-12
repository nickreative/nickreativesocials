# Account access

Assign `role` (`admin` or `client`) and, for clients, `client` in Supabase Auth app_metadata using trusted administrative tooling. Never accept these assignments from user_metadata or user input. Preserve existing provider metadata when assigning access. New accounts without assignments have no post or media write access.

Existing accounts were assigned through a reviewed explicit email mapping during the security rollout; the migration deliberately does not copy user-editable metadata. Keep account provisioning server-side; never expose service credentials in the portal.

Portals refresh sessions on entry to receive current assignments. JWT authorization changes take effect when tokens refresh or expire. Display names can remain in user_metadata.

The social-media bucket retains its existing public URLs. Public media is accessible to anyone with its URL; private draft media would require a separate private-bucket and signed-URL migration. Upload, update and delete operations are restricted to admins and the social-media bucket.

Run supabase/tests/post_access.sql against a test database with the existing client fixtures. It rolls back every test write and temporarily disables the existing review webhook only within that rolled-back transaction. It exercises RLS as actual database anon/authenticated roles, including spoofed user metadata.
