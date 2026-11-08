import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setSession, clearSession, verifyRefreshToken } from '@/lib/auth';
import { REFRESH_COOKIE } from '@/lib/tokens';
import { defaultLocale, locales } from '@/i18n/config';

export const dynamic = 'force-dynamic';

/**
 * Exchanges a valid refresh cookie for a fresh access cookie.
 *
 * The access token lasts 15 minutes; the refresh cookie lasts a week. Without
 * this route the refresh cookie was issued at login and then never used, so
 * everyone — traders and admins alike — was thrown back to the sign-in page a
 * quarter of an hour after logging in.
 *
 * The middleware cannot do this itself: it runs on the edge, where there is no
 * database, and the refresh token carries only a user id. Re-reading the user
 * here is also what makes a role change or a deleted account take effect at
 * once rather than lingering for the life of the token.
 */
export async function GET(req: NextRequest) {
  const back = safeNext(req.nextUrl.searchParams.get('next'));

  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  const userId = token ? await verifyRefreshToken(token) : null;
  if (!userId) return signOut(req, back);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return signOut(req, back);

  await setSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return NextResponse.redirect(new URL(back, req.nextUrl.origin));
}

/** Send the visitor to the right sign-in page and drop the stale cookies. */
async function signOut(req: NextRequest, back: string) {
  await clearSession();
  const locale = localeOf(back);
  const isAdmin = back.startsWith(`/${locale}/admin`);
  const url = new URL(
    `/${locale}${isAdmin ? '/admin-login' : '/login'}`,
    req.nextUrl.origin,
  );
  url.searchParams.set('next', back);
  return NextResponse.redirect(url);
}

/**
 * Only ever redirect back into this site. A `next` value is attacker-supplied,
 * so anything that could leave the origin — an absolute URL, or the
 * protocol-relative `//evil.com` — is discarded.
 */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//'))
    return `/${defaultLocale}/dashboard`;
  return value;
}

function localeOf(pathname: string): string {
  const seg = pathname.split('/')[1];
  return (locales as readonly string[]).includes(seg) ? seg : defaultLocale;
}
