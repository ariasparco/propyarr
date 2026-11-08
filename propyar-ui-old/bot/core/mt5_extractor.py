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

    def extract_sync(
        self,
        login: int | str,
        password: str,
        server: str = "MetaQuotes-Demo",
        days_back: int = 730
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
                    open_time_dt = datetime.fromtimestamp(p.get("time", time.time()))
                    open_trades.append({
                        "ticket": str(p.get("ticket", "")),
                        "symbol": str(p.get("symbol", "")),
                        "type": pos_type,
                        "volume": float(p.get("volume", 0.01)),
                        "openPrice": float(p.get("price_open", 0.0)),
                        "currentPrice": float(p.get("price_current", 0.0)),
                        "stopLoss": float(p.get("sl", 0.0)),
                        "takeProfit": float(p.get("tp", 0.0)),
                        "profit": float(p.get("profit", 0.0)),
                        "swap": float(p.get("swap", 0.0)),
                        "openTime": open_time_dt.strftime("%Y.%m.%d %H:%M:%S"),
                        "comment": str(p.get("comment", ""))
                    })

            # 6. Extract Complete Deals History
            from_date = datetime(2000, 1, 1)
            to_date = datetime.now() + timedelta(days=2)
            deals = mt5.history_deals_get(from_date, to_date)
            orders = mt5.history_orders_get(from_date, to_date)

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
                        deal_time = datetime.fromtimestamp(deal.get("time", 0))
                        time_str = deal_time.strftime("%Y.%m.%d %H:%M:%S")
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
                            "profit": pnl,
                            "close_by_sl": False,
                            "close_by_tp": False,
                        })

            # Process paired position deals
            for pos_id, d_list in position_deals.items():
                # Sort deals by time
                d_list.sort(key=lambda x: x.get("time", 0))
                entry_deal = next((d for d in d_list if d.get("entry") == 0), d_list[0])
                exit_deal = next((d for d in reversed(d_list) if d.get("entry") in (1, 2, 3)), d_list[-1])

                open_dt = datetime.fromtimestamp(entry_deal.get("time", 0))
                close_dt = datetime.fromtimestamp(exit_deal.get("time", entry_deal.get("time", 0)))
                duration_sec = max(0, int((close_dt - open_dt).total_seconds()))

                pnl = sum(float(d.get("profit", 0.0)) for d in d_list)
                comm = sum(float(d.get("commission", 0.0)) for d in d_list)
                swp = sum(float(d.get("swap", 0.0)) for d in d_list)

                # Type is determined by entry deal
                pos_type = "buy" if entry_deal.get("type") == 0 else "sell"
                sym = str(entry_deal.get("symbol") or exit_deal.get("symbol") or "XAUUSD")

                # Get SL / TP from orders
                related_order = orders_map.get(pos_id, {})
                sl = float(related_order.get("sl", 0.0) if related_order else 0.0)
                tp = float(related_order.get("tp", 0.0) if related_order else 0.0)

                # Reason check (3=SL, 4=TP in MT5)
                reason = exit_deal.get("reason", 0)
                comment = str(exit_deal.get("comment", "")).lower()
                close_by_sl = (reason == 3 or "sl" in comment or "[sl]" in comment)
                close_by_tp = (reason == 4 or "tp" in comment or "[tp]" in comment)

                # Check if exit price reached SL/TP
                close_price = float(exit_deal.get("price", 0.0))
                if not close_by_sl and sl > 0 and abs(close_price - sl) <= 0.05 and pnl < 0:
                    close_by_sl = True
                if not close_by_tp and tp > 0 and abs(close_price - tp) <= 0.05 and pnl > 0:
                    close_by_tp = True

                closed_trades.append({
                    "ticket": str(pos_id),
                    "symbol": sym,
                    "type": pos_type,
                    "volume": float(entry_deal.get("volume", 0.01)),
                    "open_price": float(entry_deal.get("price", 0.0)),
                    "close_price": close_price,
                    "open_time": open_dt.strftime("%Y.%m.%d %H:%M:%S"),
                    "close_time": close_dt.strftime("%Y.%m.%d %H:%M:%S"),
                    "duration_seconds": duration_sec,
                    "stop_loss": sl,
                    "take_profit": tp,
                    "commission": comm,
                    "swap": swp,
                    "profit": round(pnl, 2),
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

            summary_data = {
                "equity": equity,
                "balance": balance,
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
