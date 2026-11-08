# اعمال تغییرات روی سرور (VPS ویندوزی)

مسیر پروژه روی سرور: `C:\propino`
کل کار حدود ۱۰ دقیقه است. ترتیب مراحل مهم است.

---

## پیش از هر چیز — پشتیبان بگیرید

در PowerShell روی سرور:

```powershell
Copy-Item C:\propino\prisma\dev.db C:\propino\prisma\dev.db.backup-$(Get-Date -Format yyyyMMdd-HHmm)
```

اگر روی PostgreSQL هستید، به‌جای این دستور از `pg_dump` استفاده کنید.

---

## مرحله ۱ — انتقال فایل‌ها

پوشه‌ی پروژه را از این کامپیوتر روی سرور کپی کنید. **این پوشه‌ها را کپی نکنید**
(حجیم‌اند و روی سرور دوباره ساخته می‌شوند):

```
node_modules
.next
```

و **این فایل‌ها را روی سرور بازنویسی نکنید** (تنظیمات خود سرور هستند):

```
.env
prisma\dev.db
```

فایل‌هایی که تغییر کرده‌اند و باید منتقل شوند:

```
src\lib\monitor.ts
src\lib\watermarks.ts
src\lib\monitor-run.ts
src\lib\monitor-source.ts
src\lib\data.ts
src\lib\payout-rules.ts
src\lib\admin.ts
src\lib\validation.ts
src\lib\certificate-issue.ts
src\app\api\bridge\accounts\route.ts
src\app\api\admin\accounts\route.ts
src\app\api\admin\accounts\sync-all\route.ts
src\app\api\payouts\route.ts
src\app\[locale]\layout.tsx
src\app\[locale]\admin\accounts\page.tsx
src\components\dashboard\AccountMonitor.tsx
src\components\admin\AccountActions.tsx
src\components\admin\SyncAllButton.tsx
src\components\admin\AccountOwner.tsx      (فایل جدید)
src\components\admin\BreachReason.tsx      (فایل جدید)
src\components\site\TelegramFab.tsx        (فایل جدید)
src\i18n\dictionaries\fa.ts
src\i18n\dictionaries\en.ts
prisma\schema.prisma
scripts\test-monitor.ts
scripts\repair-risk-state.ts               (فایل جدید)
scripts\replay-account.ts                  (فایل جدید)
bot\core\mt5_extractor.py
bot\bridge_agent.py
agent\config.json                          (فقط sampleSeconds عوض شده)
agent\config.example.json
package.json
tsconfig.json
```

ساده‌ترین راه: کل پوشه را جز `node_modules`، `.next`، `.env` و `prisma\dev.db` کپی کنید.

---

## مرحله ۲ — توقف سرویس‌ها

```powershell
C:\propino\tools\nssm.exe stop propino
```

اگر Agent هم به‌عنوان سرویس اجرا می‌شود، آن را هم متوقف کنید. اگر در یک پنجره‌ی
PowerShell باز است، همان پنجره را `Ctrl+C` کنید.

```powershell
C:\propino\tools\nssm.exe stop propino-agent
```

> اگر نام سرویس‌ها را نمی‌دانید: `C:\propino\tools\nssm.exe list`

---

## مرحله ۳ — نصب و ساخت

```powershell
cd C:\propino; npm install; npx prisma generate; npx prisma db push
```

`db push` یک ستون جدید به جدول حساب‌ها اضافه می‌کند (`breachDetail`) که دلیل و
اعداد لحظه‌ی نقض قانون را نگه می‌دارد. داده‌ی موجود پاک نمی‌شود.

---

## مرحله ۴ — اصلاح داده‌های خراب موجود ⚠️ مهم

اول **بدون اعمال** اجرا کنید تا ببینید چه چیزی قرار است عوض شود:

```powershell
cd C:\propino; npm run risk:repair
```

خروجی باید چیزی شبیه این باشد:

```
settings: hftCooldownMinutes 15 → 5
settings: dayResetUtcOffset was unset → 0
#111610507  • FAILED(HFT_COOLDOWN) → ACTIVE — no rule breached under the corrected engine
...
```

