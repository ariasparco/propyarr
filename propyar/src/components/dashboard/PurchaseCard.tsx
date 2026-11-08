'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/format';
import { path } from '@/lib/routes';
import { planAccent } from '@/lib/plan-accents';
import type { Locale } from '@/i18n/config';
import type { PlanView } from '@/lib/types';
import type { DetailGroup } from '@/lib/plan-display';
import { SITE } from '@/lib/constants';

type CheckoutT = {
  buy: string;
  chooseMethod: string;
  rial: string;
  card: string;
  cardHint: string;
  cardTitle: string;
  cardSteps: string;
  cardAmount: string;
  cardReference: string;
  usdt: string;
  pay: string;
  processing: string;
  cryptoTitle: string;
  sendAmount: string;
  toAddress: string;
  network: string;
  checking: string;
  iPaid: string;
  success: string;
  failed: string;
  close: string;
  sandboxNote: string;
  review: string;
  goDashboard: string;
  toman: string;
  discountLabel: string;
  discountPlaceholder: string;
  apply: string;
  discountApplied: string;
  discountBad: string;
  useWallet: string;
  walletAvailable: string;
  listPrice: string;
  toPay: string;
  rialDisabled: string;
  watching: string;
  notFound: string;
  unavailable: string;
  expired: string;
  timeLeft: string;
  cancel: string;
  alreadyUsed: string;
};

type Crypto = {
  address: string;
  amount: string;
  network: string;
  orderId: string;
};

type Quote = {
  listPrice: number;
  discountCode: string | null;
  discountAmount: number;
  payable: number;
  walletAvailable: number;
  walletApplied: number;
  dueNow: number;
  discountProblem: string | null;
};

type ChainState =
  | null
  | 'CHECKING'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'EXPIRED'
  | 'USED';

function formatCountdown(seconds: number, locale: Locale): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const text = `${m}:${String(s).padStart(2, '0')}`;
  return locale === 'fa'
    ? text.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
    : text;
}

