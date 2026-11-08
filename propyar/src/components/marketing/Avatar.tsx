// Illustrated avatar for a trader review, chosen by the gender the reviewer
// picked. No photos: reviews come from users, and a stock face next to a real
// person's words would misrepresent them.
export function Avatar({
  gender,
  size = 56,
  className = '',
}: {
  gender: string;
  size?: number;
  className?: string;
}) {
  const female = gender === 'female';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`shrink-0 rounded-full ring-2 ring-brand-500/30 ${className}`}
    >
      <defs>
        <clipPath id={`av-${female ? 'f' : 'm'}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#av-${female ? 'f' : 'm'})`}>
        <rect width="64" height="64" fill={female ? '#E3F6EC' : '#DCF3E7'} />
        {female ? (
          <>
            <path d="M16 31C15 15 23 8 32 8s17 7 16 23c0 10-2 17-6 20H22c-4-3-6-10-6-20Z" fill="#3B2417" />
            <path d="M8 66c1-14 11-20 24-20s23 6 24 20Z" fill="#12A867" />
            <path d="M25 46l7 6 7-6" fill="none" stroke="#E8FFF3" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="27.5" y="36" width="9" height="10" rx="3" fill="#E9B48D" />
            <ellipse cx="32" cy="27" rx="10.5" ry="12" fill="#F6CFAD" />
            <path d="M21 26c1-9 7-13 12-13 6 0 11 4 10 12-3-5-9-7-14-4-3 2-6 4-8 5Z" fill="#3B2417" />
            <circle cx="28" cy="28" r="1.2" fill="#2A1C14" />
            <circle cx="36" cy="28" r="1.2" fill="#2A1C14" />
            <path d="M29 33.5c1.8 1.4 4.2 1.4 6 0" fill="none" stroke="#C9775A" strokeWidth="1.3" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M8 66c1-14 11-20 24-20s23 6 24 20Z" fill="#0C7A4B" />
            <path d="M25 46l7 6 7-6" fill="none" stroke="#E8FFF3" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="27" y="35" width="10" height="11" rx="3" fill="#E5AF89" />
            <ellipse cx="20.8" cy="28" rx="2" ry="3" fill="#EDBC97" />
            <ellipse cx="43.2" cy="28" rx="2" ry="3" fill="#EDBC97" />
            <ellipse cx="32" cy="27" rx="11" ry="12.5" fill="#F3C8A2" />
            <path d="M20.5 25c-1-10 5-15 12-15s13 5 11 15c-2-5-6-7-11-7s-10 2-12 7Z" fill="#2A2018" />
            <circle cx="27.8" cy="28" r="1.2" fill="#22180F" />
            <circle cx="36.2" cy="28" r="1.2" fill="#22180F" />
            <path d="M29 33.5c1.8 1.3 4.2 1.3 6 0" fill="none" stroke="#B9684C" strokeWidth="1.3" strokeLinecap="round" />
          </>
        )}
      </g>
    </svg>
  );
}
