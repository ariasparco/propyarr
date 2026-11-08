# PROPINO — Technical Handbook

A bilingual (Persian RTL / English LTR) prop-trading firm platform.
Production: **https://propino.top** on a Windows VPS at `91.228.186.234`.

This document is the single reference for the whole system. Read it before
changing anything — several parts look simple but broke in ways that cost hours.

---

## 1. What the product does

A trader buys a **challenge** (a simulated funded-account evaluation), trades a
demo MetaTrader 5 account, and must hit a profit target without breaking risk
rules. The platform:

1. Sells challenges (USDT on BSC, or site wallet balance)
2. Hands the trader MT5 credentials after an admin creates the account
3. **Reads that account automatically** and enforces the rules
4. Fails the account the moment a hard rule breaks
5. Issues a certificate when a stage is passed
6. Moves the trader Phase 1 → Phase 2 → Funded
7. Pays out profit share

Gold-only firm: the only tradable symbol is `XAUUSD`.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript, strict |
| ORM | Prisma |
| DB | SQLite in dev, **PostgreSQL in production** |
| Auth | `jose` JWT in httpOnly cookies, `bcryptjs` hashing |
| Validation | `zod` |
| Styling | Tailwind CSS |
| Email | `nodemailer` (Liara SMTP) |
| Certificates | `next/og` (Satori) → PNG |
| Monitoring agent | Python + `MetaTrader5` package |

Dependencies are deliberately few: `@prisma/client, bcryptjs, jose, next,
nodemailer, react, react-dom, vazirmatn, zod`. No UI kit, no state library.

### Commands

```bash
npm run dev          # dev server
npm run build        # prisma generate && next build
npm start            # production server
npm run db:push      # apply schema
npm run db:seed      # seed plans + demo data
npm run db:studio    # browse the database
npm run test:email   # send a test email
npm run test:monitor # run the rule engine against seeded data
```

`predev` and `prebuild` both run `scripts/sync-db-provider.mjs`, which rewrites
the Prisma `provider` to match `DATABASE_URL` (sqlite vs postgresql). **Never
hand-edit the provider line in `schema.prisma`** — it is generated.

---

## 3. Directory map

```
src/
  app/
    [locale]/              # every user-facing page, locale-prefixed
      (marketing)/         # public: home, plans, rules, faq, about, blog, contact
      (auth)/              # login, register, forgot-password, admin-login
      dashboard/           # trader panel
      admin/               # admin panel
    api/                   # route handlers (see §7)
  components/
    marketing/             # landing-page sections
    dashboard/             # trader widgets
    admin/                 # admin tables and forms
    site/                  # header, footer, logo
  lib/                     # all business logic (see §4)
  i18n/dictionaries/       # fa.ts and en.ts — every visible string
prisma/schema.prisma       # data model
agent/mt5_agent.py         # the MT5 reader that runs on the VPS
deploy/                    # Windows Server install and repair scripts
scripts/                   # build-time and test helpers
```

### The `lib` modules that matter

| File | Responsibility |
|---|---|
| `monitor.ts` | **The rule engine.** Pure evaluation, no I/O |
| `monitor-run.ts` | Runs a check, persists results, fails accounts |
| `monitor-source.ts` | Where account data comes from (bridge / MetaApi) |
| `wallet.ts` | Wallet ledger, referral commission |
| `payments.ts`, `payments/` | USDT verification against BSC |
| `usdt-sweep.ts` | Confirms crypto payments that landed while nobody watched |
| `pricing.ts` | Discounts, wallet spend, final price |
| `provision.ts` | Creates the TradingAccount when an admin completes an order |
| `certificate.tsx` | Certificate PNG layout |
| `payout-rules.ts` | Payout eligibility |
| `tokens.ts`, `verification.ts` | Email codes, password reset |
| `fx.ts` | Live USD rate |

---

## 4. The monitoring system — read this carefully

This is the most involved part and the easiest to misunderstand.

### The problem