اگر خروجی منطقی بود، اعمالش کنید:

```powershell
cd C:\propino; npm run risk:repair -- --apply
```

**این اسکریپت سه کار می‌کند:**

1. وقفه‌ی پس از معامله زیان‌ده را از ۱۵ دقیقه به **۵ دقیقه** تغییر می‌دهد.
2. مقدار آلوده‌ی `worstFloating` را صفر می‌کند (همان عددی که باعث نمایش «ریسک
   شناور ۶۴٪» روی حساب بدون پوزیشن باز شده بود).
3. حساب‌هایی را که به‌اشتباه با `HFT_COOLDOWN` رد شده بودند به `ACTIVE` برمی‌گرداند
   — **اما فقط آن‌هایی که با موتور اصلاح‌شده هیچ قانونی را نقض نمی‌کنند.** حسابی که
   واقعاً نقض دارد، رد شده باقی می‌ماند.

روی دیتابیس فعلی شما نتیجه این بود: **۴ حساب بازگردانده شد، ۱ مقدار شناور پاک شد.**

---

## مرحله ۵ — Build و اجرا

```powershell
cd C:\propino; npm run build
```

سپس:

```powershell
C:\propino\tools\nssm.exe start propino
```

---

## مرحله ۶ — راه‌اندازی مجدد Agent

Agent از ساعت ۰۵:۳۱ روز ۲۵ آگوست متوقف شده بود. بدون آن هیچ داده‌ی جدیدی وارد
سیستم نمی‌شود و قوانین روی داده‌ی قدیمی اجرا می‌شوند.

```powershell
C:\propino\tools\nssm.exe start propino-agent
```

یا اگر سرویس ندارد:

```powershell
cd C:\propino; python agent\mt5_agent.py
```

**بررسی کنید که کار می‌کند:**

```powershell
Get-Content C:\propino\agent.log -Tail 20
```

باید خطوطی مثل این ببینید:

```
[MT5 Native] Watching equity for 90s...
[MT5 Native] Watch done: 45 samples, low equity $999.38
Successfully pushed 1 account(s) to bridge.
```

خط `Watching equity` مهم است — یعنی نمونه‌برداری بین Pollها فعال شده. اگر این خط
را نمی‌بینید، مقدار `sampleSeconds` در `agent\config.json` را چک کنید (باید ۹۰ باشد).

---

## مرحله ۷ — سرویس ربات (پورت ۸۰۰۰)

دکمه‌ی «همگام‌سازی» فقط وقتی داده‌ی زنده می‌آورد که این سرویس بالا باشد:

```powershell
cd C:\propino; python bot\api\app.py
```

بهتر است به‌عنوان سرویس ثبت شود تا با ری‌استارت سرور خودکار بالا بیاید.

> اگر این سرویس خاموش باشد دیگر پیام موفقیت دروغین نمی‌بینید — پنل صریحاً
> می‌گوید «اتصال به موتور متاتریدر برقرار نشد» و قوانین را با آخرین داده‌ی موجود
> اجرا می‌کند.

---

## مرحله ۸ — بررسی نهایی

### ۸٫۱ تست موتور قوانین

```powershell
cd C:\propino; npm run test:monitor
```

باید ببینید: `✅ all 70 monitor checks passed.`

### ۸٫۲ بازپخش حساب‌ها

```powershell
cd C:\propino; npm run risk:replay
```

این دستور تمام قوانین را از روی داده‌ی خام دوباره حساب می‌کند و با وضعیت ذخیره‌شده
مقایسه می‌کند. باید ببینید:

```
✅ 5 account(s) replayed — every stored status matches the rules.
```

اگر روزی کاربری گفت «چرا حساب من رد شد؟»، همین دستور را با شماره حساب بزنید:

```powershell
cd C:\propino; npm run risk:replay -- 5054963695
```

### ۸٫۳ بررسی چشمی

1. `https://propino.top/fa` → دکمه‌ی گرد آبی تلگرام گوشه‌ی **پایین راست**
   (در نسخه‌ی انگلیسی: پایین چپ).
