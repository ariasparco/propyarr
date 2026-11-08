"""Native MetaTrader 5 Python Extractor for high-speed direct account synchronization,
deal history analysis, live metrics extraction, and automatic browser fallback.
"""

import os
import time
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple, Callable, Awaitable
from pathlib import Path

from core.config import logger
from reporters.json_reporter import compute_trade_analytics


# Candidate paths for MetaTrader 5 desktop terminal on Windows
def _utc(ts: Any) -> datetime:
    """MetaTrader epoch second -> timezone-aware UTC datetime.

    `datetime.fromtimestamp(ts)` without a tzinfo returns the VPS's local wall
    clock. That value was then formatted and re-labelled as UTC downstream, so
    every trade time was shifted by the machine's offset -- three and a half
    hours on an Iranian host. Holding time and cooldown survived it because they
    are differences, but the trading-day boundary did not: trades landed on the
    wrong day and the daily drawdown reset at the wrong moment.
    """
    try:
        return datetime.fromtimestamp(float(ts or 0), tz=timezone.utc)
    except (TypeError, ValueError, OSError, OverflowError):
        return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    """Strict ISO-8601 in UTC, the shape the bridge validator accepts."""
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


DEFAULT_MT5_PATHS = [
    r"C:\Program Files\MetaTrader 5\terminal64.exe",
    r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe",
    r"C:\Program Files\ePlanet MetaTrader 5 Terminal\terminal64.exe",
]


