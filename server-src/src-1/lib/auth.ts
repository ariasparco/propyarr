import 'server-only';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TTL,
  REFRESH_TTL,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type SessionUser,
} from './tokens';

export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  verifyAccessToken,
  verifyRefreshToken,
} from './tokens';
export type { SessionUser } from './tokens';

// ── Passwords ──────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Cookie session ─────────────────────────────────────────
export async function setSession(user: SessionUser) {
  const [access, refresh] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user.sub),
  ]);
  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  store.set(ACCESS_COOKIE, access, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TTL,
  });
  store.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TTL,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  const session = token ? await verifyAccessToken(token) : null;
  if (session) return session;

  // The access token has aged out, but the week-long refresh cookie still
  // proves who this is, so the request should go through rather than 401.
  // API routes bypass the middleware, so without this a button clicked after
  // fifteen idle minutes would fail even though the visitor is still signed in.
  //
  // Deliberately read-only: a Server Component render may not set cookies, and
  // getSession is called from both. The middleware writes the new access cookie
  // on the next navigation.
  const refresh = store.get(REFRESH_COOKIE)?.value;
  const userId = refresh ? await verifyRefreshToken(refresh) : null;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return null;

  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