The site runs in a datacentre and cannot talk to MetaTrader directly.
MetaApi (the usual SaaS answer) is unreachable from Iran. So data is **pushed
in** by an agent instead of pulled by the site.

### The flow

```
Admin creates a demo account at web.metatrader.app
        │
        │  enters number + server + password in the admin panel
        ▼
  TradingAccount row  ──────────────────────────────┐
        │                                            │
        │  GET /api/bridge/roster                    │
        │  (agent asks: what should I read?)         │
        ▼                                            │
  agent/mt5_agent.py on the VPS                      │
        │  logs into MT5, reads balance/equity/deals │
        │                                            │
        │  POST /api/bridge/accounts                 │
        ▼                                            │
  monitor-run.ts ── evaluates rules ─────────────────┘
        │
        ├── hard breach  → status FAILED, breachRule set
        └── target met   → certificate issued, stage advances
```

**There is no second list of accounts.** The admin fills the account in once,
on the order. The roster hands those credentials to the agent. That was a
deliberate design decision — a hand-maintained `config.json` on the VPS drifted
out of sync with the database.

### Two interchangeable data sources

The engine does not care where the numbers came from. `fetchLiveSnapshot`
prefers a fresh push from the terminal agent; when none has arrived and a
MetaApi id is set on the account, it reads MetaApi instead. Turning the agent
off is therefore all it takes to move an installation onto MetaApi.

MetaApi serves each account from **one region only**, and calling the wrong one
answers 404 with "make sure your request URL matches your account region" —
indistinguishable at a glance from an account that does not exist. The region is
looked up from the provisioning API per account and cached, rather than assumed
from a single global setting.

Whichever source is used, the drawdown watermarks are kept the same way, in
`lib/watermarks.ts`. Both paths call it: two copies of that arithmetic would
drift, and the marks decide whether an account lives or dies.

`node deploy/check-metaapi.js` reports, per account, whether an id is set, which
region it resolves to, and whether balance, positions and deal history actually
come back — the "is the data arriving?" question kept separate from "are the
rules right?".

### Two independent cycles

| Cycle | Interval | Set by |
|---|---|---|
| Agent reads MT5 and pushes | 120s | `intervalSeconds` in `agent/config.json` |
| Site re-evaluates every account | 5 min | `MONITOR_INTERVAL_MINUTES` in `.env` |

Rules are also evaluated **immediately on every push**, so a breach is caught
within one agent cycle. The 5-minute sweep is a safety net for when the agent
is down. It lives in `src/instrumentation.node.ts` and starts with the server.

Set `MONITOR_INTERVAL_MINUTES=0` to disable the in-process scheduler and drive
`/api/cron/monitor` externally instead — required if the app ever runs on more
than one instance.

### The rules

`buildReport()` in `monitor.ts` returns a `RuleItem[]`. Each has a `usedPct`
(0–100) that the UI draws as a gauge.

| Key | Severity | Meaning |
|---|---|---|
| `PROFIT_TARGET` | TARGET | Objective to reach |
| `DAILY_DRAWDOWN` | HARD | Equity vs balance at day open |
| `MAX_DRAWDOWN` | HARD | Equity vs initial balance |
| `FLOATING_RISK` | HARD | Combined unrealised loss, **two or more open positions only** |
| `MIN_TRADING_DAYS` | TARGET | One day per day a trade was placed |
| `CONSISTENCY` | HARD | No day may deliver half the **target** |
| `INSTRUMENT` | HARD | Gold only |
| `MIN_HOLD_TIME` | INFO | Sub-minute profit voided; losses still count |
| `HFT_COOLDOWN` | HARD | No re-entry for 5 minutes after a losing close |

The calculation *method* follows standard prop-firm practice (FTMO's published
objectives were used as the reference); the *numbers* are this firm's own.
Three points matter most, and all three were wrong before:

**Profit target is measured on the closed balance, with every position flat.**
Not on equity. Floating profit is not profit — an open winner can still turn
around — so a stage cannot pass while a trade is open. The rule reports
`detail: 'open'` when the figure is reached but positions remain.

