// Admin, portfolio and public gallery keep the existing Supabase storage key.
// Client sign-ins use a separate key and broadcast channel so another tab cannot
// replace an Admin editor's session.
export const LEGACY_AUTH_KEY = 'sb-tgvtmwdmwnzwqjzqxbkj-auth-token';
export const CLIENT_AUTH_KEY = 'nickreative-client-auth';
export function isClientPortal(pathname) {
  return pathname === '/login' || pathname.startsWith('/login/') || pathname === '/client' || pathname.startsWith('/client/');
}
export function portalAuthOptions(pathname) {
  return isClientPortal(pathname) ? {auth:{storageKey:CLIENT_AUTH_KEY}} : {};
}
export function migrateClientSession(storage, pathname) {
  if (!isClientPortal(pathname)) return;
  try {
    if (storage.getItem(CLIENT_AUTH_KEY)) return;
    const existing = storage.getItem(LEGACY_AUTH_KEY);
    if (existing && JSON.parse(existing)?.user?.app_metadata?.role === 'client') storage.setItem(CLIENT_AUTH_KEY, existing);
  } catch { /* Unavailable storage or an invalid legacy session: normal sign-in. */ }
}
export async function requireHighlightAdminSession(supabase, initialUser) {
  const {data, error} = await supabase.auth.getUser();
  if (error || !data?.user || data.user.id !== initialUser.id || data.user.app_metadata?.role !== 'admin') {
    const failure = new Error('Your Admin session changed or expired. Sign in to Admin in a new tab, then return here and save again.');
    failure.code = 'HIGHLIGHT_AUTH';
    throw failure;
  }
}
