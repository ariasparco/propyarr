# گزارش ممیزی موتور ریسک — پلتفرم PROPINO

**دامنه:** کل مسیر داده از ترمینال MT5 تا پنل ادمین
**تاریخ ممیزی:** ۲۰۲۶/۰۸/۲۵ · **وضعیت کد:** هیچ فایلی تغییر نکرده است
**پایگاه داده بررسی‌شده:** `prisma/dev.db` (SQLite) — ۵ حساب، ۷۴ معامله

---

## ۱. Executive Summary

```
وضعیت کلی سیستم:  CRITICAL
```

موتور ریسک در حال حاضر **قابل اتکا نیست** و نتایج آن با واقعیت حساب معامله‌گر مطابقت ندارد.
سه دسته مشکل بنیادی وجود دارد:

1. **قوانین اشتباه اجرا می‌شوند** — قانون «وقفه پس از معامله زیان‌ده» هر حساب فعالی را
   به‌صورت خودکار Fail می‌کند. در پایگاه داده فعلی **۴ حساب از ۵ حساب** با
   `breachRule = HFT_COOLDOWN` سوخته‌اند، در حالی که هیچ‌کدام دراوداون روزانه، کلی یا
   شناور را نقض نکرده‌اند. این تنها دلیل «خراب بودن پنل» است که مشاهده کرده‌اید.
2. **قانون ریسک شناور روی حساب بدون پوزیشن باز هم عدد نشان می‌دهد** — در تصویری که
   فرستادید «ریسک شناور ۶۴٪ — $۱۵٫۹۶ / $۲۵» نمایش داده شده در حالی که تعداد پوزیشن‌های
   باز صفر است (همان «۰» قرمزرنگ زیر کارت). این عدد یک باقیمانده‌ی آلوده در دیتابیس است،
   نه ریسک واقعی. اگر به ۲۵ می‌رسید، حساب بدون هیچ پوزیشن بازی Fail می‌شد.
3. **هیچ چیز Real-Time نیست** — نه WebSocket وجود دارد، نه Price Feed، نه نمونه‌برداری
   بین Pollها. ریسک فقط زمانی محاسبه می‌شود که Agent پایتون هر ۱۲۰ ثانیه به MT5 لاگین
   کند. Agent هم از ساعت ۰۵:۳۱ روز ۲۵ آگوست متوقف شده و هیچ هشداری داده نشده است.

علاوه بر این، **دستور Disable/Fail ادمین هیچ کاری روی حساب MT5 انجام نمی‌دهد**
(`TRADING_PROVIDER="mock"` و متد `disableAccount` یک no-op خالی است) — یعنی حسابی که
در پنل «سوخته» است در ترمینال کاملاً باز است و معامله‌گر می‌تواند به کار ادامه دهد.

**تا رفع موارد P0، این سیستم نباید مبنای تصمیم مالی (Pass / Fail / Payout) قرار گیرد.**

---

## ۲. Architecture — معماری واقعی پروژه

معماری فعلی با آنچه در صورت مسئله فرض شده تفاوت دارد. مسیر واقعی داده:

```
MetaTrader 5 Terminal (روی همان VPS ویندوزی)
        │
        │  MetaTrader5 Python API — لاگین/لاگ‌اوت متوالی، یک ترمینال مشترک
        ▼
bot/core/mt5_extractor.py        ← استخراج balance/equity/positions/deals
        │
        ▼
bot/bridge_agent.py              ← حلقه‌ی هر ۱۲۰ ثانیه، بدون نمونه‌برداری بین سیکل‌ها
        │
        │  HTTPS POST  {accounts:[...]}   +  Bearer BRIDGE_SECRET
        ▼
POST /api/bridge/accounts        ← Ingest + محاسبه Watermarks + درج Trades
        │
        ├─► src/lib/watermarks.ts        (nextWatermarks)
        ├─► prisma.tradingAccount.update (بدون Transaction)
        ├─► prisma.trade.create × N
        │
        ▼
src/lib/monitor-run.ts  runAccountCheck()
        │
        ├─► src/lib/monitor-source.ts  fetchLiveSnapshot()  ← اگر <۳۰ دقیقه، همان داده‌ی ذخیره‌شده
        ├─► src/lib/monitor.ts  buildReport()               ← موتور خالص قوانین
        └─► prisma.tradingAccount.update (status/breachRule)
        │
        ▼
SQLite  prisma/dev.db
        │
        ├─► POST /api/accounts/check     (دکمه «بررسی اکانت»)
        ├─► POST /api/accounts/sync      (دکمه «همگام‌سازی زنده»)
        └─► Server Components → صفحات داشبورد و ادمین
        │
        ▼
src/components/dashboard/AccountMonitor.tsx  (پنل قوانین)
```

**آنچه وجود ندارد:**

| قطعه | وضعیت |
|---|---|
| Price Feed / Tick Stream | ❌ وجود ندارد — هیچ قیمتی وارد سیستم نمی‌شود |
| WebSocket / SSE به مرورگر | ❌ وجود ندارد (`MarketTicker` فقط عدد تصادفی است) |
| Trading Gateway / Order Execution | ❌ وجود ندارد — معامله‌گر مستقیم روی بروکر ترید می‌کند |
| نمونه‌برداری Equity بین Pollها | ❌ در config هست (`sampleSeconds: 2`) ولی هیچ‌جا خوانده نمی‌شود |
| قفل / Transaction روی مسیر ریسک | ❌ وجود ندارد |
| Recalculate / Replay از صفر | ⚠️ ممکن است ولی ابزارش وجود ندارد |

**پیامد معماری:** چون Execution Layer وجود ندارد، هیچ قانونی قابل **Prevent** نیست؛ همه‌ی
قوانین فقط **Detect** می‌شوند، آن‌هم با تأخیر حداقل ۱۲۰ ثانیه. این نکته باید صریحاً به
کارفرما اعلام شود، چون روی طراحی قوانین (مثلاً Symbol Restriction) اثر مستقیم دارد.

---

## ۳. Rule-by-Rule Audit

### ۳٫۱ HFT_COOLDOWN — وقفه پس از معامله زیان‌ده 🔴 CRITICAL

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:203-224` (تابع `cooldownViolations`) و `:443-456` |
| **منطق فعلی** | تمام معاملات بسته‌شده‌ی زیان‌ده را جمع می‌کند؛ سپس **هر** معامله‌ای که در بازه‌ی ۱۵ دقیقه پس از **هر یک** از آن‌ها باز شده باشد را یک تخلف می‌شمارد. severity = `HARD` → حتی **یک** تخلف حساب را `FAILED` می‌کند. |
| **رفتار مورد انتظار** | پس از یک معامله‌ی زیان‌ده، معامله‌گر نباید تا ۱۵ دقیقه پوزیشن جدید باز کند — و اولین تخلف باید حداکثر یک **هشدار** باشد، نه سوزاندن آنی حساب. |
| **رفتار واقعی** | هر معامله‌گر طبیعی در اولین جلسه‌ی معاملاتی این قانون را نقض می‌کند. قانون **گذشته‌نگر** هم هست: تاریخچه‌ی قبل از لینک شدن حساب هم شمرده می‌شود، پس حساب در همان اولین Sync می‌سوزد. |
| **Status** | ❌ BROKEN |
| **Risk Level** | **CRITICAL (P0)** |

**اثر روی حساب معامله‌گر:** حساب معامله‌گر بدون هیچ نقض ریسک واقعی سوزانده می‌شود.
مبلغ چالش عملاً از بین می‌رود و کارفرما با موج شکایت مواجه می‌شود.

**مثال عددی از دیتابیس واقعی شما:**

```
حساب #111275103   Starting = $10,000   Balance = $10,031.89  (سود +$31.89)
  DAILY_DRAWDOWN    OK      $0.00   / $500.00     0.0%
  MAX_DRAWDOWN      OK      $0.00   / $1,000.00   0.0%
  FLOATING_RISK     OK      $0.00   / $250.00     0.0%
  HFT_COOLDOWN      BREACH  9 تخلف               → status = FAILED
