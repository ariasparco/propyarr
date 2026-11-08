import { SITE } from '@/lib/constants';

export function Logo({
  name,
  className = '',
}: {
  name?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_0_10px_rgba(201,162,39,0.35)]"
      >
        {/* Hexagon frame */}
        <path
          d="M16 2 L28.1 9 L28.1 23 L16 30 L3.9 23 L3.9 9 Z"
          fill="#111315"
          stroke="url(#pg)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        {/* P monogram with a cut-out counter */}
        <path
          d="M12 7 H19 a5.5 5.5 0 0 1 0 11 H15.5 V25 H12 Z M15.5 10.6 H18.6 a2.4 2.4 0 0 1 0 4.8 H15.5 Z"
          fill="url(#pg)"
          fillRule="evenodd"
        />
        <defs>
          <linearGradient
            id="pg"
            x1="4"
            y1="2"
            x2="28"
            y2="30"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#EACF82" />
            <stop offset="0.5" stopColor="#C9A227" />
            <stop offset="1" stopColor="#A6841E" />
          </linearGradient>
        </defs>
      </svg>
      <span className="font-display text-lg font-bold tracking-wide text-white">
        {name ?? SITE.name}
      </span>
    </span>
  );
}
