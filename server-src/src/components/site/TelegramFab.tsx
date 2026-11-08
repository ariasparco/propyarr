import { SITE } from '@/lib/constants';
import type { Locale } from '@/i18n/config';

/**
 * Floating Telegram button, pinned to the bottom-left corner of every page.
 *
 * Deliberately a plain link and a server component: no state, no effects, no
 * client bundle.
 *
 * The side is fixed rather than mirrored with the text direction. In Persian
 * that puts it opposite the reading edge, which is where it belongs: the
 * right-hand corner in an RTL layout is where scrollbars, back gestures and the
 * eye all end up, and a permanent button there competes with the page.
 *
 * `z-40` keeps it under the rule-check modal (`z-50`), which would otherwise be
 * overlapped by a button floating on top of it.
 */
export function TelegramFab({ locale }: { locale: Locale }) {
  const fa = locale === 'fa';
  const label = fa ? 'عضویت در گروه تلگرام' : 'Join our Telegram group';

  return (
    <a
      href={`https://t.me/${SITE.telegram}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="group fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-lg shadow-[#229ED9]/30 outline-none transition-transform duration-200 hover:scale-110 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 sm:bottom-6 sm:left-6"
    >
      {/* A soft pulse so the button is noticed once without ever demanding
          attention. `motion-reduce` switches it off for anyone who asked. */}
      <span
        aria-hidden
        className="absolute inset-0 animate-ping rounded-full bg-[#229ED9]/40 motion-reduce:hidden"
        style={{ animationDuration: '2.6s' }}
      />
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="currentColor"
        className="relative h-6 w-6 translate-x-[1px]"
      >
        <path d="M21.94 4.6 18.6 20.3c-.25 1.1-.9 1.38-1.83.86l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.14 9.36-8.46c.4-.36-.09-.56-.63-.2L5.78 13.2.8 11.64c-1.08-.34-1.1-1.08.23-1.6L20.54 2.5c.9-.33 1.69.2 1.4 2.1Z" />
      </svg>
    </a>
  );
}
