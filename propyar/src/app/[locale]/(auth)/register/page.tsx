import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { AuthForm } from '@/components/auth/AuthForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.meta.register.title,
    description: dict.meta.register.description,
    robots: { index: false, follow: true },
  };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  return (
    <Suspense>
      <AuthForm mode="register" locale={loc} dict={dict.auth} />
    </Suspense>
  );
}
