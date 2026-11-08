import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProfileEditor } from '@/components/dashboard/ProfileEditor';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc: Locale = isLocale(locale) ? locale : 'fa';
  const dict = getDictionary(loc);
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) return null;
  const pr = dict.dashboard.profile;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-xl font-semibold text-white">{pr.title}</h2>

      <div className="card p-6">
        <h3 className="text-base font-semibold text-white">{pr.personal}</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={dict.auth.name} value={user.name} />
          <Field label={dict.auth.email} value={user.email} />
          <Field
            label={dict.admin.table.role}
            value={
              dict.status[user.role as keyof typeof dict.status] ?? user.role
            }
          />
        </dl>
      </div>

      <ProfileEditor
        initialPhone={user.phone ?? ''}
        kycStatus={user.kycStatus}
        t={dict.kyc}
        labels={{ phone: pr.phone, save: pr.save, saved: pr.saved }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}