```

این حساب **در سود** است، هیچ دراوداونی ندارد، و صرفاً به‌خاطر ۹ بار ورود مجدد
زیر ۱۵ دقیقه سوزانده شده. همین وضعیت برای هر ۴ حساب Fail شده صادق است.

**راهکار پیشنهادی:**
1. `severity` را از `HARD` به `INFO` یا `SOFT` تغییر دهید (مثل `MIN_HOLD_TIME`).
2. یک آستانه‌ی تحمل تعریف شود (مثلاً بیش از N تخلف = WARN، بیش از M = BREACH).
3. فقط تخلف‌های **بعد از** `account.createdAt` شمرده شوند، نه کل تاریخچه.
4. معاملات هم‌زمان/Hedge که قبل از بسته شدن ضرر باز شده‌اند مستثنا شوند.
5. تعریف «معامله‌ی زیان‌ده» صریح شود: `profit < 0` خام، یا `profit + swap + commission < 0`.
6. تصمیم کارفرما لازم است: آیا این قانون اصلاً باید Hard باشد؟

---

### ۳٫۲ FLOATING_RISK — ریسک شناور 🔴 CRITICAL

| | |
|---|---|
| **فایل‌ها** | `src/lib/monitor.ts:296-297`، `src/lib/watermarks.ts:75-86`، `bot/bridge_agent.py:196` |
| **منطق فعلی** | `floatingNow = openCount >= 2 ? max(0, B-E) : 0` سپس `floatingLoss = max(floatingNow, worstFloating)` |
| **باگ** | مقدار `worstFloating` در دیتابیس **بدون شرط ۲ پوزیشن** انباشته می‌شود — هم در `watermarks.ts:75` (`floatingNow = max(0, balance-equity)` بدون توجه به `openCount` که پارامترش پاس داده شده ولی هرگز استفاده نمی‌شود) و هم در Agent (`floatingWorst = max(0.0, balance-equity)`). پس شرط «۲ پوزیشن» فقط روی مقدار لحظه‌ای اعمال می‌شود و از کانال Watermark دور زده می‌شود. |
| **Status** | ❌ BROKEN |
| **Risk Level** | **CRITICAL (P0)** |

**مثال عددی — دقیقاً همان چیزی که در اسکرین‌شات فرستادید:**

```
حساب #5054963695   Starting = $1,000   Balance = Equity = $999.38
پوزیشن باز: 0
  FLOATING_RISK   OK   used = $15.96 / limit = $25.00 → 63.8%   detail = "0"
```

هیچ پوزیشن بازی وجود ندارد ولی ۶۴٪ ظرفیت ریسک شناور مصرف نشان داده می‌شود.
این $۱۵٫۹۶ باقیمانده‌ی یک پوزیشن **تکی** در گذشته است. اگر همان پوزیشن تکی
$۲۵ شناور می‌رفت، حساب با `FLOATING_RISK = BREACH` سوزانده می‌شد — در حالی که
طبق قانون خودتان، پوزیشن تکی فقط تابع دراوداون روزانه است.

**تناقض مضاعف در Specification:** فایل تست خود پروژه (`scripts/test-monitor.ts:380-393`)
دقیقاً خلاف این را انتظار دارد:

```
// A single position at -4% (400 unrealised on a 10k account) blows the 250
// limit and must be flagged — the rule is not limited to 2+ positions.
✗ breached        expected "BREACH", got "OK"
✗ counts the 400 loss   expected 400, got 0
```

پس سه منبع سه چیز متفاوت می‌گویند: کد (۲+ پوزیشن)، تست (هر تعداد)، و Watermark (هر تعداد).
**این مورد نیاز به تصمیم صریح کارفرما دارد.**

**راهکار پیشنهادی:**
1. تصمیم قطعی بگیرید: آیا پوزیشن تکی مشمول Floating Risk هست یا نه؟
2. `openCount` در `watermarks.ts` واقعاً استفاده شود: `floatingNow = openCount >= 2 ? max(0,B-E) : 0`.
3. همین شرط در Agent پایتون هم اعمال شود (`len(positions) >= 2`).
4. مقادیر آلوده‌ی فعلی `worstFloating` در دیتابیس باید یک‌بار پاک/بازمحاسبه شوند.
5. متن UI («با دو پوزیشن باز یا بیشتر…») با تصمیم نهایی هماهنگ شود.

---

### ۳٫۳ DAILY_DRAWDOWN — دراوداون روزانه 🟠 HIGH

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:267-278`، `src/lib/watermarks.ts:46-73` |
| **مرجع محاسبه** | `dailyLoss = max(0, dayStartBalance − min(equity, dayLowEquity))` — یعنی **Balance ابتدای روز منهای کف Equity روز**، و سقف مجاز = درصدی از **Initial Balance** (نه بالانس جاری). |
| **Status** | ⚠️ منطق پایه درست است، ولی سه نقص جدی دارد |

**نقص ۱ — کف Equity واقعی ثبت نمی‌شود (P0).**
`AccountSnapshot.dayLowEquity` قرار است «بدترین نقطه‌ی بین دو Poll» باشد، ولی Agent
در `bot/bridge_agent.py:195` و `:236` مقدار `equityLow` را دقیقاً برابر `equity` لحظه‌ای
می‌فرستد. تنظیم `sampleSeconds: 2` در `agent/config.json` **هیچ‌جا خوانده نمی‌شود**
(با grep تأیید شد). نتیجه: فقط لحظه‌ی Poll دیده می‌شود.

> **مثال:** حساب $۱۰٬۰۰۰ با سقف روزانه $۵۰۰. Poll ساعت ۱۰:۰۰:۰۰ → equity = ۱۰٬۰۰۰.
> بین ۱۰:۰۰ و ۱۰:۰۲ معامله تا equity = ۹٬۳۰۰ (زیان $۷۰۰) پایین می‌رود و برمی‌گردد.
> Poll ساعت ۱۰:۰۲:۰۰ → equity = ۱۰٬۰۵۰. سیستم گزارش می‌دهد: `dailyLoss = $0`.
> **نقض واقعی $۷۰۰ کاملاً نامرئی می‌ماند.**

**نقص ۲ — Sanity Clampها نقض واقعی را پاک می‌کنند (P0).**
`src/lib/watermarks.ts:61-63`:

```ts
if (dayStartBalance != null && dayStartBalance > obs.balance * 2.5) {
  dayStartBalance = obs.balance;   // ← مرجع روز پاک می‌شود
}
```

> **مثال:** حساب $۱۰٬۰۰۰، `dayStartBalance = 10,000`. معامله‌گر در یک روز تا
> balance = $۳٬۹۰۰ می‌سوزاند. شرط `10,000 > 3,900 × 2.5 = 9,750` برقرار است →
> `dayStartBalance = 3,900` → `dailyLoss = $0` → **حساب سالم گزارش می‌شود.**
> اگر balance به صفر یا منفی برسد، `obs.balance * 2.5 ≤ 0` و شرط همیشه برقرار است.

