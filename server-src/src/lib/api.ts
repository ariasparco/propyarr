import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: object) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// ── Audit log ──────────────────────────────────────────────
export async function audit(
  action: string,
  userId?: string | null,
  meta?: object,
  ip?: string | null,
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: userId ?? null,
        meta: meta ? JSON.stringify(meta) : null,
        ip: ip ?? null,
      },
    });
  } catch {
    /* audit is best-effort */
  }
}

// ── Simple in-memory rate limiter (per-process) ────────────
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  return xff?.split(',')[0]?.trim() ?? 'local';
}
