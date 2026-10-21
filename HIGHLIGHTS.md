# Highlights/Stories

In Content, select **Highlights/Stories** in the Content preview menu. Liven starts with Beach Road, Carabella, Coastline and Willow Rise, using the supplied covers and profile logo. The three-column post grid mirrors the current approvals queue, without opening posts or changing approvals.

Click a circle to play its saved stories. Images advance after five seconds of visible playback. Videos advance when they end, start muted, and offer sound controls. Previous/next arrows and keyboard arrows navigate, pause preserves progress, Escape closes, and playback skips empty highlights and closes after the last story. Background tabs pause playback.

Admins select **Edit** below a circle to rename it (15 characters), replace the cover, append images/videos, reorder with the up/down buttons, and remove items. **Preview edits** plays the draft. **Save highlight** persists it for clients. Uploads accept JPG, PNG, WebP, GIF, AVIF, MP4, WebM and MOV, with 50 MB per file and 100 items per highlight; MP4 is recommended for browser compatibility. Removed items leave the highlight when saved; stored original files are retained. Feedback remains by email. This does not publish to Instagram or send email.

The `story_highlights` table stores ordered media, covers and revision numbers. RLS permits only Admin writes and assigned-client reads. Saves match the previous revision to reject stale edits. Media uses the existing `social-media` bucket and its existing Admin upload permissions. The supplied cover files are served by the CMS. No service key is used by the browser.

Validation: `node --test tests/*.test.mjs`; `supabase/tests/highlights_access.sql` runs transactional role, cross-client and revision tests and rolls back all test changes. The migration is additive. Browser checks use a separate local fixture, leaving live posts and story uploads untouched.