**The daily limit is measured from the balance carried into the day**, snapshot
at the first push after the broker's rollover and stored in `dayStartBalance`.
The allowance subtracted from it is a percentage of the **initial** balance, so
it does not grow as the account grows. Previously the reference was
reconstructed as `balance − today's closed P/L`, which is algebraically the same
only when trade history is complete — and it silently wasn't.

**The overall limit is a static floor on equity**: `initial × (1 − maxDD%)`,
never trailing, breached the moment equity touches it at any point.

The exact definitions, which are easy to get subtly wrong:

**Sub-minute trades.** A winning trade closed under 60 seconds is treated as if
it never happened: no target credit, no total profit, and no contribution to
consistency either. A *loss* on such a trade counts in full — the trader keeps
the damage. It never fails the account on its own; the voided profit is the
whole penalty.

The engine therefore keeps **two** day maps, and mixing them up is a real bug:
`byDay` holds the money that actually moved and is what the daily drawdown uses
to reconstruct where the day opened, while `countableByDay` zeroes voided wins
and feeds the objectives. Measuring the daily drawdown with countable figures
would invent losses the account never took — a scalp win of 500 followed by a
real loss of 700 is a 200 day, not a 700 one.

**Consistency.** The industry formula: `best day / total profit`. Firms that
run this rule cap it between 30% and 50%; several large firms have no such rule
at all. Sub-minute profit is excluded from both sides.

Two details matter more than the formula:

*Basis.* Measuring against the profit **target** instead was tried and is
wrong. It makes the rule harsher the more a trader earns, and it cannot be
applied to a funded account, which has no target.

*Timing.* It is judged **at the finish line**, not continuously. A trader whose
first winning day is their only winning day sits at 100% by arithmetic, so a
continuous check would fail people for having started. Below the target a
concentrated run only warns; it ends the challenge at the moment the trader
would otherwise pass.

**Floating risk.** Applies only from the *second* open position onward. A trader
holding one position is governed by the daily drawdown alone and may run it to
that full limit. With two or more open, a combined unrealised loss reaching 2.5%
fails the account.

**Trading days.** One per distinct day on which a trade was *opened*, on the
broker's clock. A position carried overnight does not earn a second day. An
open position counts the day it was placed. `monitor-run.ts` reads this figure
back out of the report rather than recomputing it, so the stored number and the
number the trader sees cannot drift apart.

**HFT cooldown.** After closing a *losing* trade, opening anything within
fifteen minutes fails the account. A winning close carries no cooldown. The
window lives in the editable rule settings, so changing it in the admin panel
changes enforcement — the published rules text must be kept in step by hand.

`npm run test:monitor` covers every one of these.

Severity meanings: **HARD** fails the account immediately. **SOFT** blocks
passing or payout but keeps the account alive. **TARGET** is a goal.
**INFO** carries its own penalty elsewhere and never blocks on its own.

Daily drawdown resets each day — a loss taken yesterday reads 0% today. That is
correct and matches how other prop firms work.

### The agent

`agent/mt5_agent.py`, run on the VPS as a **Scheduled Task** (not a Windows
service — MetaTrader needs a real desktop session, which services do not get).

- MetaTrader 5 must be **open and logged in**, or you get `IPC timeout`.
  The Python package attaches to a running terminal; it does not launch one.
- Broker: MetaQuotes demo accounts from `web.metatrader.app`,
  server name **`MetaQuotes-Demo`**.
- Passwords come from the roster. `config.json`'s `accounts` list is a fallback
  and is normally empty.
- On disconnecting from the VPS, use **Disconnect, never Log off** — logging off
  closes MetaTrader and the agent with it.

---

## 5. Data model

Models: `User, WalletEntry, DiscountCode, Ticket, TicketMessage, AuthToken,
Kyc, Challenge, Order, TradingAccount, Certificate, Trade, Payout, AuditLog,
Setting`.

### TradingAccount — the centre of the system

