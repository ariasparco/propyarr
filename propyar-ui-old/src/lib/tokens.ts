// Edge-safe JWT helpers (jose only — no server-only imports).
// Used by both auth.ts (Node) and middleware.ts (Edge).
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
);
const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
);

export const ACCESS_COOKIE = 'pf_access';
export const REFRESH_COOKIE = 'pf_refresh';
export const ACCESS_TTL = 60 * 15; // 15 minutes
export const REFRESH_TTL = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = {
  sub: string;
  email: string;
  name: string;
  role: string;
};

export async function signAccessToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .sign(ACCESS_SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL}s`)
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);
    return payloadToUser(payload);
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_SECRET);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function payloadToUser(payload: JWTPayload): SessionUser | null {
  if (!payload.sub) return null;
  return {
    sub: payload.sub,
    email: String(payload.email ?? ''),
    name: String(payload.name ?? ''),
    role: String(payload.role ?? 'USER'),
  };
}
