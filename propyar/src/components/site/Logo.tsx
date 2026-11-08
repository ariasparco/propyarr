import { SITE } from '@/lib/constants';

// Handshake mark + Latin wordmark. The wordmark is always Latin ("PROPYAR"),
// so the pair is laid out LTR even inside the Persian (RTL) header.
export function Logo({
  name,
  className = '',
}: {
  name?: string;
  className?: string;
}) {
  const wordmark = /[a-z]/i.test(name ?? '') ? name : SITE.name;
  return (
    <span dir="ltr" className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#pyg)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_0_8px_rgba(46,235,158,0.55)]"
      >
        <path d="m11 17 2 2a1 1 0 1 0 3-3" />
        <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
        <path d="m21 3 1 11h-2" />
        <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
        <path d="M3 4h8" />
        <defs>
          <linearGradient id="pyg" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8FFCCD" />
            <stop offset="1" stopColor="#14D98A" />
          </linearGradient>
        </defs>
      </svg>
      <span className="font-sans text-2xl font-extrabold tracking-tight text-white">
        {wordmark}
      </span>
    </span>
  );
}