```
accountNumber     unique MT5 login
server            e.g. "MetaQuotes-Demo"
password          MT5 master password (shown to the trader)
investorPassword  read-only password (used by monitoring)
startingBalance / balance / equity
status            ACTIVE | PASSED | FAILED | FUNDED | DISABLED
phase             PHASE_1 | PHASE_2 | FUNDED
openPositions     JSON array from the last push
snapshotAt        when the bridge last reported
breachRule        which rule failed the account
breachSource      AUTO | ADMIN
fundedAt          starts the payout waiting period
```

`investorPassword` is stored in plain text because the agent must log in with
it — it cannot be hashed. Use a **read-only (investor)** password so a leak
cannot move a trader's money. The field accepts a master password and works,
but that trade-off is then yours.

---

## 6. Money

### USDT (BSC)

Payment is verified by reading BSC directly over public JSON-RPC
(`eth_getLogs`) — **not** through a block explorer. BscScan V1 is deprecated
and Etherscan V2's free tier excludes BSC.

Two customers can send the same amount to the same wallet, so orders are
matched by **transaction hash** with a dedupe check: one hash can settle exactly
one order. Orders expire after `USDT_ORDER_TTL_MINUTES` — set generously,
because Iranian exchanges take 30–60 minutes to actually send.

`usdt-sweep.ts` settles payments that arrived while nobody had the page open.

### Wallet, referrals, discounts

- Wallet is an append-only ledger (`WalletEntry`), written inside a transaction
- Referral pays **10%** of what the friend actually spent
- A referral code can only be entered **at signup**, never later
- Discount codes are defined per plan

**Watch out:** referral commission is calculated from `listPrice -
discountAmount`, *not* `order.amount`. When a purchase is paid entirely from
wallet balance, `amount` is 0 and the commission would silently be 0 too.

### Rial

PayStar is wired but **disabled** pending client credentials. It renders with a
"disabled" badge on purpose.

---

## 7. API routes

```
auth/       login logout register me verify-email resend-code forgot reset
orders      checkout/quote  payments/usdt/verify  payments/paystar/callback
accounts/   check  advance
bridge/     roster  accounts          ← the agent talks to these
cron/       monitor                   ← external scheduler entry point
admin/      orders accounts users kyc rules payouts tickets wallet
            discounts certificates
wallet  payouts  tickets  profile  kyc  kyc/image/[id]  certificates/[id]
contact
```

Bridge routes authenticate with `Authorization: Bearer $BRIDGE_SECRET`.
An unauthenticated request must return **403** — that is the quickest way to
check the production site is alive and correctly secured.

---

## 8. Environment variables

```
DATABASE_URL              sqlite file: in dev, postgresql:// in production
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
BRIDGE_SECRET             shared with agent/config.json
CRON_SECRET
NEXT_PUBLIC_SITE_URL      https://propino.top
NEXT_PUBLIC_SITE_NAME
SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM
USDT_RECEIVE_ADDRESS      0x66c2Ae8635B54b0fCe8bc8316c01d98288644B17
USDT_ORDER_TTL_MINUTES
PAYMENTS_USDT_ENABLED     true
PAYMENTS_IRR_ENABLED      false
PAYSTAR_GATEWAY_ID PAYSTAR_SIGN_KEY
MONITOR_INTERVAL_MINUTES  5   (0 disables the in-process scheduler)
TRADING_PROVIDER          bridge
PAYOUT_MIN_DAYS PAYOUT_MIN_USD
USD_IRR_RATE              fallback when the live rate API fails
STORAGE_DIR               KYC images and certificates live outside the DB
```

---

## 9. Internationalisation

