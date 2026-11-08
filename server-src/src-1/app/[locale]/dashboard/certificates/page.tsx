import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/format';

export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const rows = await prisma.certificate.findMany({
    where: { userId: session.sub },
    include: {
      account: {
        select: {
          accountNumber: true,
          challenge: { select: { name: true, accountType: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const c = dict.certificate;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">{c.yours}</h2>
        <p className="mt-1 text-sm text-white/50">{c.pageSubtitle}</p>
      </div>

      {rows.length === 0 ? (
        <p className="card p-12 text-center text-white/50">{c.noneYet}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((cert) => (
            <div key={cert.id} className="card overflow-hidden p-0">
              <a
                href={`/api/certificates/${cert.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-black/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/certificates/${cert.id}`}
                  alt=""
                  className="h-36 w-full object-cover object-top"
                />
              </a>
              <div className="space-y-2 p-4">
                <p className="text-sm font-semibold text-brand-300">
                  {c.stages[cert.stage as keyof typeof c.stages] ?? cert.stage}
                </p>
                <p className="text-xs text-white/50">
                  {cert.account.challenge.accountType}{' '}
                  {cert.account.challenge.name} · #{cert.account.accountNumber}
                </p>
                <p className="text-xs text-white/35">
                  {formatDate(cert.createdAt.toISOString(), loc)}
                </p>
                <a
                  href={`/api/certificates/${cert.id}?download=1`}
                  className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/20"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {c.download}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
