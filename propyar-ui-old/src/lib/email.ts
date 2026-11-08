import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { SITE } from './constants';

// Transactional email over SMTP. When SMTP is not configured the message is
// logged instead of sent, so every flow stays usable before the mail account
// exists — nothing throws and no user action fails because of email.

let transporter: Transporter | null = null;

export function emailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

/**
 * 465 wraps the whole session in TLS; 587 starts plain and upgrades via
 * STARTTLS. Providers switch between the two, and some networks block one of
 * them, so the configured port is tried first and the other is used as a
 * fallback rather than letting a port change silently stop every email.
 */
function candidatePorts(): number[] {
  const configured = Number(process.env.SMTP_PORT ?? 465);
  const alternate = configured === 465 ? 587 : 465;
  return [configured, alternate];
}

function buildTransport(port: number): Transporter {
  const implicitTls = port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASS as string,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Returns a transport known to connect, remembering it for later messages. */
async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  let lastError: unknown;
  for (const port of candidatePorts()) {
    const candidate = buildTransport(port);
    try {
      await candidate.verify();
      if (port !== Number(process.env.SMTP_PORT ?? 465)) {
        console.warn(
          `SMTP: configured port refused, using ${port} instead — update SMTP_PORT`,
        );
      }
      transporter = candidate;
      return candidate;
    } catch (err) {
      lastError = err;
      candidate.close();
    }
  }
  throw lastError ?? new Error('no usable SMTP port');
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#03100B;font-family:Tahoma,Arial,sans-serif;color:#e8eaea">
  <div style="max-width:560px;margin:0 auto;background:#181b1d;border:1px solid #262b2d;border-radius:16px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #262b2d">
      <span style="font-size:18px;font-weight:bold;color:#14D98A">${SITE.name}</span>
    </div>
    <div style="padding:24px">
      <h1 style="margin:0 0 16px;font-size:18px;color:#ffffff">${title}</h1>
      <div style="font-size:14px;line-height:2;color:#c7cccd">${bodyHtml}</div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #262b2d;font-size:12px;color:#7d8688">
      این پیام به‌صورت خودکار ارسال شده است.
    </div>
  </div>
</body></html>`;
}

/** Label/value rows for credentials, monospaced so characters are unambiguous. */
function credentials(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr>
           <td style="padding:8px 0;font-size:13px;color:#9aa3a5;white-space:nowrap">${label}</td>
           <td style="padding:8px 0 8px 16px;font-family:monospace;font-size:15px;color:#ffffff;direction:ltr;text-align:left" dir="ltr">${value}</td>
         </tr>`,
    )
    .join('');
  return `<table style="width:100%;margin:20px 0;padding:4px 16px;background:#0f1416;border:1px solid #14D98A;border-radius:12px;border-collapse:separate">${cells}</table>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:12px 24px;background:#14D98A;color:#03100B;font-weight:bold;text-decoration:none;border-radius:10px">${label}</a></p>`;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!emailConfigured()) {
    console.info(`[email skipped — SMTP not configured] to=${to} subject=${subject}`);
    return;
  }
  try {
    const mailer = await getTransporter();
    await mailer.sendMail({
      from: process.env.SMTP_FROM ?? `${SITE.name} <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    // A cached transport can go stale when the provider changes ports; drop it
    // so the next message re-picks a working one.
    transporter = null;
    // Email must never break the request that triggered it.
    console.error('email send failed', err);
  }
}

const dashboardUrl = () => `${SITE.url}/fa/dashboard`;

export const email = {
  verifyCode: (to: string, name: string, code: string, minutes: number) =>
    send(
      to,
      `کد تایید ثبت‌نام: ${code}`,
      layout(
        `${name} عزیز، ثبت‌نام خود را تکمیل کنید`,
        `<p>برای تایید ایمیل و فعال‌سازی حساب، کد زیر را در سایت وارد کنید:</p>
         <p style="margin:24px 0;text-align:center">
           <span style="display:inline-block;padding:14px 32px;background:#0f1416;border:1px solid #14D98A;border-radius:12px;font-size:30px;font-weight:bold;letter-spacing:10px;color:#14D98A;font-family:monospace">${code}</span>
         </p>
         <p>این کد تا ${minutes} دقیقه معتبر است.</p>
         <p style="font-size:12px;color:#7d8688">اگر شما در ${SITE.name} ثبت‌نام نکرده‌اید، این پیام را نادیده بگیرید.</p>`,
      ),
    ),

  welcome: (to: string, name: string) =>
    send(
      to,
      `به ${SITE.name} خوش آمدید`,
      layout(
        `${name} عزیز، خوش آمدید`,
        `<p>حساب کاربری شما با موفقیت ساخته شد. از داشبورد می‌توانید چالش خود را انتخاب و شروع کنید.</p>${button(dashboardUrl(), 'ورود به داشبورد')}`,
      ),
    ),

  ticketAnswered: (to: string, subject: string) =>
    send(
      to,
      'پاسخ به تیکت شما',
      layout(
        'پشتیبانی به تیکت شما پاسخ داد',
        `<p>تیکت «<b>${subject}</b>» پاسخ داده شد.</p>${button(`${SITE.url}/fa/dashboard/tickets`, 'مشاهده پاسخ')}`,
      ),
    ),

  walletToppedUp: (to: string, amount: number) =>
    send(
      to,
      'کیف پول شما شارژ شد',
      layout(
        'شارژ کیف پول انجام شد',
        `<p>مبلغ <b>${amount} دلار</b> به کیف پول شما اضافه شد.</p>
         <p>می‌توانید از این موجودی برای خرید چالش استفاده کنید.</p>${button(`${SITE.url}/fa/dashboard/wallet`, 'مشاهده کیف پول')}`,
      ),
    ),

  orderReceived: (to: string, plan: string) =>
    send(
      to,
      'سفارش شما ثبت شد',
      layout(
        'سفارش شما در حال بررسی است',
        `<p>سفارش شما برای چالش <b>${plan}</b> ثبت شد و پرداخت تأیید گردید.</p>
         <p>حساب معاملاتی شما حداکثر تا ۳۰ دقیقه آینده فعال می‌شود و اطلاعات ورود در داشبورد قرار می‌گیرد.</p>${button(dashboardUrl(), 'مشاهده سفارش')}`,
      ),
    ),

  accountReady: (
    to: string,
    account: {
      accountNumber: string;
      server: string;
      password: string;
      platform: string;
    },
  ) =>
    send(
      to,
      'حساب معاملاتی شما آماده است',
      layout(
        'حساب معاملاتی شما فعال شد',
        `<p>حساب معاملاتی شما ساخته شد. با اطلاعات زیر وارد ${account.platform} شوید:</p>
         ${credentials([
           ['شماره حساب (لاگین)', account.accountNumber],
           ['رمز عبور', account.password],
           ['بروکر / سرور', account.server],
           ['پلتفرم', account.platform],
         ])}
         <p style="font-size:13px;color:#9aa3a5">توصیه می‌کنیم پس از اولین ورود، رمز عبور را از داخل ${account.platform} تغییر دهید.</p>
         <p>پیش از شروع معامله، قوانین چالش را مرور کنید — دراوداون روزانه، دراوداون کلی و سایر شرایط در داشبورد و صفحه‌ی قوانین آمده است.</p>
         ${button(`${SITE.url}/fa/dashboard/accounts`, 'مشاهده حساب در داشبورد')}`,
      ),
    ),

  stagePassed: (to: string, accountNumber: string, nextStage: string) =>
    send(
      to,
      'تبریک! مرحله را با موفقیت گذراندید',
      layout(
        'مرحله با موفقیت تکمیل شد',
        `<p>حساب <b>${accountNumber}</b> اهداف این مرحله را کامل کرد.</p>
         <p>برای دریافت <b>${nextStage}</b> کافی است از داشبورد درخواست خود را ثبت کنید.</p>${button(`${SITE.url}/fa/dashboard/accounts`, 'ثبت درخواست')}`,
      ),
    ),

  breach: (to: string, accountNumber: string, ruleName: string) =>
    send(
      to,
      'نقض قوانین در حساب معاملاتی',
      layout(
        'چالش شما رد شد',
        `<p>در حساب <b>${accountNumber}</b> قانون زیر نقض شد:</p>
         <p style="color:#ff8a8a"><b>${ruleName}</b></p>
         <p>بر اساس قوانین، این چالش رد شده و حساب بسته شده است. جزئیات کامل در داشبورد قابل مشاهده است.</p>${button(`${SITE.url}/fa/dashboard/accounts`, 'مشاهده جزئیات')}`,
      ),
    ),

  payoutRequested: (to: string, amount: string) =>
    send(
      to,
      'درخواست برداشت ثبت شد',
      layout(
        'درخواست برداشت شما ثبت شد',
        `<p>درخواست برداشت به مبلغ <b>${amount}</b> دریافت شد و در حال بررسی است.</p>${button(`${SITE.url}/fa/dashboard/payouts`, 'پیگیری درخواست')}`,
      ),
    ),

  payoutStatus: (to: string, amount: string, status: string) =>
    send(
      to,
      'به‌روزرسانی وضعیت برداشت',
      layout(
        'وضعیت درخواست برداشت شما تغییر کرد',
        `<p>درخواست برداشت به مبلغ <b>${amount}</b> اکنون در وضعیت <b>${status}</b> قرار دارد.</p>${button(`${SITE.url}/fa/dashboard/payouts`, 'مشاهده برداشت‌ها')}`,
      ),
    ),

  kycReviewed: (to: string, approved: boolean) =>
    send(
      to,
      approved ? 'احراز هویت شما تأیید شد' : 'احراز هویت شما تأیید نشد',
      layout(
        approved ? 'احراز هویت تأیید شد' : 'احراز هویت رد شد',
        approved
          ? `<p>مدارک شما بررسی و تأیید شد. اکنون امکان ثبت درخواست برداشت را دارید.</p>${button(`${SITE.url}/fa/dashboard/payouts`, 'درخواست برداشت')}`
          : `<p>مدارک ارسالی تأیید نشد. لطفاً تصویر واضح‌تری از کارت ملی یا شناسنامه بارگذاری کنید.</p>${button(`${SITE.url}/fa/dashboard/profile`, 'ارسال مجدد مدارک')}`,
      ),
    ),

  certificateIssued: (to: string, accountNumber: string) =>
    send(
      to,
      'گواهی موفقیت شما صادر شد',
      layout(
        'گواهی شما آماده است',
        `<p>برای حساب <b>${accountNumber}</b> گواهی موفقیت صادر شد.</p>
         <p>می‌توانید آن را از داشبورد خود دانلود کنید.</p>${button(`${SITE.url}/fa/dashboard/accounts`, 'دانلود گواهی')}`,
      ),
    ),

  passwordResetCode: (
    to: string,
    name: string,
    code: string,
    minutes: number,
  ) =>
    send(
      to,
      `کد بازیابی رمز عبور: ${code}`,
      layout(
        `${name} عزیز، بازیابی رمز عبور`,
        `<p>برای تعیین رمز عبور جدید، کد زیر را در سایت وارد کنید:</p>
         <p style="margin:24px 0;text-align:center">
           <span style="display:inline-block;padding:14px 32px;background:#0f1416;border:1px solid #14D98A;border-radius:12px;font-size:30px;font-weight:bold;letter-spacing:10px;color:#14D98A;font-family:monospace">${code}</span>
         </p>
         <p>این کد تا ${minutes} دقیقه معتبر است و تنها یک بار قابل استفاده است.</p>
         <p style="font-size:12px;color:#7d8688">اگر شما این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید؛ رمز عبور شما تغییر نمی‌کند.</p>`,
      ),
    ),
};
