import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { SITE } from './constants';

// Renders an achievement certificate as a PNG. The layout is drawn here rather
// than uploaded, so a certificate exists the moment a stage is passed.
// Admins can still upload a bespoke image to replace a generated one.
//
// The wording is English throughout — it reads as an international document and
// sidesteps the image renderer's fragile bidirectional text handling. The font
// still covers Persian so a trader's own name renders correctly.

export const CERT_WIDTH = 1600;
export const CERT_HEIGHT = 1131; // A4 landscape ratio

export type CertificateStage = 'PHASE_1' | 'PHASE_2' | 'FUNDED' | 'PAYOUT';

// `lead` is the line above the title, so each stage reads as one sentence.
const STAGE_TITLES: Record<
  CertificateStage,
  { lead: string; title: string; sub: string }
> = {
  PHASE_1: {
    lead: 'for successfully completing',
    title: 'Phase One',
    sub: 'Evaluation Challenge',
  },
  PHASE_2: {
    lead: 'for successfully completing',
    title: 'Phase Two',
    sub: 'Verification Challenge',
  },
  FUNDED: {
    lead: 'in recognition of achieving',
    title: 'Funded Trader Status',
    sub: 'Live Capital Allocation',
  },
  PAYOUT: {
    lead: 'in recognition of a completed',
    title: 'Profit Payout',
    sub: 'Withdrawal Processed',
  },
};

let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

/** The bundled Vazirmatn TTFs cover both Latin and Persian glyphs. */
async function loadFonts() {
  if (fontCache) return fontCache;
  const dir = path.join(
    process.cwd(),
    'node_modules',
    'vazirmatn',
    'fonts',
    'ttf',
  );
  const [regular, bold] = await Promise.all([
    readFile(path.join(dir, 'Vazirmatn-Medium.ttf')),
    readFile(path.join(dir, 'Vazirmatn-Bold.ttf')),
  ]);
  const toBuffer = (b: Buffer) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  fontCache = { regular: toBuffer(regular), bold: toBuffer(bold) };
  return fontCache;
}

const GOLD = '#14D98A';
const GOLD_SOFT = '#E3C567';
const TEAL = '#06291B';
const INK = '#020806';
const MUTED = '#8B9497';

// A deterministic rising series, drawn faintly behind the text as a watermark.
// Fixed rather than random so every certificate looks identical.
// Each entry is [open, close, high, low] on a 0–100 scale.
const SERIES: Array<[number, number, number, number]> = [
  [18, 24, 27, 16], [24, 22, 28, 20], [22, 29, 32, 21], [29, 27, 33, 25],
  [27, 34, 37, 26], [34, 32, 38, 30], [32, 39, 43, 31], [39, 44, 46, 37],
  [44, 41, 47, 39], [41, 48, 51, 40], [48, 46, 52, 44], [46, 54, 57, 45],
  [54, 51, 58, 49], [51, 59, 62, 50], [59, 57, 63, 55], [57, 65, 68, 56],
  [65, 62, 69, 60], [62, 70, 73, 61], [70, 74, 77, 68], [74, 71, 78, 69],
  [71, 79, 82, 70], [79, 76, 83, 74], [76, 84, 87, 75], [84, 88, 91, 82],
  [88, 85, 92, 83], [85, 93, 96, 84],
];

