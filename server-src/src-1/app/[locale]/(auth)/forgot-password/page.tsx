import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { ForgotForm } from '@/components/auth/ResetForms';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : 'fa');
  return {
    title: dict.auth.forgotTitle,
    robots: { index: false, follow: false },
  };
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  return (
    <Suspense>
      <ForgotForm locale={loc} dict={dict.auth} />
    </Suspense>
  );
}
