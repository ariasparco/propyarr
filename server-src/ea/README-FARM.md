# Terminal farm — 100% coverage, no per-account cost

One MetaTrader terminal per account, each running an Expert Advisor that pushes
account state to the platform on every tick. No polling, no login/logout cycle,
no external service, no monthly fee per account.

```
Agent (old)   one terminal, accounts in turn   ~22% coverage,  ~5 min blind gap
Farm (this)   one terminal per account         ~100% coverage, ~1 sec blind gap
```

You pay for RAM, not per account. That is the whole difference.

---

## Setup — done once

### 1. Prepare the template terminal

Install MetaTrader 5 normally (e.g. `C:\MetaTrader 5`), then, **in that
installation**:

1. Copy `ea\PropinoBridge.mq5` into `MQL5\Experts\`
   (in the terminal: `Ctrl+Shift+D` opens the data folder)
2. Open MetaEditor (`F4`), open the file, press `F7` to compile.
   It must say `0 errors, 0 warnings`.
3. `Tools -> Options -> Expert Advisors`:
   - tick **Allow WebRequest for listed URL**
   - add `https://propino.top`
4. Open one **XAUUSD** chart, drag `PropinoBridge` onto it, and set:
   - `SiteUrl` = `https://propino.top`
   - `BridgeSecret` = the `BRIDGE_SECRET` value from `C:\propino\.env`
5. Confirm the Experts tab shows:
   `PropinoBridge started -- account #... every 5s`
6. Right-click the chart -> **Save profile as** -> `propino`
7. Close the terminal.

The template is now the mould every account is cast from. Its login does not
matter; each copy gets its own.

### 2. Run the farm

```powershell
cd C:\propino
.\tools\mt5-farm.ps1 -Sync -TemplateDir 'C:\MetaTrader 5' -WhatIf
```

`-WhatIf` shows what it would start and stop without touching anything. When it
looks right, run it for real:

```powershell
.\tools\mt5-farm.ps1 -Sync -TemplateDir 'C:\MetaTrader 5'
```

### 3. Measure the real capacity of this server

Once a few terminals have been up for a while:

```powershell
.\tools\mt5-farm.ps1 -Measure
```

This reports measured RAM per terminal and how many accounts fit — from actual
usage on this machine, not an estimate.

---

## Day to day

```powershell
.\tools\mt5-farm.ps1 -Status     # what is running, what it costs
.\tools\mt5-farm.ps1 -Sync       # match the roster: start new, stop finished
.\tools\mt5-farm.ps1 -StopAll    # stop everything
```

**Failed accounts free their memory automatically.** The roster endpoint only
lists `ACTIVE` and `FUNDED` accounts, so the moment an account breaches a rule
it drops off the list, and the next `-Sync` stops its terminal. Nothing has to
be cleaned up by hand.

Run `-Sync` on a schedule so that happens without anyone watching:

```powershell
schtasks /Create /TN "propino-farm-sync" /SC MINUTE /MO 10 /RL HIGHEST /F `
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\propino\tools\mt5-farm.ps1 -Sync"
```

---

## Safety rails

- **It never starts past the RAM budget.** `-ReserveMb` (default 2700) is held
  back for Windows, the site and the database. When free memory would drop below
  that, the sync stops and says so rather than taking the box down.
- **It only touches its own terminals.** Processes are matched by the instance
  path, so a terminal you started by hand is left alone.
- **Stops happen before starts**, so memory is released before it is claimed.
- **Starts are spaced 8 seconds apart** — terminals are heaviest while
  connecting, and a burst spikes well above where they settle.

---

## Capacity, and where this stops working

| Server RAM | Accounts | Cost per account |
|---|---|---|
| 8 GB (this one) | ~15-20 | free |
| 16 GB | ~50 | free |
| 32 GB | ~110 | free |
| 64 GB | ~230 | free |

Past roughly 250 accounts, running that many terminals across several servers
becomes an operational problem of its own, and the answer becomes the MT5
Manager API through a broker — one connection for every account on the server,
at a flat price rather than a per-account one.

Until then, this costs nothing per account.
