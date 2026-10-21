import { createClient } from "/assets/js/vendor/supabase.js";

import {portalAuthOptions, migrateClientSession} from '/assets/js/portal-auth.js';

try { migrateClientSession(window.localStorage, window.location.pathname); } catch {}

export const supabase = createClient(
  "https://tgvtmwdmwnzwqjzqxbkj.supabase.co",
  "sb_publishable_8IB-F3e6XLAgnzWy6S3rhw_NpLyF92p",
  portalAuthOptions(window.location.pathname)
);