def find_mt5_terminal_path(preferred_path: Optional[str] = None) -> Optional[str]:
    """Finds a valid terminal64.exe executable on the host system."""
    if preferred_path and os.path.isfile(preferred_path):
        return preferred_path
    
    env_path = os.environ.get("MT5_TERMINAL_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    for p in DEFAULT_MT5_PATHS:
        if os.path.isfile(p):
            return p
    return None


class MT5NativeExtractor:
    """High-speed native extractor using the official MetaTrader 5 Python API."""

    def __init__(self, terminal_path: Optional[str] = None):
        self.terminal_path = find_mt5_terminal_path(terminal_path)

    @staticmethod
    def _watch(
        mt5,
        balance: float,
        equity: float,
        seconds: float,
        every: float
    ) -> Dict[str, Any]:
        """Re-reads equity for `seconds`, reporting the worst it saw.

        Best-effort by design: any error ends the watch and returns what was
        collected so far, because a failed sample must never cost the caller its
        snapshot. With `seconds <= 0` it degrades to the single reading it was
        given, which is the old poll-only behaviour.
        """
        out: Dict[str, Any] = {
            "equityLow": equity,
            "floatingWorst": 0.0,
            "openCountPeak": 0,
            "samples": 0,
            "equityLast": equity,
            "balanceLast": balance,
        }
        if seconds <= 0:
            return out

        deadline = time.time() + seconds
        logger.info(f"[MT5 Native] Watching equity for {seconds:.0f}s...")
        while time.time() < deadline:
            try:
                info = mt5.account_info()
                if info is None:
                    break
                acc = info._asdict()
                eq = float(acc.get("equity", 0.0))
                bal = float(acc.get("balance", eq))
                open_count = len(mt5.positions_get() or ())

                out["equityLow"] = min(out["equityLow"], eq)
                out["openCountPeak"] = max(out["openCountPeak"], open_count)
                out["equityLast"] = eq
                out["balanceLast"] = bal
                # The floating rule starts at two positions, so a single runner
                # must never raise this mark -- the daily drawdown governs that
                # case, and letting one position fill the floating gauge is what
                # made it read 64% on an account with nothing open.
                if open_count >= 2:
                    out["floatingWorst"] = max(out["floatingWorst"], max(0.0, bal - eq))
                out["samples"] += 1
            except Exception as err:  # noqa: BLE001 - sampling is best-effort
                logger.debug(f"[MT5 Native] watch stopped early: {err}")
                break
            time.sleep(max(0.25, every))

        logger.info(
            f"[MT5 Native] Watch done: {out['samples']} samples, "
            f"low equity ${out['equityLow']:,.2f}"
        )
        return out

    def extract_sync(
        self,
        login: int | str,
        password: str,
        server: str = "MetaQuotes-Demo",
        days_back: int = 730,
        sample_seconds: float = 0.0,
        sample_every: float = 2.0
    ) -> Dict[str, Any]:
        """Synchronously connects to MT5, logs in, and extracts complete account and trade history."""
        try:
            import MetaTrader5 as mt5
        except ImportError:
            raise RuntimeError("MetaTrader5 python package is not installed.")

        login_id = int(str(login).strip())
        logger.info(f"[MT5 Native] Initializing desktop terminal for account #{login_id} on server '{server}'...")

        # 1. Close any previous open session
        try:
            mt5.shutdown()
        except Exception:
            pass

        # 2. Initialize Terminal
        init_kwargs: Dict[str, Any] = {"timeout": 30000, "portable": False}
        if self.terminal_path and os.path.isfile(self.terminal_path):
            init_kwargs["path"] = self.terminal_path

        if not mt5.initialize(**init_kwargs):
            err = mt5.last_error()
            # Try initializing without specific path if path failed
            if "path" in init_kwargs:
                init_kwargs.pop("path")
                if not mt5.initialize(**init_kwargs):
                    raise RuntimeError(f"MT5 terminal initialization failed: {err}")
            else:
                raise RuntimeError(f"MT5 terminal initialization failed: {err}")

        try:
            # 3. Log In to Account
            logger.info(f"[MT5 Native] Logging into account #{login_id}...")
            login_success = mt5.login(
                login=login_id,
                password=password,
                server=server,
                timeout=30000
            )

            if not login_success:
                err = mt5.last_error()
                raise RuntimeError(f"MT5 login failed for account #{login_id} on {server}: {err}")

            time.sleep(1.0)

            # 4. Extract Account Information
            account = mt5.account_info()
            if account is None:
                err = mt5.last_error()
                raise RuntimeError(f"Failed to read MT5 account information: {err}")

            acc_dict = account._asdict()
            balance = float(acc_dict.get("balance", 0.0))
            equity = float(acc_dict.get("equity", balance))
            margin = float(acc_dict.get("margin", 0.0))
            free_margin = float(acc_dict.get("margin_free", balance))
            margin_level = float(acc_dict.get("margin_level", 0.0))
            credit = float(acc_dict.get("credit", 0.0))
            profit_floating = float(acc_dict.get("profit", equity - balance))
            currency = str(acc_dict.get("currency", "USD"))
            trader_name = str(acc_dict.get("name", f"تریدر #{login_id}"))
            company = str(acc_dict.get("company", "MetaQuotes"))
            server_name = str(acc_dict.get("server", server))

            logger.info(f"[MT5 Native] Account #{login_id} connected: Balance=${balance:,.2f}, Equity=${equity:,.2f}")

            # 5. Extract Open Live Positions
            open_trades: List[Dict[str, Any]] = []
            positions = mt5.positions_get()
            if positions:
                for pos in positions:
                    p = pos._asdict()
                    pos_type = "buy" if p.get("type") == 0 else "sell"
                    open_time_dt = _utc(p.get("time", time.time()))
                    # MT5 reports position.profit without swap. An overnight
                    # position can carry a meaningful negative swap that the
                    # floating-risk rule must see, so it is folded in here.
                    pos_net = float(p.get("profit", 0.0)) + float(p.get("swap", 0.0))
                    open_trades.append({
                        "ticket": str(p.get("ticket", "")),
                        "symbol": str(p.get("symbol", "")),
                        "type": pos_type,
                        "volume": float(p.get("volume", 0.01)),
                        "openPrice": float(p.get("price_open", 0.0)),
                        "currentPrice": float(p.get("price_current", 0.0)),
                        "stopLoss": float(p.get("sl", 0.0)),
                        "takeProfit": float(p.get("tp", 0.0)),
                        "profit": pos_net,
                        "grossProfit": float(p.get("profit", 0.0)),
                        "swap": float(p.get("swap", 0.0)),
                        "openTime": _iso(open_time_dt),
                        "comment": str(p.get("comment", ""))
                    })

            # 6. Extract Complete Deals History
            from_date = datetime(2000, 1, 1)
            to_date = datetime.now() + timedelta(days=7)
            deals = mt5.history_deals_get(from_date, to_date, group="*")
            orders = mt5.history_orders_get(from_date, to_date, group="*")

            orders_map: Dict[int, Any] = {}
            if orders:
                for o in orders:
                    od = o._asdict()
                    orders_map[od.get("ticket")] = od
                    if od.get("position_id"):
                        orders_map[od.get("position_id")] = od

            total_deposit = 0.0
            total_withdrawal = 0.0
            total_swap = 0.0
            total_commission = 0.0
            closed_trades: List[Dict[str, Any]] = []

            # Group deals by position_id to match entry & exit
            position_deals: Dict[int, List[Dict[str, Any]]] = {}

            if deals:
                for d in deals:
                    deal = d._asdict()
                    deal_type = deal.get("type")  # 0=BUY, 1=SELL, 2=BALANCE, 3=CREDIT
                    entry = deal.get("entry")      # 0=IN, 1=OUT, 2=INOUT, 3=OUT_BY
                    pnl = float(deal.get("profit", 0.0))
                    comm = float(deal.get("commission", 0.0))
                    swp = float(deal.get("swap", 0.0))
                    fee = float(deal.get("fee", 0.0))

                    total_swap += swp
                    total_commission += comm

                    # Check for Balance Deposit / Withdrawal
                    if deal_type == 2 or str(deal.get("symbol", "")).strip() == "":
                        if pnl >= 0:
                            total_deposit += pnl
                        else:
                            total_withdrawal += abs(pnl)
                        continue

                    # Group trading deals by position_id
                    pos_id = deal.get("position_id")
                    if pos_id:
                        if pos_id not in position_deals:
                            position_deals[pos_id] = []
                        position_deals[pos_id].append(deal)
                    else:
                        # Standalone deal
                        deal_time = _utc(deal.get("time", 0))
                        time_str = _iso(deal_time)
                        closed_trades.append({
                            "ticket": str(deal.get("ticket", "")),
                            "symbol": str(deal.get("symbol", "XAUUSD")),
                            "type": "buy" if deal_type == 0 else "sell",
                            "volume": float(deal.get("volume", 0.01)),
                            "open_price": float(deal.get("price", 0.0)),
                            "close_price": float(deal.get("price", 0.0)),
                            "open_time": time_str,
                            "close_time": time_str,
                            "duration_seconds": 0,
                            "stop_loss": 0.0,
                            "take_profit": 0.0,
                            "commission": comm,
                            "swap": swp,
                            # Net of costs. See the note on paired positions.
                            "profit": round(pnl + comm + swp + fee, 2),
                            "grossProfit": round(pnl, 2),
                            "close_by_sl": False,
                            "close_by_tp": False,
                        })

            # Process paired position deals.
            #
            # One record per EXIT deal, not one per position. A position closed
            # in several parts produces several exits, and collapsing them into a
            # single "trade" spanning first entry to last exit hid every partial
            # close from the minimum-hold rule: a trader could hold one position
            # for two hours while taking ten sub-second partials out of it and
            # never register a single short trade. Each exit is now measured from
            # the entry that was open when it happened.
            for pos_id, d_list in position_deals.items():
                d_list.sort(key=lambda x: x.get("time", 0))
                entries = [d for d in d_list if d.get("entry") == 0]
                exits = [d for d in d_list if d.get("entry") in (1, 2, 3)]
                if not entries:
                    entries = [d_list[0]]
                if not exits:
                    continue  # still open -- reported as a live position instead

                entry_deal = entries[0]
                open_dt = _utc(entry_deal.get("time", 0))
                pos_type = "buy" if entry_deal.get("type") == 0 else "sell"
                sym = str(entry_deal.get("symbol") or exits[-1].get("symbol") or "XAUUSD")

                related_order = orders_map.get(pos_id, {})
                sl = float(related_order.get("sl", 0.0) if related_order else 0.0)
                tp = float(related_order.get("tp", 0.0) if related_order else 0.0)

                for idx, exit_deal in enumerate(exits):
                    close_dt = _utc(exit_deal.get("time", entry_deal.get("time", 0)))
                    duration_sec = max(0, int((close_dt - open_dt).total_seconds()))

                    pnl = float(exit_deal.get("profit", 0.0))
                    comm = float(exit_deal.get("commission", 0.0))
                    swp = float(exit_deal.get("swap", 0.0))
                    fee = float(exit_deal.get("fee", 0.0))
                    # The entry's own costs belong to the first exit. Splitting
                    # them across partials would need a volume weighting the
                    # broker does not report, and attaching them all to the first
                    # close keeps the account total exact either way.
                    if idx == 0:
                        comm += sum(float(d.get("commission", 0.0)) for d in entries)
                        swp += sum(float(d.get("swap", 0.0)) for d in entries)
                        fee += sum(float(d.get("fee", 0.0)) for d in entries)

                    # Net, not gross. MT5 keeps commission and swap in separate
                    # fields; sending only `profit` understated every loss and
                    # overstated every win by the entire cost of trading, so both
                    # the drawdown and the profit target were being measured
                    # against money the trader never actually had.
                    net = round(pnl + comm + swp + fee, 2)

                    reason = exit_deal.get("reason", 0)
                    comment = str(exit_deal.get("comment", "")).lower()
                    close_by_sl = (reason == 3 or "sl" in comment or "[sl]" in comment)
                    close_by_tp = (reason == 4 or "tp" in comment or "[tp]" in comment)

                    close_price = float(exit_deal.get("price", 0.0))
                    if not close_by_sl and sl > 0 and abs(close_price - sl) <= 0.05 and net < 0:
                        close_by_sl = True
                    if not close_by_tp and tp > 0 and abs(close_price - tp) <= 0.05 and net > 0:
                        close_by_tp = True

                    closed_trades.append({
                        # The exit deal's own ticket, so each partial is a
                        # distinct row the platform can key on. Using the position
                        # id for all of them made every partial collide on the
                        # same unique external id, and all but one vanished.
                        "ticket": str(exit_deal.get("ticket") or "{0}-{1}".format(pos_id, idx)),
                        "positionId": str(pos_id),
                        "symbol": sym,
                        "type": pos_type,
                        "volume": float(exit_deal.get("volume", entry_deal.get("volume", 0.01))),
                        "open_price": float(entry_deal.get("price", 0.0)),
                        "close_price": close_price,
                        "open_time": _iso(open_dt),
                        "close_time": _iso(close_dt),
                        "duration_seconds": duration_sec,
                        "stop_loss": sl,
                        "take_profit": tp,
                        "commission": round(comm, 2),
                        "swap": round(swp, 2),
                        "profit": net,
                        "grossProfit": round(pnl, 2),
                        "close_by_sl": close_by_sl,
                        "close_by_tp": close_by_tp,
                        "comment": comment
                    })

            # Sort closed trades chronologically
            closed_trades.sort(key=lambda t: t.get("close_time", ""))

            # Calculate total realized profit
            total_realized_profit = round(sum(float(t.get("profit", 0.0)) for t in closed_trades), 2)
            if total_deposit == 0.0:
                total_deposit = max(balance - total_realized_profit, 10000.0)

            logger.info(f"[MT5 Native] Extracted {len(closed_trades)} closed trades, {len(open_trades)} open positions.")

            # Watch the account for a while before letting go of the session.
            #
            # Everything above is a single instant. The rules are written against
            # the worst moment an account reached, so without this the engine
            # only ever saw equity at push time: a position that ran deep into
            # the red and recovered before the next cycle left no trace, and a
            # daily-drawdown breach that came back was never recorded at all.
            watch = self._watch(mt5, balance, equity, sample_seconds, sample_every)
            equity = watch.get("equityLast", equity)
            balance = watch.get("balanceLast", balance)

            summary_data = {
                "equity": equity,
                "balance": balance,
                # Worst points seen during the watch window, for the platform's
                # high-water marks.
                "equityLow": watch["equityLow"],
                "floatingWorst": watch["floatingWorst"],
                "openCountPeak": watch["openCountPeak"],
                "free_margin": free_margin,
                "margin": margin,
                "margin_level": f"{margin_level:.2f}%" if margin_level else "0.00%",
                "profit": total_realized_profit,
                "floating_profit": profit_floating,
                "deposit": total_deposit,
                "withdrawal": total_withdrawal,
                "credit": credit,
                "swap": round(total_swap, 2),
                "currency": currency,
                "trader_name": trader_name,
                "company": company,
                "server": server_name,
                "source": "mt5_native",
                "extracted_at": datetime.now(timezone.utc).isoformat()
            }

            analytics = compute_trade_analytics(closed_trades, summary_data)

            return {
                "trades": closed_trades,
                "open_trades": open_trades,
                "summary": summary_data,
                "analytics": analytics
            }

        finally:
            try:
                mt5.shutdown()
                logger.info("[MT5 Native] Connection closed cleanly.")
            except Exception:
                pass

    async def extract_async(
        self,
        login: int | str,
        password: str,
        server: str = "MetaQuotes-Demo",
        progress_callback: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
    ) -> Dict[str, Any]:
        """Asynchronously extracts account metrics in a background worker thread."""
        if progress_callback:
            await progress_callback({
                "type": "native_mt5_start",
                "message": f"اتصال مستقیم و پرسرعت به ترمینال MetaTrader 5 برای حساب #{login}...",
                "progressPct": 20
            })

        def _worker():
            return self.extract_sync(login=login, password=password, server=server)

        data = await asyncio.to_thread(_worker)

        if progress_callback:
            await progress_callback({
                "type": "native_mt5_success",
                "message": f"استخراج مستقیم {len(data.get('trades', []))} معامله از MT5 با موفقیت انجام شد.",
                "progressPct": 90
            })

        return data
