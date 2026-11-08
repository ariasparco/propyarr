import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { SITE } from './constants';

// Renders an achievement certificate as a PNG. The layout is drawn here rather
// than uploaded, so a certificate exists the moment a stage is passed. Admins
// can still upload a bespoke image to replace a generated one.
//
// The artwork follows the house design: black ground, gold rules, a script
// signature line for the trader's name, and the stage stated plainly beneath
// it. If `public/cert/background.png` exists it is used as the ground and only
// the text is drawn on top — that is the way to get the designer's original
// artwork pixel for pixel. Without it the ground is drawn here in the same
// palette, so a certificate is never blocked on an asset being present.
//
// The wording is English throughout: it reads as an international document and
// sidesteps the image renderer's fragile bidirectional text handling. The
// fallback font still covers Persian, so a trader's own name renders correctly.

export const CERT_WIDTH = 1620;
export const CERT_HEIGHT = 1080; // 3:2, matching the supplied artwork

export type CertificateStage = 'PHASE_1' | 'PHASE_2' | 'FUNDED' | 'PAYOUT';

// `lead` is the line above the title, so each stage reads as one sentence.
const STAGE_TITLES: Record<
  CertificateStage,
  { lead: string; title: string; sub: string }
> = {
  PHASE_1: {
    lead: 'FOR SUCCESSFULLY COMPLETING',
    title: 'PHASE ONE',
    sub: 'EVALUATION CHALLENGE',
  },
  PHASE_2: {
    lead: 'FOR SUCCESSFULLY COMPLETING',
    title: 'PHASE TWO',
    sub: 'VERIFICATION CHALLENGE',
  },
  FUNDED: {
    lead: 'IN RECOGNITION OF ACHIEVING',
    title: 'FUNDED TRADER',
    sub: 'LIVE CAPITAL ALLOCATION',
  },
  PAYOUT: {
    lead: 'IN RECOGNITION OF A COMPLETED',
    title: 'PROFIT PAYOUT',
    sub: 'WITHDRAWAL PROCESSED',
  },
};

type Fonts = {
  regular: ArrayBuffer;
  bold: ArrayBuffer;
  script: ArrayBuffer;
  serif: ArrayBuffer;
  serifBold: ArrayBuffer;
};

let fontCache: Fonts | null = null;

const toArrayBuffer = (b: Buffer) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/**
 * Four faces: a display serif for the headings, a script for the name and the
 * signature, and Vazirmatn for everything else — it is the only one of them
 * that covers Persian, so it is also the fallback for a trader whose name is
 * not written in Latin script.
 */
async function loadFonts(): Promise<Fonts> {
  if (fontCache) return fontCache;
  const vazir = path.join(process.cwd(), 'node_modules', 'vazirmatn', 'fonts', 'ttf');
  const certDir = path.join(process.cwd(), 'public', 'cert');
  const [regular, bold, script, serif, serifBold] = await Promise.all([
    readFile(path.join(vazir, 'Vazirmatn-Medium.ttf')),
    readFile(path.join(vazir, 'Vazirmatn-Bold.ttf')),
    readFile(path.join(certDir, 'GreatVibes-Regular.ttf')),
    readFile(path.join(certDir, 'Cinzel-400.ttf')),
    readFile(path.join(certDir, 'Cinzel-700.ttf')),
  ]);
  fontCache = {
    regular: toArrayBuffer(regular),
    bold: toArrayBuffer(bold),
    script: toArrayBuffer(script),
    serif: toArrayBuffer(serif),
    serifBold: toArrayBuffer(serifBold),
  };
  return fontCache;
}

/**
 * The designer's artwork, if it has been dropped in.
 *
 * Looked up once and remembered — including the miss, so a missing file does
 * not cost a failed disk read on every certificate issued.
 */
let backgroundCache: { uri: string | null } | null = null;

async function loadBackground(): Promise<string | null> {
  if (backgroundCache) return backgroundCache.uri;
  for (const name of ['background.png', 'background.jpg']) {
    try {
      const file = await readFile(path.join(process.cwd(), 'public', 'cert', name));
      const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      backgroundCache = { uri: `data:${mime};base64,${file.toString('base64')}` };
      return backgroundCache.uri;
    } catch {
      /* try the next name */
    }
  }
  backgroundCache = { uri: null };
  return null;
}