Persian is the default and the site is RTL-first. Every visible string lives in
`src/i18n/dictionaries/fa.ts` and `en.ts` — **never hardcode text in a
component.** The two dictionaries must keep identical shapes; TypeScript
enforces this.

Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`)
rather than left/right, so one stylesheet serves both directions.

Certificates are **English-only by deliberate choice**. Satori's bidirectional
text handling broke Persian badly — ZWNJ split words and colons jumped sides.
Switching to English removed the entire class of bug. Do not "fix" this by
reintroducing Persian.

---

## 10. Deployment

Windows Server. Three moving parts:

| Part | How it runs | Survives logoff? |
|---|---|---|
| Next.js site | Windows service via NSSM | Yes |
| Caddy (HTTPS) | Windows service | Yes |
| MT5 agent | Scheduled Task at logon | **No** |

### Scripts in `deploy/`

| Script | Purpose |
|---|---|
| `setup.ps1` | Full first install |
| `update.ps1` | Apply changed source, rebuild, restart |
| `seed.ps1` | Create the first admin |
| `admin.ps1` | Add or reset an admin |
| `agent-setup.ps1` | Install Python, packages, schedule the agent |
| `mt5-install.ps1` | Download and install MetaTrader 5 |
| `diagnose.ps1` | Health check when something is wrong |
| `net-check.ps1` | Outbound connectivity |
| `fix-postgres.ps1` / `fix-caddy.ps1` / `fix-dbpass.ps1` | Targeted repairs |
| `env-template.txt` | Reference only — **must not** be copied to `.env.production` |

Deploy: copy changed files into `C:\propino`, then
`powershell -ExecutionPolicy Bypass -File deploy\update.ps1`.
It stops the service first (Windows file locks), installs, migrates, rebuilds,
restarts. `.env`, the database and `storage/` are never touched.

The VPS cannot download most installers, so bring binaries in by copying them
over the Remote Desktop clipboard.

---

## 11. Traps that already cost real time

Do not rediscover these.

**`.env.production` overrides `.env` in Next.js production.** A leftover
template containing `CHANGEME` took every auth endpoint to HTTP 500 while
`psql` connected fine. The template is now named `env-template.txt` so it can
never be picked up. If auth breaks in production, check for a stray
`.env.production` **first**.

**PowerShell `-replace` treats `$` in the replacement as a capture reference**,
so writing secrets containing `$` silently corrupts them. All env writing is
line-based instead of regex-based.

**`Set-Content -Encoding utf8` writes a BOM on Windows PowerShell 5.1**, and
Python's `json.load` rejects it. Config files are written with
`UTF8Encoding($false)`, and the agent reads with `utf-8-sig`.

**The Windows console cannot encode `✓ ✗ → ⚠`.** Printing them crashed the
agent — and worse, the crash happened *inside the error handler*, hiding the
real error for several debugging rounds. The agent is now pure ASCII and
reconfigures stdout with `errors="replace"`.

**Python buffers stdout when redirected to a file.** An agent that looked dead
was running fine and simply hadn't flushed. `PYTHONUNBUFFERED=1` is set in
`start-agent.bat`.

**Native stderr aborts a PowerShell script under `ErrorActionPreference=Stop`.**
A harmless Prisma deprecation warning killed `npm install`. All deploy scripts
route native commands through `cmd.exe` via `Invoke-Native`, and check
`$LASTEXITCODE` explicitly — a script that prints "OK" without checking the exit
code is lying.

**A running Node service holds `node_modules` open.** `npm install` fails with
EPERM on Windows until the service is stopped. `update.ps1` does this first.
The same applies locally: stop `next dev` before `npm run build`, or
`prisma generate` fails renaming the query engine.

**MetaQuotes blocks PowerShell's user agent.** Downloading MT5 needs
`curl.exe` with a browser UA. Verify the result is a real executable: it must
start with bytes `4d5a` (`MZ`).

**Windows ships a Python stub at `WindowsApps`** that answers `where python` but
only opens the Microsoft Store. `Find-Python` filters it out and probes each
candidate before trusting it.

**`instrumentation.ts` runs in the edge runtime too.** Importing nodemailer
there breaks the build; Node-only work lives in `instrumentation.node.ts`
behind a `NEXT_RUNTIME === 'nodejs'` check.

**A refresh token that nothing refreshes with logs everyone out.** The access
token lasts 15 minutes and the refresh cookie a week, but the refresh cookie was
issued at login and then never read — so traders and admins alike were thrown
back to the sign-in page a quarter of an hour in. Renewal now happens in two
places, and both are needed: the middleware redirects page requests through
`/api/auth/refresh` (a Node route, because the edge has no database), and
`getSession()` falls back to the refresh cookie read-only, because API routes
bypass the middleware entirely. `getSession()` must not write cookies — it is
called during Server Component renders, where that throws.

**`z.string().datetime()` rejects `+00:00`.** Zod's default demands a trailing
`Z`; Python's `isoformat()` writes `+00:00`. Every bridge push carrying real
trades was rejected with a 422 while pushes with empty `deals: []` sailed
through — so the failure only appeared once traders started trading, and looked
like "the rules don't work" rather than a parse error. The schema now accepts
both (`{ offset: true }`) and the agent emits `Z`. Related: the route validates
each account separately, because all-or-nothing validation let one malformed
deal stop every account on the terminal from being monitored.

**The daily reference and the daily low must be set in the same breath.**
Seeding `dayStartBalance` from the current balance while keeping a
`dayLowEquity` recorded earlier measures the day from two different moments,
and the gap between them appears as a loss the account never took — enough to
fail a trader who is up on the day. Whenever the reference is (re)established,
the low is reset with it, so only dips after that point count.

**Equity at poll time is not the drawdown.** A trade that runs 600 down and
closes 300 up is a real 600 drawdown, but a two-minute poll only ever sees a
winning account. The agent therefore samples equity every couple of seconds
between pushes and reports the worst point; the site keeps three watermarks on
the account — `dayLowEquity` (with `dayLowKey`, so it resets when the broker's
day rolls over), `lowestEquity`, and `worstFloating` — and the engine judges the
drawdowns against those, not against the snapshot. When an agent reports no
samples the engine falls back to snapshot behaviour, so older agents still work.
`worstFloating` never resets: a breach that already happened stays a breach
after the positions close.

MetaTrader exposes one account at a time, so sampling visits accounts in turn.
The effective per-account interval is roughly `sampleSeconds × number of
accounts`; with many accounts, lower `sampleSeconds` stops helping.

**MT5 downloads deal history on demand.** Straight after `mt5.login()` switches
accounts, `history_deals_get` usually returns nothing — the terminal has not
fetched it yet. The agent confirms `account_info().login` matches the account it
asked for, then retries the history a few times. It also distinguishes `None`
(the call failed) from an empty tuple (genuinely no trades); `... or []`
collapsed those into the same thing and hid real errors.

**A required foreign key invites a lie.** `Order.challengeId` used to be
mandatory, so a wallet top-up — which buys credit, not a plan — attached an
arbitrary challenge just to fill the column. The order then displayed as a
purchase of whatever plan happened to be first in the table. The column is
nullable now. If a model needs a "sometimes" relation, make it optional rather
than borrowing a row.

**Marquee seams:** a CSS flex `gap` adds an extra space between the two copies
of a looping ticker, so translating `-50%` misses the seam and the loop visibly
jumps. Put the spacing inside each item (`pe-7`) and use no gap.

---

## 12. Conventions

- Server Components by default; `'use client'` only where interaction demands it
- All input validated with zod in `lib/validation.ts` before it reaches Prisma
- Money is stored and computed in USD as `Float`; format at the edge only
- Never trust a client-supplied price — recompute server-side in `pricing.ts`
- Admin routes check the role server-side; hiding a link is not access control
- Comments explain *why*, not *what*

---

## 13. Current status

Working: auth with email verification, password reset, plans, USDT checkout,
wallet, referrals, discount codes, orders, tickets, KYC, admin panel, account
handover, certificates, payouts, the rule engine, the bridge, and the agent.

Outstanding:

- Create the first admin on the production database (`deploy\seed.ps1`)
- End-to-end test with a real demo account
- Set a strong Administrator password on the server and rotate the demo
  credentials before taking real customers
- PayStar Rial gateway — blocked on client credentials
- MetaQuotes demo accounts are removed after a period of inactivity, and the
  firm does not control their creation. Fine for testing and demos; a real
  broker relationship is the long-term answer.
