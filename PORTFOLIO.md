# Photography portfolio

Public `/` replaces the former login redirect with a unified photography gallery. Existing client `/login/`, `/client/portal/`, admin `/admin/portal/`, calendar, approvals and downloads remain in place. `/client/login/` links to the existing client sign-in. `/admin/portfolio/` uses existing Supabase Auth accounts with the protected `app_metadata.role=admin` assignment. The admin login supports `?next=portfolio` as an explicit allowlisted destination.

## Content workflow

Bulk drop or choose JPEG, PNG, WebP or AVIF files. There is no file-count cap. Uploads run sequentially to bound memory and bandwidth, retain per-file errors and support retrying failed files. Browser decoding respects EXIF orientation. WebP copies (maximum 3200px full image, 1000px preview) preserve proportions; keep original masters outside this website. Width and height record source dimensions. New uploads are hidden until published. Add descriptive alt text before publishing.

Edit titles, alt text and categories, then Save changes. Move work using the drag handle or Earlier/Later buttons. Category create, rename and delete are data driven. Deleting a category keeps its images uncategorised in All. Per-image saves use updated_at to reject concurrent edits. Reordering runs in one database transaction and rejects stale image lists. Concurrent category/name collisions return database errors rather than overwriting data.

## Access and storage

The additive photography_portfolio migration creates two RLS-enabled tables, indexes, a private `portfolio` Storage bucket and policies. Visitors and ordinary clients can read categories and published image records; only admins can change portfolio data or upload files. Storage SELECT requires a published record pointing to the object, or an admin role. No service key is present in this feature. Existing portal tables, policies, buckets and Auth assignments are untouched.

Image URLs are signed for ten minutes. Hiding or deleting a photograph immediately removes it from new gallery queries and prevents newly signed public URLs. Previously signed URLs can remain usable until their ten-minute expiry; downloaded copies cannot be recalled. Portfolio pages cache signed URLs for nine minutes. Public metadata paginates in batches of 24; admin/category reads paginate in batches of 200 without a total-count ceiling. Native image lazy loading plus an intersection observer delays image URL requests until images approach the viewport.

The fullscreen dialog supports Escape, arrows, swipe, visible close/navigation buttons, focus containment and return to the opener. The masonry layout uses two balanced columns and one column at 650px and below. Image source dimensions reserve space and avoid forced cropping.

## Verification and release

Run existing `node --test tests/*.test.mjs`. Run rollback-only `supabase/tests/portfolio_access.sql` against the connected project to verify anonymous, admin, client and spoofed-user-metadata permissions. Storage SELECT was additionally verified with rollback-only checks against imported published and temporarily hidden objects. Browser verification should cover 390px, tablet and desktop, uploading multiple files including an invalid format, metadata save, hidden/published filtering, category changes and ordering. No video is included.

A Vercel preview should be reviewed before assigning Nickreative.com. The existing project currently has Vercel Authentication protection on generated URLs; preserve it. Domain setup and a production promotion are separate from the preview. Existing client media is not copied into the public portfolio.

## Format import

All 76 unique photographs published in Format's public homepage/travel/fashion galleries were imported successfully into Supabase Storage through an authenticated one-time local tool. They are not hotlinked. The local migration tool requires the existing admin account and writes through ordinary RLS-protected Storage and database APIs. Source images were deduplicated by Format asset ID. The available published web copies are used, not presumed original master files. Suggested categories and descriptive alt text can be revised in the studio. Imported public work is published; new manual uploads default to hidden.