export function PurchaseCard({
  plan,
  locale,
  t,
  tomanPrice,
  usdIrrRate,
  methods,
  walletBalance,
  details,
  typeLabel,
  popularLabel,
  feeLabel,
}: {
  plan: PlanView;
  locale: Locale;
  t: CheckoutT;
  /** The plan's list price in Toman, shown before a quote has been fetched. */
  tomanPrice: number;
  /**
   * Rial per dollar, so the Toman figure can be recomputed from what is
   * actually owed.
   *
   * It used to be a single number worked out on the server from the list price,
   * which meant a discount came off the dollar figure and left the Toman one
   * untouched. On a card-to-card order that figure is not decoration — it is
   * the amount the customer is told to transfer.
   */
  usdIrrRate: number;
  /** Payment methods currently open to customers. */
  methods: Array<'card' | 'paystar' | 'usdt'>;
  /** Store credit available to spend on this purchase. */
  walletBalance: number;
  /** The plan's rules, grouped by stage, shown before the buy button. */
  details?: DetailGroup[];
  /** Plan model label, e.g. "تک مرحله‌ای". */
  typeLabel?: string;
  /** Label for the "most popular" ribbon, when the plan carries it. */
  popularLabel?: string;
  feeLabel?: string;
}) {
  const router = useRouter();
  const accent = planAccent(plan.slug);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'card' | 'paystar' | 'usdt'>(
    methods[0] ?? 'usdt',
  );
  const [code, setCode] = useState('');
  const [useWallet, setUseWallet] = useState(false);
  const [priced, setPriced] = useState<Quote | null>(null);
  const [codeState, setCodeState] = useState<'idle' | 'checking' | 'bad'>(
    'idle',
  );
  const [loading, setLoading] = useState(false);
  const [crypto, setCrypto] = useState<Crypto | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  // Set when the customer chose card-to-card: what to quote to support, and
  // which account to quote it to.
  const [card, setCard] = useState<{ reference: string; support: string } | null>(
    null,
  );
  // Outcome of the last on-chain lookup.
  const [chainState, setChainState] = useState<ChainState>(null);
  const [watching, setWatching] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // What the customer actually owes, in Toman. Falls back to the list price
  // only until the first quote comes back.
  const tomanDue =
    priced && usdIrrRate > 0
      ? Math.round((priced.dueNow * usdIrrRate) / 10)
      : tomanPrice;
  const tomanText = tomanDue.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US');

  const done = () => {
    router.push(path(locale, '/dashboard'));
    router.refresh();
  };

  /** Re-prices the purchase whenever the code or credit choice changes. */
  async function refreshQuote(nextCode: string, nextWallet: boolean) {
    setCodeState(nextCode ? 'checking' : 'idle');
    try {
      const res = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: plan.id,
          discountCode: nextCode || undefined,
          useWallet: nextWallet,
        }),
      });
      const data: Quote = await res.json();
      if (!res.ok) throw new Error('failed');
      setPriced(data);
      setCodeState(nextCode && data.discountProblem ? 'bad' : 'idle');
    } catch {
      setCodeState('idle');
    }
  }

  async function pay() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: plan.id,
          paymentMethod: method,
          discountCode: priced?.discountCode || undefined,
          useWallet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('failed');
      if (data.status === 'REDIRECT') {
        window.location.href = data.redirectUrl;
      } else if (data.status === 'CRYPTO') {
        setCrypto({ ...data.crypto, orderId: data.orderId });
      } else if (data.status === 'CARD') {
        setCard({ reference: data.reference, support: data.support });
      } else if (data.status === 'REVIEW' || data.status === 'PAID') {
        setReview(true);
      }
    } catch {
      setMsg(t.failed);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Asks the server once about the transfer. Every branch ends in a definite
   * state — the customer is never left staring at an in-progress message that
   * will not change on its own.
   */
  const checkOnce = useCallback(async (): Promise<boolean> => {
    if (!crypto) return true;
    try {
      const res = await fetch('/api/payments/usdt/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: crypto.orderId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setChainState(data.error === 'tx_already_used' ? 'USED' : 'UNAVAILABLE');
        return data.error === 'tx_already_used';
      }
      if (data.status === 'REVIEW' || data.status === 'PAID') {
        setReview(true);
        return true; // settled — stop polling
      }
      if (typeof data.secondsLeft === 'number') setSecondsLeft(data.secondsLeft);

      if (data.status === 'EXPIRED') {
        setChainState('EXPIRED');
        return true;
      }
      setChainState(data.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'NOT_FOUND');
      return false;
    } catch {
      setChainState('UNAVAILABLE');
      return false;
    }
  }, [crypto]);

  /** Starts watching the chain; the button never needs pressing twice. */
  async function watchChain() {
    if (watching) return;
    setWatching(true);
    setChainState('CHECKING');
    const settled = await checkOnce();
    if (settled) setWatching(false);
  }

  // Re-checks on a timer while watching, so the answer arrives without the
  // customer doing anything. Cleared on unmount and once settled.
  useEffect(() => {
    if (!watching) return;
    const id = setInterval(async () => {
      const settled = await checkOnce();
      if (settled) setWatching(false);
    }, 15_000);
    pollRef.current = id;
    return () => clearInterval(id);
  }, [watching, checkOnce]);

  // Local countdown so the remaining time moves between server replies.
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const id = setInterval(
      () => setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1))),
      1000,
    );
    return () => clearInterval(id);
  }, [secondsLeft]);

  async function cancelOrder() {
    if (!crypto) return;
    setWatching(false);
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: crypto.orderId }),
      });
    } catch {
      /* the order expires on its own regardless */
    }
    setCrypto(null);
    setChainState(null);
    setSecondsLeft(null);
    setOpen(false);
  }

  return (
    <div
      style={{ '--accent': accent } as CSSProperties}
      className="card relative flex flex-col overflow-hidden p-6 transition-all duration-300 hover:border-[var(--accent)] hover:shadow-[0_20px_50px_-24px_var(--accent)]"
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-14 end-[-15%] h-32 w-32 rounded-full opacity-20 blur-3xl"
        style={{ background: accent }}
      />

      <div className="flex items-center justify-between gap-2">
        {typeLabel ? (
          <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-bold text-brand-400">
            {typeLabel}
          </span>
        ) : (
          <span className="text-xs text-white/40">{plan.name}</span>
        )}
        {plan.popular && popularLabel && (
          <span className="rounded-full bg-gold-400 px-2.5 py-0.5 text-[11px] font-extrabold text-[#3A2A00]">
            ★ {popularLabel}
          </span>
        )}
      </div>
      <p dir="ltr" className="mt-3 text-center font-sans text-3xl font-black text-white">
        ${plan.virtualCapital.toLocaleString('en-US')}
      </p>
      <p className="mt-1 text-center text-sm text-white/55">
        {feeLabel}{' '}
        <span dir="ltr" className="font-sans text-lg font-black text-brand-400">
          ${plan.price.toLocaleString('en-US')}
        </span>
      </p>

      {details && details.length > 0 && (
        <div className="mt-4 space-y-3">
          {details.map((g) => (
            <div key={g.title} className="rounded-xl border border-white/[0.07] bg-ink-750 p-3">
              <p className="mb-2 text-xs font-extrabold text-brand-300">{g.title}</p>
              <dl className="space-y-1.5">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <dt className="text-white/60">{k}</dt>
                    <dd className="text-end font-bold text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      {review && (
        <div className="mt-5 space-y-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-center">
          <p className="text-sm leading-relaxed text-white/85">{t.review}</p>
          <button type="button" onClick={done} className="btn-primary w-full">
            {t.goDashboard}
          </button>
        </div>
      )}

      {/* Ordered by card-to-card. The money has not been sent yet, so this is
          an instruction rather than a receipt: what to transfer, who to send
          the proof to, and the reference that ties the two together. */}
      {!review && card && (
        <div className="mt-5 space-y-3 rounded-xl border border-brand-500/30 bg-brand-500/[0.08] p-4 text-sm">
          <p className="font-semibold text-white">{t.cardTitle}</p>
          <p className="text-[0.78rem] leading-relaxed text-white/70">
            {t.cardSteps}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-white/40">{t.cardAmount}</p>
              <p className="font-mono text-base font-bold text-brand-300">
                {tomanText} {t.toman}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/40">{t.cardReference}</p>
              <p dir="ltr" className="font-mono text-base font-bold text-white">
                {card.reference}
              </p>
            </div>
          </div>
          <a
            href={`https://t.me/${card.support}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            <span dir="ltr" className="font-mono">
              @{card.support}
            </span>
          </a>
          <button
            type="button"
            onClick={done}
            className="w-full rounded-xl border border-white/10 py-2 text-xs text-white/60 transition-colors hover:bg-white/5"
          >
            {t.goDashboard}
          </button>
        </div>
      )}

      {!review && !card && !open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            void refreshQuote('', false);
          }}
          className="btn mt-5 w-full font-semibold text-paper transition-[filter] hover:brightness-110"
          style={{ background: accent }}
        >
          {t.buy}
        </button>
      )}

      {!review && !card && open && !crypto && (
        <div className="mt-5 space-y-3">
          {/* Discount code */}
          <div>
            <p className="field-label">{t.discountLabel}</p>
            <div className="mt-1 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t.discountPlaceholder}
                dir="ltr"
                className="field-input py-2 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => refreshQuote(code, useWallet)}
                disabled={codeState === 'checking'}
                className="shrink-0 rounded-xl border border-white/15 px-4 text-xs text-white/70 transition-colors hover:bg-white/5"
              >
                {t.apply}
              </button>
            </div>
            {priced?.discountCode && (
              <p className="mt-1.5 text-xs text-emerald-300">
                {t.discountApplied} — {formatCurrency(priced.discountAmount, locale)}
              </p>
            )}
            {codeState === 'bad' && (
              <p className="mt-1.5 text-xs text-red-300">{t.discountBad}</p>
            )}
          </div>

          {/* Store credit */}
          {walletBalance > 0 && (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm text-white/80 transition-colors hover:border-white/20">
              <input
                type="checkbox"
                checked={useWallet}
                onChange={(e) => {
                  setUseWallet(e.target.checked);
                  void refreshQuote(code, e.target.checked);
                }}
                className="accent-brand-500"
              />
              <span className="flex-1">{t.useWallet}</span>
              <span className="font-mono text-xs text-brand-300">
                {formatCurrency(walletBalance, locale)}
              </span>
            </label>
          )}

          {/* Price breakdown */}
          {priced && (
            <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs">
              <div className="flex justify-between text-white/50">
                <span>{t.listPrice}</span>
                <span className="font-mono">
                  {formatCurrency(priced.listPrice, locale)}
                </span>
              </div>
              {priced.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>{t.discountLabel}</span>
                  <span className="font-mono">
                    −{formatCurrency(priced.discountAmount, locale)}
                  </span>
                </div>
              )}
              {priced.walletApplied > 0 && (
                <div className="flex justify-between text-brand-300">
                  <span>{t.useWallet}</span>
                  <span className="font-mono">
                    −{formatCurrency(priced.walletApplied, locale)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-white/[0.07] pt-1.5 text-sm font-semibold text-white">
                <span>{t.toPay}</span>
                <span className="font-mono">
                  {formatCurrency(priced.dueNow, locale)}
                </span>
              </div>
            </div>
          )}

          {priced && priced.dueNow > 0 && (
            <p className="text-xs font-medium text-white/60">{t.chooseMethod}</p>
          )}



          {priced && priced.dueNow > 0 && methods.map((m) => (
            <label
              key={m}
              className={
                'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ' +
                (method === m
                  ? 'border-brand-500/50 bg-brand-500/10 text-white'
                  : 'border-white/10 text-white/70 hover:border-white/20')
              }
            >
              <input
                type="radio"
                name={`m-${plan.id}`}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="accent-brand-500"
              />
              <span className="flex-1">
                {m === 'card' ? t.card : m === 'paystar' ? t.rial : t.usdt}
              </span>
              {m !== 'usdt' && (
                <span className="font-mono text-xs text-white/45">
                  {tomanText} {t.toman}
                </span>
              )}
            </label>
          ))}
          {/* Directly under the selected card-to-card row and the Toman figure
              printed beside it — the transfer is arranged with a person, and
              that is the next thing the customer needs to know. */}
          {priced && priced.dueNow > 0 && method === 'card' && (
            <p className="rounded-xl border border-brand-500/25 bg-brand-500/[0.07] px-3 py-2 text-[0.72rem] leading-relaxed text-brand-100/85">
              {t.cardHint}{' '}
              <a
                href={`https://t.me/${SITE.supportTelegram}`}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="font-mono font-semibold text-brand-300 underline underline-offset-2"
              >
                @{SITE.supportTelegram}
              </a>
            </p>
          )}

          <button
            type="button"
            onClick={pay}
            disabled={loading || !priced}
            className="btn-primary w-full disabled:opacity-60"
          >
            {loading ? t.processing : t.pay}
          </button>
          {msg && <p className="text-center text-xs text-white/50">{msg}</p>}
        </div>
      )}

      {!review && !card && crypto && (
        <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-ink-900/60 p-4 text-sm">
          <p className="font-semibold text-white">{t.cryptoTitle}</p>
          <div>
            <p className="text-xs text-white/40">{t.sendAmount}</p>
            <p className="font-mono text-lg font-bold text-brand-300">
              {crypto.amount} USDT
            </p>
          </div>
          <div>
            <p className="text-xs text-white/40">
              {t.network}: {crypto.network}
            </p>
            <p className="text-xs text-white/40">{t.toAddress}</p>
            <p className="mt-1 break-all rounded-lg bg-black/40 p-2 font-mono text-xs text-white/80">
              {crypto.address}
            </p>
          </div>
          {secondsLeft !== null && chainState !== 'EXPIRED' && (
            <p className="text-xs text-white/40">
              {t.timeLeft}:{' '}
              <span className="font-mono text-white/70">
                {formatCountdown(secondsLeft, locale)}
              </span>
            </p>
          )}

          {chainState === null && (
            <button
              type="button"
              onClick={watchChain}
              className="btn-primary w-full"
            >
              {t.iPaid}
            </button>
          )}

          {chainState === 'CHECKING' && (
            <p className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-white/70">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
              {t.checking}
            </p>
          )}

          {chainState === 'NOT_FOUND' && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs leading-relaxed text-amber-200">
                {t.notFound}
              </p>
              {watching && (
                <p className="flex items-center gap-2 text-[0.7rem] text-amber-300/70">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  {t.watching}
                </p>
              )}
            </div>
          )}

          {chainState === 'UNAVAILABLE' && (
            <div className="space-y-2 rounded-lg border border-white/15 bg-white/[0.04] p-3">
              <p className="text-xs leading-relaxed text-white/70">
                {t.unavailable}
              </p>
              <button
                type="button"
                onClick={watchChain}
                className="btn-ghost w-full py-2 text-xs"
              >
                {t.iPaid}
              </button>
            </div>
          )}

          {chainState === 'EXPIRED' && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300">
              {t.expired}
            </p>
          )}

          {chainState === 'USED' && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300">
              {t.alreadyUsed}
            </p>
          )}

          <button
            type="button"
            onClick={cancelOrder}
            className="w-full text-center text-xs text-white/40 transition-colors hover:text-white/70"
          >
            {t.cancel}
          </button>
        </div>
      )}
    </div>
  );
}
