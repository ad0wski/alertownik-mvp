// Google Play admin/public host separation (see src/proxy.ts). The
// pathnames below are admin-only UI routes — everything a signed-in
// session gates today (AuthGate / inline session checks). Never touches
// /api/* on purpose: cron/automation routes have their own auth (secret
// or requireAdminSession) and must keep working regardless of which host
// serves them.
const RESTRICTED_ADMIN_PREFIXES = ["/login", "/admin", "/builder", "/ai-helper"];

export function isRestrictedAdminPath(pathname: string): boolean {
  return RESTRICTED_ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
