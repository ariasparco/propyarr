import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from '@/i18n/config';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  verifyAccessToken,
} from '@/lib/tokens';

const PUBLIC_FILE = /\.(.*)$/;

function getLocaleFromPath(pathname: string): string | null {
  const seg = pathname.split('/')[1];
  return (locales as readonly string[]).includes(seg) ? seg : null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip API, Next internals, and static files.
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Ensure a locale prefix. Persian is the default — the site always opens in fa.
  const locale = getLocaleFromPath(pathname);
  if (!locale) {
    const url = req.nextUrl.clone();
    url.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  // Route protection.
  const rest = pathname.replace(`/${locale}`, '') || '/';
  const isDashboard = rest.startsWith('/dashboard');
  // Precise match so /admin-login (the separate admin sign-in) is NOT protected.
  const isAdmin = rest === '/admin' || rest.startsWith('/admin/');

  if (isDashboard || isAdmin) {
    const token = req.cookies.get(ACCESS_COOKIE)?.value;
    const session = token ? await verifyAccessToken(token) : null;

    if (!session) {
      // The access token lasts 15 minutes, the refresh cookie a week. If the
      // short one has simply aged out, renew it instead of ending the session —
      // otherwise everyone gets kicked to the login page mid-task. The renewal
      // happens in a Node route because it needs the database.
      if (req.cookies.get(REFRESH_COOKIE)?.value) {
        const url = req.nextUrl.clone();
        url.pathname = '/api/auth/refresh';
        url.search = '';
        url.searchParams.set('next', pathname + req.nextUrl.search);
        return NextResponse.redirect(url);
      }
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}${isAdmin ? '/admin-login' : '/login'}`;
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    if (isAdmin && session.role !== 'ADMIN') {
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/dashboard`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