const GOLD = '#C9A227';
const GOLD_LIGHT = '#EACF82';
const GOLD_DIM = '#8A6F1E';
const INK = '#0A0A0B';
const PAPER = '#F2E6C8';
const MUTED = '#9A9488';

// A deterministic rising series, drawn faintly down the right-hand side.
// Fixed rather than random so every certificate looks identical.
// Each entry is [open, close, high, low] on a 0-100 scale.
const SERIES: Array<[number, number, number, number]> = [
  [18, 26, 29, 16], [26, 23, 30, 21], [23, 32, 35, 22], [32, 29, 36, 27],
  [29, 38, 41, 28], [38, 35, 42, 33], [35, 45, 48, 34], [45, 51, 54, 43],
  [51, 47, 55, 45], [47, 57, 60, 46], [57, 54, 61, 52], [54, 64, 67, 53],
  [64, 60, 68, 58], [60, 70, 74, 59], [70, 77, 80, 68], [77, 73, 81, 71],
  [73, 83, 87, 72], [83, 90, 94, 81],
];

/** Candlestick column down the right edge, behind the text. */
function Candles() {
  const left = CERT_WIDTH - 310;
  const top = 250;
  const height = 560;
  const step = 250 / SERIES.length;
  const scale = (v: number) => top + ((100 - v) / 100) * height;
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', opacity: 0.3 }}>
      {SERIES.map(([open, close, high, low], i) => {
        const up = close >= open;
        const colour = up ? GOLD_LIGHT : GOLD_DIM;
        const x = left + i * step;
        const bodyTop = scale(Math.max(open, close));
        const bodyHeight = Math.max(5, scale(Math.min(open, close)) - bodyTop);
        return (
          <div key={i} style={{ display: 'flex' }}>
            <div
              style={{
                position: 'absolute',
                left: Math.round(x + 4),
                top: Math.round(scale(high)),
                width: 2,
                height: Math.round(Math.max(2, scale(low) - scale(high))),
                background: colour,
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: Math.round(x),
                top: Math.round(bodyTop),
                width: 10,
                height: Math.round(bodyHeight),
                background: up ? colour : 'transparent',
                border: `2px solid ${colour}`,
                display: 'flex',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The four-word motto that sits in each upper corner of the artwork, stacked
 * one word per line under a short gold rule.
 */
function CornerMotto({
  words,
  align,
}: {
  words: string[];
  align: 'left' | 'right';
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 52,
        ...(align === 'left' ? { left: 58 } : { right: 58 }),
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'flex-end',
      }}
    >
      {words.map((w) => (
        <div
          key={w}
          style={{
            fontSize: 15,
            letterSpacing: 4,
            color: PAPER,
            lineHeight: 1.65,
            display: 'flex',
          }}
        >
          {w}
        </div>
      ))}
      <div
        style={{ width: 46, height: 2, background: GOLD, marginTop: 10, display: 'flex' }}
      />
    </div>
  );
}

/**
 * The house mark: a P with the ascending bars set into its bowl.
 *
 * Drawn rather than embedded so a certificate never depends on an asset being
 * in place. When the designer's artwork is supplied it carries the real mark
 * and this is not used.
 */
function LogoMark() {
  const bars = [
    { h: 14, o: 0.5 },
    { h: 22, o: 0.75 },
    { h: 31, o: 1 },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        height: 76,
        position: 'relative',
        width: 120,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 20,
          fontSize: 86,
          lineHeight: 1,
          fontWeight: 700,
          fontFamily: 'Cinzel',
          color: GOLD,
          opacity: 0.85,
          display: 'flex',
        }}
      >
        P
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 26,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
        }}
      >
        {bars.map((b, i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: b.h,
              background: GOLD_LIGHT,
              opacity: b.o,
              display: 'flex',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** One of the three facts along the bottom of the award: rule, label, value. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 300,
      }}
    >
      <div style={{ width: 190, height: 1, background: `${GOLD}77`, display: 'flex' }} />
      <div
        style={{
          fontSize: 15,
          letterSpacing: 4,
          color: MUTED,
          marginTop: 16,
          display: 'flex',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 27,
          fontWeight: 700,
          color: GOLD_LIGHT,
          marginTop: 10,
          display: 'flex',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export async function renderCertificate(opts: {
  name: string;
  stage: CertificateStage;
  accountNumber: string;
  capital: string;
  issuedAt: Date;
}): Promise<Response> {
  const [fonts, background] = await Promise.all([loadFonts(), loadBackground()]);
  const stage = STAGE_TITLES[opts.stage];
  const date = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
    .format(opts.issuedAt)
    .toUpperCase();
  const serial = `${opts.accountNumber}-${opts.stage.replace('_', '')}`;

  // A long name has to shrink rather than wrap: the script face is set on one
  // line between two rules, and a second line would push the award off the page.
  const nameSize = opts.name.length > 26 ? 62 : opts.name.length > 18 ? 76 : 92;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: INK,
          fontFamily: 'Vazirmatn',
          position: 'relative',
        }}
      >
        {background ? (
          // The designer's artwork. Everything below is drawn on top of it, so
          // the decorative layer here is skipped entirely.
          <img
            src={background}
            width={CERT_WIDTH}
            height={CERT_HEIGHT}
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex' }}>
            {/* Ground: a soft lift from the top-left, the way the artwork is lit. */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: CERT_WIDTH,
                height: CERT_HEIGHT,
                background: `linear-gradient(135deg, #15151A 0%, ${INK} 45%, #101014 100%)`,
                display: 'flex',
              }}
            />
            {/* The globe on the left edge, cropped by the page. Lit from the
                upper right so it reads as a sphere rather than a flat disc. */}
            <div
              style={{
                position: 'absolute',
                top: -190,
                left: -280,
                width: 700,
                height: 700,
                borderRadius: 999,
                background: `radial-gradient(circle at 76% 28%, #2A220C 0%, #171308 30%, #0E0C07 52%, ${INK} 70%)`,
                display: 'flex',
              }}
            />
            {/* Diagonal gold cuts across the two facing corners. */}
            <div
              style={{
                position: 'absolute',
                top: 96,
                left: -104,
                width: 360,
                height: 2,
                background: `linear-gradient(90deg, transparent, ${GOLD})`,
                transform: 'rotate(50deg)',
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 58,
                left: -150,
                width: 300,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${GOLD_DIM})`,
                transform: 'rotate(50deg)',
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 92,
                right: -110,
                width: 360,
                height: 2,
                background: `linear-gradient(90deg, ${GOLD}, transparent)`,
                transform: 'rotate(50deg)',
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 54,
                right: -156,
                width: 300,
                height: 1,
                background: `linear-gradient(90deg, ${GOLD_DIM}, transparent)`,
                transform: 'rotate(50deg)',
                display: 'flex',
              }}
            />
            {/* Oversized mark, ghosted into the right-hand side, with the
                candles reading across it. */}
            <div
              style={{
                position: 'absolute',
                top: 180,
                right: 130,
                fontSize: 620,
                lineHeight: 1,
                fontWeight: 700,
                color: GOLD_LIGHT,
                opacity: 0.055,
                fontFamily: 'Cinzel',
                display: 'flex',
              }}
            >
              P
            </div>
            <Candles />
          </div>
        )}

        <CornerMotto words={['FUNDING', 'TRADERS', 'BUILDING', 'FREEDOM']} align="left" />
        <CornerMotto words={['TRADE', 'DISCIPLINE', 'GROW', 'TOGETHER']} align="right" />

        {/* ── Wordmark ───────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 40 }}>
          <LogoMark />
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 12,
            color: GOLD_LIGHT,
            fontFamily: 'Cinzel',
            marginTop: 14,
            display: 'flex',
          }}
        >
          {SITE.name.toUpperCase()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <div style={{ width: 26, height: 1, background: `${GOLD}88`, display: 'flex' }} />
          <div style={{ fontSize: 15, letterSpacing: 4, color: MUTED, display: 'flex' }}>
            propino.top
          </div>
          <div style={{ width: 26, height: 1, background: `${GOLD}88`, display: 'flex' }} />
        </div>

        {/* ── Title ──────────────────────────────────────── */}
        <div
          style={{
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: 16,
            color: GOLD_LIGHT,
            fontFamily: 'Cinzel',
            marginTop: 26,
            display: 'flex',
          }}
        >
          CERTIFICATE
        </div>
        <div
          style={{
            fontSize: 22,
            letterSpacing: 11,
            color: PAPER,
            fontFamily: 'Cinzel',
            marginTop: 8,
            display: 'flex',
          }}
        >
          OF ACHIEVEMENT
        </div>

        {/* ── Recipient ──────────────────────────────────── */}
        <div
          style={{
            fontSize: 16,
            letterSpacing: 5,
            color: PAPER,
            marginTop: 30,
            display: 'flex',
          }}
        >
          THIS CERTIFICATE IS HEREBY PRESENTED TO
        </div>
        <div
          style={{
            fontSize: nameSize,
            color: GOLD_LIGHT,
            fontFamily: 'GreatVibes',
            marginTop: 6,
            lineHeight: 1.25,
            textAlign: 'center',
            maxWidth: 1180,
            display: 'flex',
          }}
        >
          {opts.name}
        </div>
        <div
          style={{
            width: 760,
            height: 1,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            marginTop: 18,
            display: 'flex',
          }}
        />

        {/* ── Award ──────────────────────────────────────── */}
        <div
          style={{
            fontSize: 16,
            letterSpacing: 5,
            color: PAPER,
            marginTop: 22,
            display: 'flex',
          }}
        >
          {stage.lead}
        </div>
        <div
          style={{
            fontSize: 46,
            fontWeight: 700,
            letterSpacing: 7,
            color: GOLD_LIGHT,
            fontFamily: 'Cinzel',
            marginTop: 16,
            display: 'flex',
          }}
        >
          {stage.title}
        </div>
        <div
          style={{
            fontSize: 20,
            letterSpacing: 8,
            color: PAPER,
            fontFamily: 'Cinzel',
            marginTop: 10,
            display: 'flex',
          }}
        >
          {stage.sub}
        </div>

        {/* ── Facts ──────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 48,
            marginTop: 46,
          }}
        >
          <Fact label="ACCOUNT" value={opts.accountNumber} />
          <Fact label="ACCOUNT SIZE" value={opts.capital} />
          <Fact label="DATE ISSUED" value={date} />
        </div>

        {/* ── Signature ──────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: 68,
            left: 92,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              fontSize: 52,
              color: GOLD_LIGHT,
              fontFamily: 'GreatVibes',
              display: 'flex',
            }}
          >
            {SITE.name.charAt(0) + SITE.name.slice(1).toLowerCase()}
          </div>
          <div
            style={{ width: 240, height: 1, background: `${GOLD}88`, marginTop: 10, display: 'flex' }}
          />
          <div
            style={{ fontSize: 14, letterSpacing: 4, color: PAPER, marginTop: 12, display: 'flex' }}
          >
            PROPINO TEAM
          </div>
          <div
            style={{ fontSize: 14, letterSpacing: 4, color: MUTED, marginTop: 4, display: 'flex' }}
          >
            TRUST THE PROCESS
          </div>
        </div>

        {/* The serial is what support checks a disputed certificate against. */}
        <div
          style={{
            position: 'absolute',
            bottom: 74,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            fontSize: 14,
            letterSpacing: 3,
            color: '#6B665C',
          }}
        >
          {`SERIAL ${serial}`}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 68,
            right: 92,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ fontSize: 14, letterSpacing: 4, color: PAPER, display: 'flex' }}>
            MORE
          </div>
          <div
            style={{ fontSize: 14, letterSpacing: 4, color: PAPER, marginTop: 4, display: 'flex' }}
          >
            THAN A PROP FIRM
          </div>
        </div>
      </div>
    ),
    {
      width: CERT_WIDTH,
      height: CERT_HEIGHT,
      fonts: [
        { name: 'Vazirmatn', data: fonts.regular, weight: 500, style: 'normal' },
        { name: 'Vazirmatn', data: fonts.bold, weight: 700, style: 'normal' },
        { name: 'Cinzel', data: fonts.serif, weight: 400, style: 'normal' },
        { name: 'Cinzel', data: fonts.serifBold, weight: 700, style: 'normal' },
        { name: 'GreatVibes', data: fonts.script, weight: 400, style: 'normal' },
      ],
    },
  );
}
