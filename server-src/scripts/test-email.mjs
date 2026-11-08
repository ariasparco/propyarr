// Verifies the SMTP settings in .env by connecting and sending one test message.
//   node scripts/test-email.mjs you@example.com
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import nodemailer from 'nodemailer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env reader so the script runs without extra dependencies.
function loadEnv() {
  const env = {};
  for (const file of ['.env.local', '.env']) {
    let raw;
    try {
      raw = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      if (env[m[1]] === undefined) {
        env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

const env = loadEnv();
const to = process.argv[2];

if (!to) {
  console.error('Usage: node scripts/test-email.mjs <recipient@example.com>');
  process.exit(1);
}

const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !env[k]);
if (missing.length) {
  console.error(`✗ Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const port = Number(env.SMTP_PORT ?? 587);
console.log(`→ ${env.SMTP_HOST}:${port} as ${env.SMTP_USER}`);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

try {
  await transporter.verify();
  console.log('✓ Connected and authenticated');
} catch (err) {
  console.error('✗ Connection or login failed:', err.message);
  process.exit(1);
}

try {
  const info = await transporter.sendMail({
    from: env.SMTP_FROM || `${env.NEXT_PUBLIC_SITE_NAME ?? 'Site'} <${env.SMTP_USER}>`,
    to,
    subject: 'تست ارسال ایمیل',
    html: `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;padding:16px">
      <p>این یک پیام آزمایشی است.</p>
      <p>اگر آن را می‌بینید، تنظیمات ایمیل درست است.</p>
    </div>`,
  });
  console.log(`✓ Sent — message id ${info.messageId}`);
  console.log('  Check the inbox AND the spam folder.');
} catch (err) {
  console.error('✗ Send failed:', err.message);
  process.exit(1);
}