خط `:70-72` هم همین کار را با `dayLowEquity` می‌کند (`dayLowEquity < 0` → پاک می‌شود).
یعنی حساب با Equity منفی، دراوداون صفر گزارش می‌کند.

**نقص ۳ — مرجع روز در زمان قطعی Agent اشتباه ثبت می‌شود (P2).**
`dayStartBalance` در **اولین Push پس از تغییر روز** ثبت می‌شود، نه در لحظه‌ی Reset بروکر.
اگر Agent شب خاموش باشد و صبح ساعت ۱۰ روشن شود، مرجع روز = بالانس ساعت ۱۰ است و
تمام زیان بین ۰۰:۰۰ تا ۱۰:۰۰ از دراوداون روزانه حذف می‌شود.

**راهکار:** حذف کامل هر دو Clamp (اگر داده خراب است باید Alert بدهد نه Reset)؛
پیاده‌سازی واقعی نمونه‌برداری `sampleSeconds` در Agent؛ ثبت `dayStartBalance` از
روی آخرین Balance شناخته‌شده‌ی روز قبل به‌جای اولین Push روز جدید.

---

### ۳٫۴ MAX_DRAWDOWN — دراوداون کلی 🟠 HIGH

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:280-282` |
| **مرجع** | `totalLoss = max(0, StartingBalance − min(equity, lowestEquity))` — **Static** از Initial Balance، بدون Trailing و بدون High Water Mark. با رشد حساب، سقف حرکت نمی‌کند. |
| **Status** | ✅ منطق با استاندارد Static Drawdown سازگار است |
| **Risk Level** | HIGH (به‌دلیل وابستگی به `lowestEquity`) |

**مشکل:** `lowestEquity` هم مثل `dayLowEquity` فقط از لحظه‌های Poll ساخته می‌شود
(`watermarks.ts:83`)، پس همان کوری بین Pollها را دارد. ضمناً `lowestEquity` **از لحظه‌ی
اولین Push شروع می‌شود، نه از ابتدای عمر حساب** — اگر حسابی بعد از چند روز معامله لینک
شود، تمام دراوداون قبلی از دست می‌رود.

**نکته‌ی مهم:** باید صریحاً تأیید شود که مرجع `Initial Balance` است و نه `High Water Mark`.
اگر کارفرما Trailing Drawdown می‌خواهد، پیاده‌سازی فعلی اشتباه است و باید HWM اضافه شود.

**مثال عددی از دیتابیس شما:** حساب `#5054963695` — `MAX_DRAWDOWN = $13.22 / $100 (13.2%)`
و `lowestEquity = 986.78`. این عدد فقط پایین‌ترین equity‌ای است که یک Poll شکار کرده،
نه واقعی‌ترین کف حساب.

---

### ۳٫۵ CONSISTENCY — قانون ثبات 🟡 MEDIUM

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:315-324` و `:404-424` |
| **فرمول** | `bestDay / countableProfit × 100` — بهترین روز تقسیم بر کل سود قابل احتساب |
| **Status** | ⚠️ فرمول استاندارد است ولی سه ابهام دارد |

1. **روز مثبت/منفی/بدون معامله:** روزهای بدون معامله اصلاً در Map نیستند (درست).
   روزهای منفی وارد `Math.max(..., 0)` می‌شوند پس `bestDay` هرگز منفی نیست (درست).
2. **ناسازگاری تعریف «روز» (P2):** `bestDay` بر اساس **زمان بسته شدن** (`closedAt`) گروه‌بندی
   می‌شود (`sumByDay` در `:170`)، اما `MIN_TRADING_DAYS` بر اساس **زمان باز شدن**
   (`openedAt`، خط `:303`). معامله‌ای که ۲۳:۵۹ باز و ۰۰:۰۱ بسته شود در دو روز متفاوت
   شمرده می‌شود. این ناسازگاری باید یکسان‌سازی شود.
3. **زمان بررسی:** قانون فقط در لحظه‌ی `targetMet` تبدیل به BREACH می‌شود و تا آن زمان
   WARN است. این منطق **درست** است، اما در UI به‌صورت «هشدار ۱۰۰٪» دیده می‌شود که
   معامله‌گر آن را نقض تلقی می‌کند.

**مثال از دیتابیس شما:** حساب `#111610507` → `CONSISTENCY = WARN, used = 100.0%`.
چون کل سود در یک روز کسب شده. این حساب **هرگز نمی‌تواند Pass شود** مگر در روزهای
دیگر هم سود بسازد — که منطقی است، ولی به معامله‌گر توضیح داده نمی‌شود.

---

### ۳٫۶ MIN_TRADING_DAYS — حداقل روز معاملاتی 🟡 MEDIUM

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:303-309` |
| **تعریف** | `new Set(trades.map(t => dayKey(t.openedAt, offset))).size` — یک روز به‌ازای هر روزی که در آن معامله **باز** شده |
| **Status** | ✅ منطق پایه درست است (۱۰ معامله در یک روز = ۱ روز) |

**مشکلات:**

| مورد | وضعیت |
|---|---|
| Timezone روز | `dayResetUtcOffset = 0` (UTC) — در Setting ذخیره‌شده اصلاً کلید وجود ندارد و به Default صفر برمی‌گردد. سرور `MetaQuotes-Demo` روی GMT+2/+3 است → مرز روز ۲ تا ۳ ساعت جابه‌جاست. **P1** |
| Timestamp خام | Agent در `mt5_extractor.py:118,221-222` از `datetime.fromtimestamp()` **بدون timezone** استفاده می‌کند (زمان محلی VPS)، سپس `to_iso_utc` همان رشته را به‌عنوان UTC برچسب می‌زند. اگر VPS روی وقت ایران باشد، همه‌ی زمان‌ها **۳٫۵ ساعت** جابه‌جا هستند. **P1** |
| Pending Order | اصلاً وارد سیستم نمی‌شود ❌ |
| پوزیشن باز بدون بسته‌شدن | روز شمرده می‌شود (چون از `openedAt` است) ✅ |
| معامله ۲۳:۵۹ → ۰۰:۰۱ | ۱ روز (بر اساس open) — با Consistency ناسازگار (بند ۳٫۵) |

---

### ۳٫۷ MIN_HOLD_TIME — حداقل زمان نگهداری 🟠 HIGH

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:187-199` (`countableProfitOf` / `voidedProfit`) و `:434-442` |
| **منطق** | معامله‌ی **سودده** زیر ۶۰ ثانیه → سودش صفر می‌شود. معامله‌ی زیان‌ده کامل حساب می‌شود. severity = `INFO`. |
| **Status** | ⚠️ منطق درست، ولی سه نقص |

**نقص ۱ — Partial Close کاملاً دور می‌زند (P1).**
در `bot/core/mt5_extractor.py:214-224` تمام Dealهای یک `position_id` در یک «معامله» ادغام
می‌شوند: `open_time` = اولین ورود، `close_time` = **آخرین** خروج. پس اگر معامله‌گر یک
پوزیشن را ۲ ساعت نگه دارد و در آن ۲ ساعت ده بار Partial Close با سود کند، همه‌ی آن‌ها
یک معامله‌ی ۲ ساعته حساب می‌شوند و قانون ۶۰ ثانیه اصلاً فعال نمی‌شود.

