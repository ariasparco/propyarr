import Link from 'next/link';
import { isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { path } from '@/lib/routes';
import { Logo } from '@/components/site/Logo';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(50rem 30rem at 50% -10rem, rgba(201,162,39,0.10), transparent 70%), radial-gradient(40rem 30rem at 100% 100%, rgba(15,61,62,0.35), transparent 70%)',
        }}
      />
      <header className="container-x flex h-16 items-center justify-between">
        <Link href={path(loc, '/')} aria-label={dict.nav.home}>
          <Logo name={dict.brand} />
        </Link>
        <LanguageSwitcher locale={loc} />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="container-x py-6 text-center text-xs text-white/30">
        © {new Date().getFullYear()} · {dict.footer.rights}
      </footer>
    </div>
  );
}
