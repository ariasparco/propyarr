// Small stroke icons shared by the Propyar marketing pages.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function RocketIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </Base>
  );
}

export function UserIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Base>
  );
}

export function LayersIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m12 2 10 5-10 5L2 7l10-5z" />
      <path d="m2 12 10 5 10-5" />
      <path d="m2 17 10 5 10-5" />
    </Base>
  );
}

export function HeadsetIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 15a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3z" />
      <path d="M3 15a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1H3z" />
      <path d="M19 17v1a3 3 0 0 1-3 3h-3" />
    </Base>
  );
}

export function BarsIcon(p: IconProps) {
  return (
    <Base {...p} fill="currentColor" stroke="none">
      <rect x="3" y="13" width="4.5" height="8" rx="1" />
      <rect x="9.75" y="8" width="4.5" height="13" rx="1" />
      <rect x="16.5" y="3" width="4.5" height="18" rx="1" />
    </Base>
  );
}

export function BoltIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </Base>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Base>
  );
}

export function ArrowIcon(p: IconProps) {
  // Points toward the reading direction's end (left in RTL).
  return (
    <Base {...p}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Base>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function ChevronIcon({ dir, ...p }: IconProps & { dir: 'left' | 'right' }) {
  return (
    <Base {...p}>
      {dir === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </Base>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Base>
  );
}

export function ChatIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" strokeWidth="2.6" />
    </Base>
  );
}

export function StarIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      <path d="m12 2 3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9 12 2z" />
    </svg>
  );
}

// USDT (Tether) coin mark.
export function TetherIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path
        fill="#fff"
        d="M17.9 17.4v0c-.1 0-.7.1-2 .1-1 0-1.8 0-2-.1-4-.2-7-.9-7-1.7s3-1.5 7-1.7v2.7c.3 0 1 .1 2 .1 1.2 0 1.8-.1 2-.1v-2.7c4 .2 7 .9 7 1.7s-3 1.5-7 1.7zm0-3.7v-2.4h5.6V7.6H8.4v3.7H14v2.4c-4.5.2-7.9 1.1-7.9 2.2s3.4 2 7.9 2.2V26h3.9v-7.9c4.5-.2 7.9-1.1 7.9-2.2s-3.4-2-7.9-2.2z"
      />
    </svg>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </Base>
  );
}

export function HedgeIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m16 3 4 4-4 4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4-4" />
      <path d="M4 17h16" />
    </Base>
  );
}

export function UsersIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Base>
  );
}

export function GoldIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 20h16l-2.5-6h-11z" />
      <path d="M8.5 14 10 9h4l1.5 5" />
      <path d="M12 3v3M7.5 5l1.5 2M16.5 5 15 7" />
    </Base>
  );
}

export function NoteIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Base>
  );
}

export function ShieldAlertIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 8v4M12 16h.01" />
    </Base>
  );
}

export function TargetIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </Base>
  );
}

export function UserPlusIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M19 8v6M16 11h6" />
    </Base>
  );
}

export function CardIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h4" />
    </Base>
  );
}

export function TrophyIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4" />
    </Base>
  );
}

export function CrownIcon(p: IconProps) {
  return (
    <Base {...p} fill="currentColor" stroke="none">
      <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z" />
    </Base>
  );
}

export function CopyIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Base>
  );
}

export function PercentIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M19 5 5 19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Base>
  );
}

export function ExternalIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </Base>
  );
}

export function PenIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Base>
  );
}