**نقص ۲ — سود Void شده در Payout پرداخت می‌شود (P0).**
`src/lib/payout-rules.ts:40-42`:

```ts
const grossProfit = Math.max(0, input.equity - input.startingBalance);
const available = Math.floor(grossProfit * (profitSplit/100) * 100) / 100;
```

این محاسبه هیچ ارتباطی با `voidedProfit` ندارد. یعنی سودی که موتور ریسک آن را
«محاسبه نشده» اعلام کرده، در لحظه‌ی برداشت **کامل پرداخت می‌شود**.

> **مثال:** معامله‌گر Funded با $۱۰٬۰۰۰ و ۸۰٪ Split. کل سود $۲٬۰۰۰ که $۱٬۵۰۰ آن از
> اسکالپ زیر یک دقیقه است. پنل نشان می‌دهد `countableProfit = $500`، اما
> `evaluatePayout` مبلغ `$2,000 × 0.8 = $1,600` را قابل برداشت اعلام می‌کند.
> **ضرر مستقیم کارفرما: $۱٬۲۰۰.**

**نقص ۳ — Payout روی Equity محاسبه می‌شود نه Balance (P0).**
همان خط از `equity` استفاده می‌کند که شامل **سود شناور** است. معامله‌گر می‌تواند یک
پوزیشن پرسود باز کند، درخواست برداشت بدهد، و سپس پوزیشن را با ضرر ببندد.

**مشکل UI:** در اسکرین‌شات، کارت «حداقل زمان نگهداری» با نوار **۱۰۰٪ زرد** و برچسب
«هشدار» نمایش داده می‌شود، چون `limit = 0` و `usedPct = shortTrades ? 100 : 0`.
معامله‌گر این را «۱۰۰٪ نقض» می‌خواند در حالی که فقط یک اطلاع‌رسانی است.

---

### ۳٫۸ INSTRUMENT — نماد مجاز 🟠 HIGH

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:326-336` و `:425-433` |
| **منطق** | `normaliseSymbol` (حذف هر چیز غیر A-Z) سپس `startsWith` روی لیست مجاز |
| **Status** | ⚠️ Detect می‌کند ولی Prevent نمی‌کند |

**مشکل بنیادی:** هیچ Execution Layer وجود ندارد. معامله‌گر مستقیماً در ترمینال MT5
معامله می‌کند. پلتفرم فقط **بعد از** انجام معامله و **بعد از** Sync (تا ۱۲۰ ثانیه بعد)
متوجه می‌شود. سؤال «آیا کاربر می‌تواند با API مستقیم BTCUSD بزند؟» موضوعیت ندارد —
پلتفرم اصلاً API سفارش‌گذاری ندارد؛ ولی محدودیت واقعی هم فقط باید سمت **بروکر** روی
همان حساب MT5 اعمال شود. **این باید به کارفرما گفته شود.**

**نقص فنی (P3):** `normaliseSymbol` ارقام را حذف می‌کند، پس `US30` → `US` و
`XAUUSD.m` → `XAUUSDM` (که با `startsWith('XAUUSD')` مجاز می‌شود — درست).
ولی `XAUUSDT` هم مجاز می‌شود که ممکن است نماد متفاوتی باشد.

---

### ۳٫۹ PROFIT_TARGET — هدف سود 🟢 LOW

| | |
|---|---|
| **فایل** | `src/lib/monitor.ts:250-262` و `:348-360` |
| **فرمول** | `countableProfit = (Balance − StartingBalance) − voidedProfit`، مقایسه با `StartingBalance × target%`. تنها زمانی MET می‌شود که `openCount === 0`. |
| **Status** | ✅ منطق درست و مطابق استاندارد صنعت |

**نکات:** Commission و Swap در `profit` وارد نمی‌شوند (بند ۷). Deposit/Withdrawal هیچ
تشخیصی ندارند — واریز به حساب مستقیماً به‌عنوان سود شمرده می‌شود.

> **مثال:** حساب $۱٬۰۰۰ با هدف $۱۰۰. اگر بروکر $۱۵۰ Credit/Bonus اضافه کند،
> `Balance = 1,150` → `countableProfit = 150 ≥ 100` → **Target MET بدون هیچ معامله‌ای.**

**تست ناموفق موجود:** `scripts/test-monitor.ts` انتظار دارد هدف با سود مقیاس بخورد
(`✗ target scaled to 103.80 — expected 103.8, got 100`). این نشان می‌دهد Spec یک بار
تغییر کرده و تست‌ها به‌روز نشده‌اند.

---

## ۴. Critical Bugs (P0)

| # | باگ | فایل | اثر |
|---|---|---|---|
| C1 | `HFT_COOLDOWN` هر حساب فعالی را Fail می‌کند | `monitor.ts:203-224, 443-456` | ۴ از ۵ حساب دیتابیس اشتباهاً سوخته |
| C2 | `worstFloating` بدون شرط ۲ پوزیشن انباشته می‌شود | `watermarks.ts:75-86`, `bridge_agent.py:196,236` | Fail کاذب / عدد بی‌معنا در پنل |
| C3 | Sanity Clamp دراوداون روزانه‌ی واقعی را صفر می‌کند | `watermarks.ts:61-63, 70-72` | نقض بزرگ کاملاً نامرئی |
| C4 | `disableAccount()` یک no-op خالی است | `trading.ts:46-48` + `TRADING_PROVIDER=mock` | حساب Fail شده در MT5 باز می‌ماند |
| C5 | Payout روی `equity` و بدون کسر `voidedProfit` | `payout-rules.ts:40-42` | پرداخت سود غیرمجاز و سود شناور |
| C6 | `triggerBotSync` تمام Tradeها را `deleteMany` و بدون `externalId` بازسازی می‌کند | `monitor-source.ts:343-360` | تخریب تاریخچه + امکان دوباره‌شماری معاملات |
| C7 | قطع Agent هیچ Alert نمی‌دهد؛ حساب «سالم» می‌ماند | `monitor-source.ts:129-137` | در قطعی Feed هیچ قانونی اجرا نمی‌شود |

### جزئیات C6 — دوباره‌شماری معاملات

مسیر دکمه‌ی «همگام‌سازی زنده»:

```
POST /api/accounts/sync
  → triggerBotSync()                              [monitor-source.ts:255]
      → POST bot:8000/api/bridge/sync-account
          → sync_single_account()                 [bridge_agent.py:270]
              → push_snapshots() → POST /api/bridge/accounts
                    ↳ Trade.create با externalId = "acct:ticket"   ← درج اول
                    ↳ runAccountCheck()                            ← ارزیابی اول
          ← پاسخ شامل deals
      → prisma.trade.deleteMany({accountId})      ← کل تاریخچه پاک می‌شود
      → prisma.trade.createMany(...)              ← بدون externalId (null)
  → runAccountCheck()                             ← ارزیابی دوم
