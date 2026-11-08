'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';

export type AdminTicketT = {
  reply: string;
  replyPlaceholder: string;
  send: string;
  sending: string;
  close: string;
  reopen: string;
  you: string;
  support: string;
  failed: string;
  statuses: Record<string, string>;
};

export type AdminTicketView = {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  messages: Array<{
    id: string;
    fromAdmin: boolean;
    body: string;
    createdAt: string;
  }>;
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-sky-500/15 text-sky-300',
  ANSWERED: 'bg-emerald-500/15 text-emerald-300',
  CLOSED: 'bg-white/[0.06] text-white/45',
};

export function TicketThread({
  ticket,
  locale,
  t,
}: {
  ticket: AdminTicketView;
  locale: Locale;
  t: AdminTicketT;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(ticket.status === 'OPEN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function reply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.id,
          body: String(fd.get('body') ?? ''),
        }),
      });
      if (!res.ok) throw new Error('failed');
      form.reset();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.id, status }),
      });
      if (!res.ok) throw new Error('failed');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-5 text-start transition-colors hover:bg-white/[0.02]"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{ticket.subject}</p>
          <p className="mt-1 truncate text-xs text-white/40">
            {ticket.userName} · {ticket.userEmail} ·{' '}
            {formatDate(ticket.createdAt, locale)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            STATUS_STYLE[ticket.status] ?? STATUS_STYLE.OPEN
          }`}
        >
          {t.statuses[ticket.status] ?? ticket.status}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] p-5">
          <div className="space-y-3">
            {ticket.messages.map((m) => (
              <div
                key={m.id}
                className={
                  'rounded-xl px-4 py-3 text-sm leading-relaxed ' +
                  (m.fromAdmin
                    ? 'border border-brand-500/25 bg-brand-500/[0.08] text-white/85'
                    : 'border border-white/[0.07] bg-white/[0.02] text-white/75')
                }
              >
                <p className="mb-1.5 text-xs font-medium text-white/40">
                  {m.fromAdmin ? t.support : t.you} ·{' '}
                  {formatDate(m.createdAt, locale)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>

          <form onSubmit={reply} className="mt-4 space-y-2">
            <textarea
              name="body"
              required
              rows={3}
              placeholder={t.replyPlaceholder}
              className="field-input resize-y"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="btn-primary px-6 py-2 text-sm"
              >
                {busy ? t.sending : t.send}
              </button>
              {ticket.status === 'CLOSED' ? (
                <button
                  type="button"
                  onClick={() => setStatus('OPEN')}
                  disabled={busy}
                  className="btn-ghost py-2 text-sm"
                >
                  {t.reopen}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStatus('CLOSED')}
                  disabled={busy}
                  className="btn-ghost py-2 text-sm"
                >
                  {t.close}
                </button>
              )}
            </div>
            {error && <p className="text-xs text-red-300">{t.failed}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