2. پنل ادمین → حساب‌ها → روی هر ردیف فقط **یک** دکمه‌ی «بررسی کامل حساب» است.
3. همان دکمه را بزنید → گزارش کامل با تمام قوانین باز می‌شود.

---

## مرحله ۹ — تنظیم مرز روز معاملاتی ⚠️

در پنل ادمین → **قوانین** → گزینه‌ی `dayResetUtcOffset` را روی ساعت سرور بروکر
تنظیم کنید.

الان روی `0` (یعنی UTC) است، ولی سرورهای MetaQuotes معمولاً `GMT+2` یا `GMT+3`
هستند. اگر این عدد اشتباه باشد، دراوداون روزانه در ساعت اشتباهی ریست می‌شود و
مرز روزهای معاملاتی ۲ تا ۳ ساعت جابه‌جا خواهد بود.

---

## دو کاری که باید خودتان تصمیم بگیرید

### الف) حساب‌های بدون مالک

هر ۵ حساب فعلی به کاربر `Administrator` وصل‌اند، نه به مشتری واقعی. علتش این بود
که Agent هر حساب ناشناسی را که Push می‌کرد، سیستم خودکار می‌ساخت و به اولین ادمین
وصل می‌کرد. **این رفتار حذف شد** — از این به بعد فقط حساب‌هایی پایش می‌شوند که از
مسیر سفارش ساخته شده باشند.

برای حساب‌های موجود: پنل ادمین → حساب‌ها → زیر ستون ایمیل برچسب نارنجی
«بدون مالک واقعی» را می‌بینید → روی «تغییر مالک» بزنید و ایمیل تریدر را وارد کنید.

**تا وقتی این کار انجام نشود، سرتیفیکیت آن حساب صادر نمی‌شود** — چون اسم روی
سرتیفیکیت اسم مالک حساب است، و مالک فعلی ادمین است. سیستم عمداً به‌جای صدور
سرتیفیکیت با اسم اشتباه، صدور را متوقف می‌کند و در لاگ می‌نویسد.

> اگر سرتیفیکیتی از قبل با اسم ادمین صادر شده: بعد از تغییر مالک، در پنل ادمین
> روی همان حساب سرتیفیکیت را حذف و دوباره تولید کنید تا با اسم درست ساخته شود.

### ب) چرخش `BRIDGE_SECRET`

این کلید هم در `.env`، هم در `agent\config.json` و هم (تا پیش از این اصلاح) به‌صورت
hardcode داخل `bot\bridge_agent.py` بود. هرکس آن را داشته باشد می‌تواند برای هر
حسابی هر موجودی‌ای Push کند و از تمام قوانین عبور کند.

fallback داخل کد **حذف شد**، ولی خود کلید هنوز همان کلید قبلی است. برای عوضش کردن:

```powershell
# یک کلید جدید بسازید
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

سپس مقدار جدید را **هم‌زمان** در هر دو جا بگذارید و سرویس‌ها را ری‌استارت کنید:

```
C:\propino\.env              →  BRIDGE_SECRET="..."
C:\propino\agent\config.json →  "bridgeSecret": "..."
```

اگر فقط یکی را عوض کنید، Agent با خطای `403 forbidden` متوقف می‌شود.

---

## اگر چیزی خراب شد — بازگشت

```powershell
C:\propino\tools\nssm.exe stop propino
Copy-Item C:\propino\prisma\dev.db.backup-XXXXXX C:\propino\prisma\dev.db -Force
# فایل‌های قدیمی src را برگردانید، سپس:
cd C:\propino; npm run build
C:\propino\tools\nssm.exe start propino
```

---

## خلاصه‌ی دستورات (پشت سر هم)

```powershell
Copy-Item C:\propino\prisma\dev.db C:\propino\prisma\dev.db.backup-$(Get-Date -Format yyyyMMdd-HHmm)
C:\propino\tools\nssm.exe stop propino
cd C:\propino; npm install; npx prisma generate; npx prisma db push
npm run risk:repair
npm run risk:repair -- --apply
npm run build
npm run test:monitor
npm run risk:replay
C:\propino\tools\nssm.exe start propino
C:\propino\tools\nssm.exe start propino-agent
```