```

نتیجه: بعد از هر بار زدن دکمه، `externalId` همه‌ی معاملات `null` می‌شود. در Push بعدی
Agent، همان معاملات **دوباره** با `externalId` درج می‌شوند چون دیگر تداخلی وجود ندارد.
هر معامله دو بار شمرده می‌شود → سود، ضرر، Consistency، تعداد معاملات کوتاه و تخلفات
Cooldown همه دو برابر می‌شوند.

> در دیتابیس فعلی `count(externalId IS NULL) = 0` است، یعنی این مسیر اخیراً اجرا نشده
> (چون سرویس Bot روی پورت ۸۰۰۰ بالا نیست) — ولی باگ فعال و در انتظار است.

---

## ۵. Security Issues — راه‌های دور زدن قوانین

| # | مسئله | فایل | سطح |
|---|---|---|---|
| S1 | `BRIDGE_SECRET` به‌صورت hardcode در سورس پایتون به‌عنوان fallback | `bot/bridge_agent.py:56` | **CRITICAL** |
| S2 | همان Secret + پسورد MT5 به‌صورت plaintext در `agent/config.json` (داخل ریپو) | `agent/config.json` | **CRITICAL** |
| S3 | `dbpass.txt` و `metaapi-token.txt` در ریشه‌ی پروژه | root | HIGH |
| S4 | هرکس Secret را داشته باشد می‌تواند از راه دور **حساب بسازد** با `startingBalance` دلخواه | `bridge/accounts/route.ts:100-150` | **CRITICAL** |
| S5 | همان Secret اجازه می‌دهد balance/equity/deals دلخواه Push شود → عبور از هر قانون | `bridge/accounts/route.ts` | **CRITICAL** |
| S6 | `GET /api/bridge/roster` پسورد investor همه‌ی حساب‌ها را برمی‌گرداند | `bridge/roster/route.ts` | HIGH |
| S7 | `triggerBotSync` در نبود investorPassword، **پسورد Master** را به سرویس Bot می‌فرستد | `monitor-source.ts:263` | HIGH |
| S8 | مقایسه‌ی Secret با `!==` (بدون timing-safe compare) | `bridge/*/route.ts` | LOW |
| S9 | `rateLimit` درون‌حافظه‌ای است؛ با Restart پاک می‌شود و بین Instanceها مشترک نیست | `api.ts:37-47` | MEDIUM |

**پاسخ به سؤال «آیا Frontend می‌تواند مقادیر ریسک را تغییر دهد؟»**
✅ **خیر.** بررسی شد: هیچ Endpointی مقادیر `daily_loss`, `drawdown`, `equity`, `profit`,
`account_status`, `trading_days` یا `holding_time` را از Body کاربر نمی‌پذیرد.
`/api/accounts/check` و `/api/accounts/sync` فقط `accountId` می‌گیرند و مالکیت را با
`userId: session.sub` بررسی می‌کنند. `/api/admin/*` با `session.role !== 'ADMIN'` محافظت
شده‌اند. **این بخش سالم است.**

**اما** تمام اعتماد به `BRIDGE_SECRET` منتقل شده و آن Secret در ریپو و در سورس hardcode است.

---

## ۶. Realtime Issues

| # | مسئله | جزئیات | سطح |
|---|---|---|---|
| R1 | هیچ Price Feed / Tick Stream وجود ندارد | ریسک فقط از snapshot بروکر خوانده می‌شود | **P0** |
| R2 | نمونه‌برداری بین Poll پیاده‌سازی نشده | `sampleSeconds: 2` در config هست، در کد نیست | **P0** |
| R3 | فاصله‌ی Poll ۱۲۰ ثانیه و **متوالی** برای هر حساب | یک ترمینال MT5 مشترک، لاگین/لاگ‌اوت پی‌درپی → با N حساب تأخیر = ۱۲۰ + N×~۳ ثانیه | **P0** |
| R4 | Sweep داخلی (هر ۵ دقیقه) داده‌ی جدید نمی‌گیرد | `fetchLiveSnapshot` اگر snapshot < ۳۰ دقیقه باشد همان داده‌ی قدیمی را برمی‌گرداند | **P1** |
| R5 | تا ۳۰ دقیقه پس از مرگ Agent، منبع «bridge/زنده» گزارش می‌شود | `monitor-source.ts:131` | **P1** |
| R6 | هیچ WebSocket/SSE به مرورگر نیست | پنل فقط با دکمه به‌روز می‌شود | **P1** |
| R7 | Agent هم‌اکنون متوقف است (آخرین لاگ ۰۵:۳۱ — ۲۵ آگوست) | هیچ Alert یا Health Check وجود ندارد | **P0** |
| R8 | حساب `PASSED` یا `FAILED` از Roster حذف می‌شود | `bridge/roster/route.ts` — پایش کاملاً قطع می‌شود | P2 |

**Tick loss / Duplicate / Out-of-order / Stale / Spike:** چون Tick اصلاً وجود ندارد،
هیچ‌کدام از این سناریوها مدیریت نشده‌اند. Snapshotهای تکراری بی‌ضرر هستند
(watermarkها idempotent هستند: min/max). Snapshot خارج از ترتیب **مضر است** چون
`balance`/`equity` بدون بررسی timestamp بازنویسی می‌شوند.

---

## ۷. Financial Calculation Issues

| # | مسئله | فایل | مثال عددی | سطح |
|---|---|---|---|---|
| F1 | **Commission و Swap در PnL وارد نمی‌شوند** | `mt5_extractor.py:225-227, 264` — `comm` و `swp` محاسبه می‌شوند ولی `profit: round(pnl,2)` فقط `profit` خام است | ۱۰۰ معامله × $۷ کمیسیون = $۷۰۰ زیان نامرئی | **P0** |
| F2 | Swap در PnL پوزیشن باز نیست | MT5 `position.profit` شامل swap نیست | پوزیشن هفتگی: swap −$۴۰ دیده نمی‌شود | P1 |
| F3 | Deposit / Withdrawal تشخیص داده نمی‌شود | `mt5_extractor.py:178-184` آن‌ها را رد می‌کند، پلتفرم فقط تغییر Balance را می‌بیند | Credit $۱۵۰ روی حساب $۱٬۰۰۰ = Target MET بدون معامله | **P0** |
| F4 | همه‌جا `Float` استفاده می‌شود (Prisma `Float`, JS `number`) | `schema.prisma`, کل موتور | با ۷۴ معامله خطا در حد سِنت، در مقیاس بزرگ‌تر رشد می‌کند | P2 |
| F5 | `pct()` به بازه ۰..۱۰۰ Clamp می‌شود | `monitor.ts:126-129` | نقض ۲۰۰٪ در UI «۱۰۰٪» دیده می‌شود | P3 |
| F6 | `limitState` در `used >= limit` نقض اعلام می‌کند | `monitor.ts:138-143` | دقیقاً روی $۵۰٫۰۰ = BREACH — باید با متن قوانین تطبیق داده شود | P3 |
| F7 | `usedPct = 100` وقتی `limit = 0` | `monitor.ts:439, 452` | کارت‌های INSTRUMENT/MIN_HOLD/COOLDOWN همیشه ۱۰۰٪ پر نشان داده می‌شوند | P2 |
| F8 | Contract Size / Tick Value / Pip Value / Leverage هیچ‌جا محاسبه نمی‌شود | — | PnL مستقیماً از MT5 خوانده می‌شود (این درست است) — ولی هیچ اعتبارسنجی مستقلی وجود ندارد | P3 |
| F9 | تبدیل ارز وجود ندارد | `fx.ts` فقط برای قیمت‌گذاری IRR است | اگر حساب EUR باشد همه‌ی سقف‌های USD اشتباه‌اند | P2 |

**نکته درباره XAU/USD:** چون `profit` مستقیماً از MT5 گرفته می‌شود (که خودش Contract
Size = ۱۰۰ اونس و Tick Value را اعمال کرده)، محاسبه‌ی مبلغ **درست** است. مشکل فقط
Commission/Swap است که MT5 در فیلد جداگانه‌ای نگه می‌دارد و ما آن را نادیده می‌گیریم.

---

## ۸. Database Issues

| # | مسئله | سطح |
|---|---|---|
| D1 | **Production روی SQLite اجرا می‌شود** (`provider = "sqlite"`, `DATABASE_URL="file:..."`) — با نوشتن هم‌زمان Agent + Sweep + کاربران، `SQLITE_BUSY` و قفل فایل رخ می‌دهد | **P0** |
| D2 | مسیر Read-Modify-Write برای Watermarks هیچ Transactionی ندارد | **P0** |
| D3 | `orderId` حساب‌های Auto-provision مقدار جعلی `order_<accountNumber>` دارد که به هیچ Order واقعی اشاره نمی‌کند (در دیتابیس شما هر ۴ حساب چنین‌اند) | P1 |
| D4 | هر ۵ حساب به یک کاربر ADMIN تعلق دارند، نه به مشتری واقعی | P1 |
| D5 | `startingBalance` در Auto-provision **حدس زده می‌شود** (سطل ۱۰۰۰/۳۰۰۰/۵۰۰۰/۱۰۰۰۰ بر اساس balance فعلی) — اگر حساب پس از زیان لینک شود، همه‌ی درصدها اشتباه‌اند | **P0** |
| D6 | State ریسک (`status`, `breachRule`) ذخیره می‌شود ولی هیچ ابزار Recalculate/Replay وجود ندارد | P1 |
| D7 | `Trade.closePrice` و `openPrice` در مسیر MetaApi همیشه `0` درج می‌شوند (`monitor-run.ts:40-41`) | P2 |
| D8 | جدول `Trade` هیچ فیلدی برای `commission`, `swap`, `closeReason` ندارد | P1 |

**پاسخ به «آیا ممکن است دیتابیس ACTIVE بگوید ولی ریسک واقعی BREACHED باشد؟»**
✅ **بله، به‌راحتی.** سه مسیر تأیید شد:
1. Agent متوقف است → هیچ Push جدیدی نیست → وضعیت روی آخرین Snapshot سالم می‌ماند.
2. نقض بین دو Poll رخ می‌دهد و برمی‌گردد → هرگز دیده نمی‌شود (بند ۳٫۳ نقص ۱).
3. Sanity Clamp نقض بزرگ را پاک می‌کند (بند ۳٫۳ نقص ۲).

و برعکس هم صادق است: دیتابیس `FAILED` می‌گوید در حالی که حساب کاملاً سالم است
(هر ۴ حساب فعلی، به‌خاطر `HFT_COOLDOWN`).

---

## ۹. Race Conditions

| # | سناریو | جزئیات | سطح |
|---|---|---|---|
| RC1 | **Push هم‌زمان Agent + دکمه‌ی همگام‌سازی** | هر دو `nextWatermarks` را روی همان Row اجرا می‌کنند: `read → compute → update` بدون Transaction. Push بدتر می‌تواند با Push بهتر بازنویسی شود و `worstFloating`/`lowestEquity` واقعی گم شود | **P0** |
| RC2 | `runAccountCheck` دو بار هم‌زمان روی یک حساب | مسیر `/api/accounts/sync` باعث می‌شود Bridge یک بار و خود Route یک بار ارزیابی کند. اگر یکی Fail و دیگری همان لحظه Update کند، `breachedAt`/`breachRule` می‌تواند ناسازگار شود | P1 |
| RC3 | `deleteMany` + `createMany` در `triggerBotSync` هم‌زمان با Push Agent | Push در فاصله‌ی delete و create می‌تواند معامله را با `externalId` درج کند و بلافاصله نسخه‌ی بدون `externalId` هم اضافه شود → **دو نسخه از یک معامله** | **P0** |
| RC4 | Sweep زمان‌بندی‌شده هم‌زمان با Push | `instrumentation.node.ts` فقط از هم‌پوشانی Sweep با خودش جلوگیری می‌کند (`running` flag)، نه با Bridge | P1 |
| RC5 | `rateLimit` بدون قفل | `buckets.get`/`set` غیر اتمیک — در Next.js تک‌رشته‌ای کم‌خطر است | P3 |

**«دو درخواست هم‌زمان برای باز کردن معامله»** موضوعیت ندارد چون پلتفرم سفارش‌گذاری ندارد.
اما معادل آن در این سیستم، **دو Push هم‌زمان** است که RC1 و RC3 را ایجاد می‌کند.

**Atomicity:** هیچ‌کدام از دنباله‌های حساس (`Check Risk → Update Watermarks → Update Status`)
درون `prisma.$transaction` نیستند. با SQLite این یعنی وضعیت نیمه‌نوشته امکان‌پذیر است.

---

## ۱۰. Admin Panel Issues

| # | مسئله | فایل | سطح |
|---|---|---|---|
| A1 | **سه دکمه‌ی هم‌پوشان** روی هر ردیف: «بررسی» + «همگام‌سازی زنده» (از `AccountMonitor`) + یک دکمه‌ی «همگام‌سازی» سوم (از `AccountActions`) | `AccountMonitor.tsx:160-215`, `AccountActions.tsx:52-66` | P1 |
| A2 | دکمه‌ی `SyncAllButton` **همیشه پیام موفقیت** نشان می‌دهد، حتی وقتی سرویس Bot خاموش است | `SyncAllButton.tsx:22-27` + `sync-all/route.ts:16-22` | P1 |
| A3 | ستون مبلغ در جدول ادمین `equity` را نشان می‌دهد ولی برچسبش «مبلغ» است | `admin/accounts/page.tsx:57-59` | P3 |
| A4 | جدول ادمین از **داده‌ی ذخیره‌شده** رندر می‌شود؛ هیچ نشانه‌ای از کهنگی روی خود اعداد نیست (فقط `SyncBadge` کنار شماره حساب) | `admin.ts:118-144` | P2 |
| A5 | گزارش کارت داشبورد و گزارش Modal **دو عدد متفاوت** می‌دهند | `data.ts:79-95` — `getAccountViews` تابع `buildReport` را **بدون** `dayLowEquity`/`lowestEquity`/`worstFloating`/`dayStartBalance` صدا می‌زند، پس Watermarkها نادیده گرفته می‌شوند | **P0** |
| A6 | `detail` کارت FLOATING_RISK (تعداد پوزیشن باز) با رنگ **قرمز** رندر می‌شود — «۰» قرمز در اسکرین‌شات شما | `AccountMonitor.tsx:395-399` | P2 |
| A7 | `Last Updated` فقط `checkedAt` گزارش است، نه زمان واقعی داده (`snapshotAt`) | `AccountMonitor.tsx:243-256` | P2 |
| A8 | دلیل نقض (`Reason`) فقط نام قانون است؛ عدد و آستانه‌ی لحظه‌ی نقض ذخیره نمی‌شود | `monitor-run.ts:170-176` | P1 |

**A5 با جزئیات:** در `src/lib/data.ts:79`:

```ts
const report = buildReport(
  { startingBalance, balance, equity, phase, status },   // ← بدون watermarks
  ...
);
```

نتیجه: کارت داشبورد `dailyLoss` و `maxDrawdown` را از Equity **لحظه‌ای** می‌سازد،
در حالی که Modal همان اعداد را از Watermarkها می‌سازد. **دو عدد متفاوت برای یک حساب.**

---

## ۱۱. Missing Tests

**وضعیت فعلی:** فقط یک فایل تست وجود دارد — `scripts/test-monitor.ts` — و
**۱۴ تست آن هم‌اکنون Fail است**:

```
✗ consistency → WARN                 expected "WARN",   got "BREACH"
✗ target scaled to $2,400            expected 2400,     got 1000
✗ account not failed by consistency  expected "ACTIVE", got "FAILED"
✗ breached (single position)         expected "BREACH", got "OK"
✗ counts the 400 loss                expected 400,      got 0
... (۱۴ مورد)
```

یعنی موتور تغییر کرده و تست‌ها به‌روز نشده‌اند — **هیچ شبکه‌ی ایمنی رگرسیونی وجود ندارد.**

**تست‌هایی که باید ساخته شوند:**

| نوع | پوشش لازم |
|---|---|
| **Unit** | برای هر ۹ قانون: `PASS` / `FAIL` / `BELOW LIMIT` / `EXACT LIMIT` / `ABOVE LIMIT` / `OFF` |
| **Unit** | `nextWatermarks`: تغییر روز، Clamp، پوزیشن تکی vs چندتایی، Equity منفی |
| **Unit** | `dayKey` با offsetهای مختلف (۰، ۳، ۳٫۵، −۵)، مرز ۲۳:۵۹→۰۰:۰۱ |
| **Integration** | `runAccountCheck` با DB واقعی: ACTIVE → BREACH → قفل شدن وضعیت |
| **API** | مالکیت حساب، دسترسی ادمین، Rate Limit، Bridge با/بدون Secret |
| **Concurrency** | دو Push هم‌زمان → Watermark بدتر باید برنده شود |
| **Realtime** | شبیه‌سازی قطع Feed → وضعیت باید STALE شود نه ACTIVE |
| **Regression** | ۴۰ سناریوی Edge Case که در صورت مسئله فهرست کرده‌اید |
| **Replay** | بازپخش کامل حساب از تاریخچه (بخش زیر) |

### پیشنهاد سیستم Replay

معماری فعلی **اجازه‌ی Replay را می‌دهد** چون `buildReport` یک تابع خالص بدون I/O است.
پیشنهاد: یک اسکریپت `scripts/replay-account.ts` که:

```
Trade[] تاریخی  +  Snapshot[] تاریخی  →  اجرای گام‌به‌گام nextWatermarks + buildReport
                                        →  مقایسه‌ی Stored Result با Recalculated Result
```

در جریان همین ممیزی، دقیقاً چنین بازپخشی اجرا شد و نتیجه‌اش اعداد بخش‌های ۳٫۱ و ۳٫۲
است — که با اسکرین‌شات شما بیت‌به‌بیت مطابقت داشت.
**پیش‌نیاز:** جدولی برای نگهداری تاریخچه‌ی Snapshotها (الان فقط آخرین Snapshot ذخیره می‌شود).

---

## ۱۲. Source of Truth — جدول مرجع داده‌ها

| داده | Source of Truth | Calculated / Stored | Realtime / Cached | تغییر از Frontend؟ | قابل بازمحاسبه؟ |
|---|---|---|---|---|---|
| Balance | MT5 (`account_info`) | Stored | Cached (تا ۱۲۰s+) | ❌ خیر | ⚠️ تقریبی از Trades |
| Equity | MT5 (`account_info`) | Stored | Cached (تا ۱۲۰s+) | ❌ خیر | ❌ خیر (نیاز به قیمت لحظه‌ای) |
| Unrealized PnL | مشتق: `equity − balance` | Calculated | Cached | ❌ خیر | ❌ خیر |
| Realized PnL | جدول `Trade` | Calculated | Cached | ❌ خیر | ✅ بله |
| Daily PnL | `dayStartBalance` + `Trade` | Calculated | Cached | ❌ خیر | ⚠️ فقط اگر `dayStartBalance` درست باشد |
| Daily Drawdown | `dayStartBalance − dayLowEquity` | Stored (watermark) | Cached | ❌ خیر | ❌ **خیر — watermark بازسازی‌پذیر نیست** |
| Overall Drawdown | `startingBalance − lowestEquity` | Stored (watermark) | Cached | ❌ خیر | ❌ **خیر** |
| Floating Drawdown | `worstFloating` | Stored (watermark) | Cached | ❌ خیر | ❌ **خیر — و آلوده است** |
| Open Positions | `openPositions` JSON | Stored | Cached | ❌ خیر | ❌ خیر |
| تعداد معاملات | جدول `Trade` | Calculated | Cached | ❌ خیر | ✅ بله |
| روزهای معاملاتی | `Trade.openedAt` | Calculated | Cached | ❌ خیر | ✅ بله |
| مدت نگهداری | `closedAt − openedAt` | Calculated | Cached | ❌ خیر | ✅ بله (ولی Partial Close ادغام شده) |
| نمادهای مجاز | `Setting.rules` | Stored | Live | فقط ADMIN | ✅ بله |
| Stability | `Trade` گروه‌بندی روزانه | Calculated | Cached | ❌ خیر | ✅ بله |
| Cooldown | `Trade` | Calculated | Cached | ❌ خیر | ✅ بله |
| Account Status | `TradingAccount.status` | Stored | Cached | ❌ خیر | ⚠️ جزئی |

**نتیجه‌ی مهم:** سه عدد بحرانی — `dayLowEquity`، `lowestEquity`، `worstFloating` —
**غیرقابل بازسازی** هستند. اگر خراب شوند (که `worstFloating` هم‌اکنون خراب است)،
هیچ راهی برای بازیابی صحیح‌شان جز پاک کردن و شروع از نو وجود ندارد.
این تنها با نگهداری **تاریخچه‌ی Snapshotها** قابل حل است.

---

## ۱۳. جدول اولویت‌بندی نهایی

| P | Issue | File | Function | Impact | Recommended Fix |
|---|---|---|---|---|---|
| **P0** | Cooldown هر حساب را Fail می‌کند | `src/lib/monitor.ts:203,443` | `cooldownViolations` | ۴/۵ حساب اشتباه سوخته | severity → INFO/SOFT + آستانه + فقط بعد از createdAt |
| **P0** | `worstFloating` بدون شرط ۲ پوزیشن | `src/lib/watermarks.ts:75` | `nextWatermarks` | Fail کاذب | استفاده از `openCount` + پاکسازی داده‌ی آلوده |
| **P0** | Sanity Clamp دراوداون را پاک می‌کند | `src/lib/watermarks.ts:61,70` | `nextWatermarks` | نقض نامرئی | حذف Clamp، جایگزینی با Alert |
| **P0** | `disableAccount` no-op است | `src/lib/trading.ts:46` | `MockTradingPlatform` | حساب سوخته باز می‌ماند | آداپتور واقعی MT5 یا فرآیند دستی مستند |
| **P0** | Payout روی equity + بدون کسر voided | `src/lib/payout-rules.ts:40` | `evaluatePayout` | پرداخت غیرمجاز | استفاده از `balance` + کسر `voidedProfit` |
| **P0** | `deleteMany` تاریخچه‌ی Trade | `src/lib/monitor-source.ts:343` | `triggerBotSync` | تخریب داده + دوباره‌شماری | Upsert بر اساس `externalId` |
| **P0** | نمونه‌برداری Equity پیاده نشده | `bot/bridge_agent.py:195` | `extract_account_*` | نقض بین Poll نامرئی | حلقه‌ی `sampleSeconds` واقعی |
| **P0** | Commission/Swap در PnL نیست | `bot/core/mt5_extractor.py:264` | `extract_sync` | زیان نامرئی | `profit = pnl + comm + swp` |
| **P0** | SQLite در Production | `prisma/schema.prisma:11` | — | قفل و ناسازگاری | مهاجرت به PostgreSQL |
| **P0** | Watermark بدون Transaction | `bridge/accounts/route.ts:185` | POST | گم شدن بدترین نقطه | `prisma.$transaction` + قفل ردیف |
| **P0** | `startingBalance` حدس زده می‌شود | `bridge/accounts/route.ts:114,127` | POST | همه‌ی درصدها اشتباه | Auto-provision را خاموش کنید |
| **P0** | داشبورد بدون Watermark محاسبه می‌کند | `src/lib/data.ts:79` | `getAccountViews` | دو عدد متفاوت | پاس دادن کامل Watermarkها |
| **P0** | قطع Feed هیچ Alert ندارد | `src/lib/monitor-source.ts:129` | `fetchLiveSnapshot` | توقف کامل اجرای قوانین | وضعیت `STALE` + هشدار ادمین |
| **P0** | Secretها در ریپو hardcode | `bot/bridge_agent.py:56`, `agent/config.json` | — | کنترل کامل سیستم | چرخش Secret + انتقال به env |
| **P1** | Timestampهای Naive به‌عنوان UTC | `bot/core/mt5_extractor.py:118,221` | `extract_sync` | مرز روز ۳٫۵ ساعت غلط | `datetime.fromtimestamp(t, tz=utc)` |
| **P1** | `dayResetUtcOffset` در Setting نیست | `Setting.rules` | — | مرز روز UTC به‌جای بروکر | ذخیره‌ی صریح مقدار |
| **P1** | Partial Close قانون Hold Time را دور می‌زند | `bot/core/mt5_extractor.py:214` | `extract_sync` | اسکالپ بدون جریمه | هر Deal خروج = یک رکورد |
| **P1** | Deposit/Withdrawal تشخیص داده نمی‌شود | `bot/core/mt5_extractor.py:178` | `extract_sync` | Target کاذب | ثبت جداگانه + تعدیل `startingBalance` |
| **P1** | تناقض Spec ریسک شناور (کد vs تست) | `monitor.ts:296` vs `test-monitor.ts:380` | — | ابهام قانون | تصمیم کارفرما |
| **P1** | `lowestEquity` از اولین Push شروع می‌شود | `src/lib/watermarks.ts:83` | `nextWatermarks` | دراوداون قبلی گم می‌شود | Seed از `startingBalance` |
| **P1** | ۱۴ تست Fail | `scripts/test-monitor.ts` | — | بدون شبکه‌ی ایمنی | بازنویسی کامل بعد از تثبیت Spec |
| **P1** | سه دکمه‌ی هم‌پوشان Sync | `AccountMonitor.tsx`, `AccountActions.tsx` | — | سردرگمی کاربر | **یک دکمه** (درخواست شما) |
| **P1** | `SyncAllButton` همیشه موفق | `SyncAllButton.tsx:22` | `syncAll` | ادمین گمراه می‌شود | نمایش نتیجه‌ی واقعی |
| **P1** | Roster حساب PASSED/FAILED را حذف می‌کند | `bridge/roster/route.ts:31` | GET | توقف پایش | نگه داشتن PASSED |
| **P1** | جدول Trade فاقد commission/swap | `prisma/schema.prisma` | — | بازمحاسبه ناممکن | افزودن ستون‌ها |
| **P1** | دلیل نقض بدون عدد ذخیره می‌شود | `monitor-run.ts:170` | `runAccountCheck` | غیرقابل دفاع در شکایت | ذخیره‌ی snapshot لحظه‌ی نقض |
| **P2** | ناسازگاری روز (open vs close) | `monitor.ts:170,303` | `sumByDay` | آمار ناسازگار | یکسان‌سازی |
| **P2** | `usedPct = 100` وقتی `limit = 0` | `monitor.ts:439,452` | `buildReport` | نوار ۱۰۰٪ گمراه‌کننده | نمایش شمارشی |
| **P2** | Sweep داده‌ی تازه نمی‌گیرد | `monitor-source.ts:131` | `fetchLiveSnapshot` | Sweep تقریباً بی‌اثر | گزینه‌ی `force` |
| **P2** | `openPrice/closePrice = 0` در MetaApi | `monitor-run.ts:40` | `syncTrades` | ممیزی ناممکن | خواندن قیمت واقعی |
| **P2** | `orderId` جعلی | `bridge/accounts/route.ts:122` | POST | یکپارچگی داده | حذف Auto-provision |
| **P3** | `pct()` Clamp به ۱۰۰ | `monitor.ts:126` | `pct` | شدت نقض پنهان | نمایش عدد واقعی |
| **P3** | `used >= limit` = BREACH | `monitor.ts:140` | `limitState` | ابهام مرزی | هماهنگی با متن قوانین |
| **P3** | `normaliseSymbol` ارقام را حذف می‌کند | `monitor.ts:161` | `normaliseSymbol` | تطبیق نادرست نماد | تطبیق دقیق‌تر |
| **P3** | مقایسه‌ی Secret بدون timing-safe | `bridge/*/route.ts` | — | ریسک نظری | `timingSafeEqual` |

---

## ۱۴. آنچه برای تکمیل ممیزی لازم است

| مورد | وضعیت | توضیح |
|---|---|---|
| اجرای موتور روی داده‌ی واقعی | ✅ انجام شد | Replay روی هر ۵ حساب دیتابیس |
| اجرای مجموعه تست موجود | ✅ انجام شد | ۱۴ Fail |
| بررسی سرویس Bot (پورت ۸۰۰۰) | ❌ **بالا نیست** | مسیر `/api/accounts/sync` قابل تست زنده نبود |
| بررسی Agent در حال اجرا | ❌ **متوقف است** | آخرین لاگ: ۲۰۲۶-۰۸-۲۵ ۰۵:۳۱ |
| تست با پوزیشن باز واقعی | ❌ ممکن نشد | هیچ حسابی پوزیشن باز ندارد (`openPositions = "[]"`) |
| تست Hedging / Partial Close | ❌ ممکن نشد | نیاز به حساب دمو با سناریوی کنترل‌شده |
| بررسی رفتار در تغییر روز | ❌ ممکن نشد | نیاز به اجرای ۲۴ ساعته |

**برای ادامه لازم است:**
1. سرویس Bot روی پورت ۸۰۰۰ بالا بیاید (`python bot/api/app.py` یا سرویس NSSM).
2. Agent دوباره اجرا شود (`agent/start-agent.bat`).
3. یک حساب دمو با سناریوی کنترل‌شده: ۲ پوزیشن باز، یک Partial Close، یک معامله‌ی
   ۳۰ ثانیه‌ای، یک ورود ۵ دقیقه بعد از ضرر.
4. تأیید کارفرما درباره‌ی سه ابهام Spec:
   - آیا ریسک شناور با **یک** پوزیشن هم اعمال می‌شود؟
   - آیا `HFT_COOLDOWN` باید Hard باشد یا فقط هشدار؟
   - دراوداون کلی Static از Initial Balance است یا Trailing از High Water Mark؟

---

```
AUDIT COMPLETE
NO CODE CHANGED
```