/** Candlestick watermark filling the lower half of the certificate. */
function ChartBackdrop() {
  const areaTop = 250;
  const areaHeight = 760;
  const padX = 110;
  const usable = CERT_WIDTH - padX * 2;
  const step = usable / SERIES.length;
  const bodyWidth = Math.round(step * 0.42);
  const scale = (v: number) => areaTop + ((100 - v) / 100) * areaHeight;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: CERT_WIDTH,
        height: CERT_HEIGHT,
        display: 'flex',
        opacity: 0.14,
      }}
    >
      {SERIES.map(([open, close, high, low], i) => {
        const up = close >= open;
        const colour = up ? GOLD_SOFT : GOLD;
        const x = padX + i * step;
        const bodyTop = scale(Math.max(open, close));
        const bodyHeight = Math.max(4, scale(Math.min(open, close)) - bodyTop);
        const wickTop = scale(high);
        const wickHeight = Math.max(1, scale(low) - wickTop);
        return (
          <div key={i} style={{ display: 'flex' }}>
            <div
              style={{
                position: 'absolute',
                left: Math.round(x + bodyWidth / 2),
                top: Math.round(wickTop),
                width: 2,
                height: Math.round(wickHeight),
                background: colour,
                display: 'flex',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: Math.round(x),
                top: Math.round(bodyTop),
                width: bodyWidth,
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

/** Small diamond used to punctuate rules and frame the corners. */
function Diamond({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: color,
        transform: 'rotate(45deg)',
        display: 'flex',
      }}
    />
  );
}

function CornerMark({
  top,
  left,
  right,
  bottom,
}: {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        ...(top !== undefined ? { top } : {}),
        ...(left !== undefined ? { left } : {}),
        ...(right !== undefined ? { right } : {}),
        ...(bottom !== undefined ? { bottom } : {}),
        width: 58,
        height: 58,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          border: `2px solid ${GOLD}`,
          transform: 'rotate(45deg)',
          background: INK,
          display: 'flex',
        }}
      />
      <div style={{ position: 'absolute', display: 'flex' }}>
        <Diamond size={12} color={GOLD_SOFT} />
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
  const fonts = await loadFonts();
  const stage = STAGE_TITLES[opts.stage];
  const date = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(opts.issuedAt);
  const serial = `${opts.accountNumber}-${opts.stage.replace('_', '')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(145deg, ${INK} 0%, #121618 55%, ${INK} 100%)`,
          fontFamily: 'Vazirmatn',
          position: 'relative',
        }}
      >
        {/* Ambient glows */}
        <div
          style={{
            position: 'absolute',
            top: -220,
            right: -160,
            width: 620,
            height: 620,
            borderRadius: 999,
            background: TEAL,
            opacity: 0.4,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -260,
            left: -180,
            width: 560,
            height: 560,
            borderRadius: 999,
            background: TEAL,
            opacity: 0.25,
            display: 'flex',
          }}
        />

        <ChartBackdrop />

        {/* Frame */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 40,
            right: 40,
            bottom: 40,
            border: `2px solid ${GOLD}`,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 54,
            left: 54,
            right: 54,
            bottom: 54,
            border: `1px solid ${GOLD}44`,
            display: 'flex',
          }}
        />
        <CornerMark top={11} left={11} />
        <CornerMark top={11} right={11} />
        <CornerMark bottom={11} left={11} />
        <CornerMark bottom={11} right={11} />

        {/* ── Header ─────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            marginBottom: 14,
          }}
        >
          <Diamond size={9} color={GOLD_SOFT} />
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: 8,
            }}
          >
            {SITE.name}
          </div>
          <Diamond size={9} color={GOLD_SOFT} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginBottom: 52,
          }}
        >
          <div style={{ width: 90, height: 1, background: `${GOLD}66`, display: 'flex' }} />
          <div
            style={{
              fontSize: 21,
              color: GOLD,
              letterSpacing: 8,
              fontWeight: 700,
            }}
          >
            CERTIFICATE OF ACHIEVEMENT
          </div>
          <div style={{ width: 90, height: 1, background: `${GOLD}66`, display: 'flex' }} />
        </div>

        {/* ── Recipient ──────────────────────────────────── */}
        <div
          style={{
            fontSize: 22,
            color: MUTED,
            letterSpacing: 2,
            marginBottom: 22,
          }}
        >
          This certificate is proudly presented to
        </div>

        <div
          style={{
            fontSize: 82,
            fontWeight: 700,
            color: '#FFFFFF',
            textAlign: 'center',
            maxWidth: 1240,
            lineHeight: 1.2,
          }}
        >
          {opts.name}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 26,
            marginBottom: 40,
          }}
        >
          <div style={{ width: 200, height: 1, background: `${GOLD}55`, display: 'flex' }} />
          <Diamond size={11} />
          <div style={{ width: 200, height: 1, background: `${GOLD}55`, display: 'flex' }} />
        </div>

        {/* ── Achievement ────────────────────────────────── */}
        <div
          style={{
            fontSize: 22,
            color: MUTED,
            letterSpacing: 2,
            marginBottom: 16,
          }}
        >
          {stage.lead}
        </div>
        <div
          style={{
            fontSize: 58,
            fontWeight: 700,
            color: GOLD,
            letterSpacing: 1,
          }}
        >
          {stage.title}
        </div>
        <div
          style={{
            fontSize: 22,
            color: MUTED,
            letterSpacing: 4,
            marginTop: 10,
          }}
        >
          {stage.sub.toUpperCase()}
        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: 104,
            left: 130,
            right: 130,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          {[
            { label: 'ACCOUNT', value: opts.accountNumber },
            { label: 'ACCOUNT SIZE', value: opts.capital },
            { label: 'DATE ISSUED', value: date },
          ].map((cell) => (
            <div
              key={cell.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 24, color: '#FFFFFF', fontWeight: 700 }}>
                {cell.value}
              </span>
              <span style={{ width: 210, height: 1, background: `${GOLD}44`, display: 'flex' }} />
              <span style={{ fontSize: 16, color: MUTED, letterSpacing: 3 }}>
                {cell.label}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 62,
            display: 'flex',
            fontSize: 14,
            color: '#5C6669',
            letterSpacing: 2,
          }}
        >
          {`SERIAL ${serial}`}
        </div>
      </div>
    ),
    {
      width: CERT_WIDTH,
      height: CERT_HEIGHT,
      fonts: [
        { name: 'Vazirmatn', data: fonts.regular, weight: 500, style: 'normal' },
        { name: 'Vazirmatn', data: fonts.bold, weight: 700, style: 'normal' },
      ],
    },
  );
}
