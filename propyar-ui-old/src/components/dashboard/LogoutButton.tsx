'use client';

import { useRouter } from 'next/navigation';
import { path } from '@/lib/routes';
import type { Locale } from '@/i18n/config';

export function LogoutButton({
  locale,
  label,
  className = 'btn-ghost w-full',
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(path(locale, '/login'));
    router.refresh();
  }
  return (
    <button type="button" onClick={logout} className={className}>
      {label}
    </button>
  );
}
