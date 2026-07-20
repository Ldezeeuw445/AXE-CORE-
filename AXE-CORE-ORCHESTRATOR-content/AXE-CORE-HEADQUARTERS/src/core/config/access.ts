/**
 * Access control configuration.
 * AXE CORE is admin-only — only these emails can access the app.
 */
export const ADMIN_EMAILS = ['lukadezeeuw1994@hotmail.com'];

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes(email ?? '');
}
