'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';

export type TicketT = {
  newTicket: string;
  subject: string;
  message: string;
  send: string;
  sending: string;
  empty: string;
  reply: string;
  replyPlaceholder: string;
  closedNote: string;
  you: string;
  support: string;
  failed: string;
  cancel: string;
  statuses: Record<string, string>;
};

export type TicketView = {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
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

export function TicketPanel({
  locale,
  tickets,
  t,
}: {
  locale: Locale;
  tickets: TicketView[];
  t: TicketT;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(tickets.length === 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: String(fd.get('subject') ?? ''),
          body: String(fd.get('body') ?? ''),
        }),
      });
      if (!res.ok) throw new Error('failed');
      form.reset();
      setComposing(false);
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function reply(ticketId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch('/api/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, body: String(fd.get('body') ?? '') }),
      });
      if (!res.ok) throw new Error('failed');
      form.reset();
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="btn-primary"
        >
          {t.newTicket}
        </button>
      )}

      {composing && (
        <form onSubmit={create} className="card space-y-3 p-6">
          <h3 className="text-lg font-semibold text-white">{t.newTicket}</h3>
          <div>
            <label htmlFor="subject" className="field-label">
              {t.subject}
            </label>
            <input id="subject" name="subject" required className="field-input" />
          </div>
          <div>
            <label htmlFor="body" className="field-label">
              {t.message}
            </label>
            <textarea
              id="body"
              name="body"
              required
              rows={4}
              className="field-input resize-y"
            />
          </div>
          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? t.sending : t.send}
            </button>
            {tickets.length > 0 && (
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="btn-ghost"
              >
                {t.cancel}
              </button>
            )}
          </div>
        </form>
      )}

      {tickets.length === 0 && !composing ? (
        <p className="card p-10 text-center text-white/50">{t.empty}</p>
      ) : (
        tickets.map((ticket) => {
          const expanded = openId === ticket.id;
          return (
            <div key={ticket.id} className="card overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : ticket.id)}
                className="flex w-full items-center justify-between gap-3 p-5 text-start transition-colors hover:bg-white/[0.02]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {ticket.subject}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    {formatDate(ticket.createdAt, locale)} ·{' '}
                    {ticket.messages.length}
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

              {expanded && (
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

                  {ticket.status === 'CLOSED' ? (
                    <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/50">
                      {t.closedNote}
                    </p>
                  ) : (
                    <form
                      onSubmit={(e) => reply(ticket.id, e)}
                      className="mt-4 space-y-2"
                    >
                      <textarea
                        name="body"
                        required
                        rows={3}
                        placeholder={t.replyPlaceholder}
                        className="field-input resize-y"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="btn-primary w-full sm:w-auto sm:px-8"
                      >
                        {busy ? t.sending : t.reply}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
