"""
Prop Firm MetaTrader 5 Bridge Agent.
Integrates Playwright Web Terminal automation and Native MT5 Desktop extraction
to continuously synchronize accounts with the Propino Next.js platform.
"""

import os
import sys
import json
import time
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional, Set

import requests

# Add bot root to Python path
BOT_DIR = Path(__file__).resolve().parent
if str(BOT_DIR) not in sys.path:
    sys.path.insert(0, str(BOT_DIR))

from core.config import logger
from core.terminal import TerminalController
from core.extractor import AccountExtractor
from core.mt5_extractor import MT5NativeExtractor
from reporters.json_reporter import to_float


# Windows UTF-8 stdout encoding protection
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

CONFIG_PATH = BOT_DIR.parent / "agent" / "config.json"
LOCAL_CONFIG_PATH = BOT_DIR / "config.json"


def load_config() -> Dict[str, Any]:
    """Loads agent configuration from agent/config.json or bot/config.json or env vars."""
    cfg = {}
    
    target_file = CONFIG_PATH if CONFIG_PATH.exists() else (LOCAL_CONFIG_PATH if LOCAL_CONFIG_PATH.exists() else None)
    if target_file and target_file.exists():
        try:
            with open(target_file, "r", encoding="utf-8-sig") as f:
                cfg = json.load(f)
        except Exception as e:
            logger.warning(f"Error loading config file: {e}")

    site_url = os.environ.get("NEXT_PUBLIC_SITE_URL") or os.environ.get("SITE_URL") or cfg.get("siteUrl") or "http://127.0.0.1:3000"
    bridge_secret = os.environ.get("BRIDGE_SECRET") or cfg.get("bridgeSecret") or "cTPtE4vx4LNMfRbR/3QE3QSmvK9d/ITorq74CGujYko="
    interval = int(os.environ.get("AGENT_INTERVAL_SECONDS") or cfg.get("intervalSeconds") or 120)
    history_days = int(cfg.get("historyDays") or 60)
    headless = str(os.environ.get("AGENT_HEADLESS", cfg.get("headless", "true"))).lower() in ["1", "true", "yes"]

    return {
        "siteUrl": site_url.rstrip("/"),
        "bridgeSecret": bridge_secret,
        "intervalSeconds": interval,
        "historyDays": history_days,
        "headless": headless,
        "accounts": cfg.get("accounts", [])
    }


def to_iso_utc(dt_val: Any) -> str:
    """Formats datetime or timestamp to strict ISO 8601 UTC string (ending in Z)."""
    if not dt_val:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    
    if isinstance(dt_val, (int, float)):
        return datetime.fromtimestamp(dt_val, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    
    if isinstance(dt_val, datetime):
        if dt_val.tzinfo is None:
            dt_val = dt_val.replace(tzinfo=timezone.utc)
        return dt_val.isoformat().replace("+00:00", "Z")

    s = str(dt_val).strip()
    # Try parsing common MetaTrader format: "2026.08.20 14:30:00"
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
            return parsed.isoformat().replace("+00:00", "Z")
        except ValueError:
            pass

    try:
        parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return parsed.isoformat().replace("+00:00", "Z")
    except Exception:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_roster(site_url: str, bridge_secret: str) -> List[Dict[str, Any]]:
    """Queries Next.js platform for active accounts to monitor."""
    try:
        url = f"{site_url.rstrip('/')}/api/bridge/roster"
        res = requests.get(
            url,
            headers={"Authorization": f"Bearer {bridge_secret}"},
            timeout=20
        )
        res.raise_for_status()
        return res.json().get("accounts", [])
    except Exception as e:
        logger.warning(f"Could not fetch roster from {site_url}: {e}")
        return []


def push_snapshots(site_url: str, bridge_secret: str, payload: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pushes extracted account snapshots to the Next.js platform bridge endpoint."""
    if not payload:
        return {"received": 0, "results": []}

    url = f"{site_url.rstrip('/')}/api/bridge/accounts"
    logger.info(f"Pushing {len(payload)} account snapshot(s) to {url}...")
    
    res = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {bridge_secret}",
            "Content-Type": "application/json"
        },
        json={"accounts": payload},
        timeout=60
    )
    res.raise_for_status()
    result = res.json()
    logger.info(f"Successfully pushed {result.get('received', len(payload))} account(s) to bridge.")
    return result


async def extract_account_web(
    login: str,
    password: str,
    server: str = "MetaQuotes-Demo",
    headless: bool = True
) -> Optional[Dict[str, Any]]:
    """Extracts live account state & deals using Playwright Web Terminal automation."""
    login_id = str(login).strip()
    logger.info(f"🌐 [Web Extractor] Starting browser session for account #{login_id}...")

    async with TerminalController(headless=headless) as terminal:
        logged_in = await terminal.login(login_id, password, server)
        if not logged_in:
            logger.error(f"❌ [Web Extractor] Login failed for account #{login_id}")
            return None

        extractor = AccountExtractor(terminal)
        
        # 1. Read live metrics
        live_metrics = await extractor.extract_live_metrics()
        
        # 2. Switch to History tab and extract closed deals
        history_data = await extractor.extract_complete_history()

        balance = to_float(live_metrics.get("balance", history_data.get("summary", {}).get("balance", 0.0)))
        equity = to_float(live_metrics.get("equity", history_data.get("summary", {}).get("equity", balance)))
        
        # Extract open positions if available in live_metrics or history_data
        positions_raw = live_metrics.get("positions", [])
        positions = []
        for p in positions_raw:
            positions.append({
                "symbol": str(p.get("symbol", "XAUUSD")),
                "profit": to_float(p.get("profit", 0.0)),
                "lot": to_float(p.get("lot") or p.get("volume") or 0.01),
                "openedAt": to_iso_utc(p.get("openedAt") or p.get("openTime"))
            })

        # Format deals
        deals_raw = history_data.get("trades", [])
        deals = []
        for d in deals_raw:
            open_time_str = d.get("open_time") or d.get("openTime") or d.get("openedAt")
            close_time_str = d.get("close_time") or d.get("closeTime") or d.get("closedAt")
            
            deals.append({
                "ticket": str(d.get("ticket", "")),
                "symbol": str(d.get("symbol", "XAUUSD")),
                "type": "SELL" if str(d.get("type", "")).upper() in ["SELL", "1"] else "BUY",
                "lot": to_float(d.get("volume") or d.get("lot") or 0.01),
                "profit": to_float(d.get("profit", 0.0)),
                "openPrice": to_float(d.get("open_price") or d.get("openPrice") or 0.0),
                "closePrice": to_float(d.get("close_price") or d.get("closePrice") or 0.0),
                "openedAt": to_iso_utc(open_time_str),
                "closedAt": to_iso_utc(close_time_str)
            })

        logger.info(f"✅ [Web Extractor] Account #{login_id}: Balance=${balance:,.2f}, Equity=${equity:,.2f}, {len(deals)} deals.")
        
        return {
            "accountNumber": str(login_id),
            "balance": balance,
            "equity": equity,
            "equityLow": equity,
            "floatingWorst": max(0.0, balance - equity) if len(positions) >= 2 else 0.0,
            "positions": positions,
            "deals": deals
        }


def extract_account_native(
    login: str,
    password: str,
    server: str = "MetaQuotes-Demo"
) -> Optional[Dict[str, Any]]:
    """Extracts live account state & deals using Native MetaTrader 5 Python API."""
    try:
        extractor = MT5NativeExtractor()
        data = extractor.extract_sync(login=login, password=password, server=server)
        
        summary = data.get("summary", {})
        balance = to_float(summary.get("balance", 0.0))
        equity = to_float(summary.get("equity", balance))
        
        positions = []
        for p in data.get("open_trades", []):
            positions.append({
                "symbol": str(p.get("symbol", "XAUUSD")),
                "profit": to_float(p.get("profit", 0.0)),
                "lot": to_float(p.get("volume", 0.01)),
                "openedAt": to_iso_utc(p.get("openTime"))
            })

        deals = []
        for d in data.get("trades", []):
            deals.append({
                "ticket": str(d.get("ticket", "")),
                "symbol": str(d.get("symbol", "XAUUSD")),
                "type": "SELL" if str(d.get("type", "")).upper() in ["SELL", "1"] else "BUY",
                "lot": to_float(d.get("volume", 0.01)),
                "profit": to_float(d.get("profit", 0.0)),
                "openPrice": to_float(d.get("openPrice", 0.0)),
                "closePrice": to_float(d.get("closePrice", 0.0)),
                "openedAt": to_iso_utc(d.get("openTime")),
                "closedAt": to_iso_utc(d.get("closeTime"))
            })

        return {
            "accountNumber": str(login),
            "balance": balance,
            "equity": equity,
            "equityLow": equity,
            "floatingWorst": max(0.0, balance - equity) if len(positions) >= 2 else 0.0,
            "positions": positions,
            "deals": deals
        }
    except Exception as e:
        logger.debug(f"[Native Extractor] Could not extract natively: {e}")
        return None


async def sync_single_account(
    account_number: str,
    password: str,
    server: str = "MetaQuotes-Demo",
    site_url: Optional[str] = None,
    bridge_secret: Optional[str] = None,
    headless: bool = True
) -> Optional[Dict[str, Any]]:
    """Extracts a single account and pushes it to Next.js platform."""
    cfg = load_config()
    target_url = site_url or cfg["siteUrl"]
    target_secret = bridge_secret or cfg["bridgeSecret"]

    logger.info(f"🔄 Starting live sync for account #{account_number}...")

    # 1. Try Native MT5 extractor first for speed
    snapshot = extract_account_native(login=account_number, password=password, server=server)

    # 2. Fall back to Playwright Web Terminal
    if not snapshot:
        logger.info(f"Desktop MT5 not available, running Web Terminal automation for #{account_number}...")
        snapshot = await extract_account_web(
            login=account_number,
            password=password,
            server=server,
            headless=headless
        )

    if snapshot:
        try:
            push_snapshots(target_url, target_secret, [snapshot])
        except Exception as push_err:
            logger.warning(f"Push to bridge returned notice: {push_err}")
        return snapshot

    logger.error(f"❌ Failed to extract account #{account_number} with both extractors.")
    return None


async def run_sync_cycle(cfg: Dict[str, Any]) -> int:
    """Executes a full synchronization cycle across all active roster accounts."""
    site_url = cfg["siteUrl"]
    bridge_secret = cfg["bridgeSecret"]
    headless = cfg.get("headless", True)

    logger.info(f"=== Starting Sync Cycle at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===")
    
    roster = fetch_roster(site_url, bridge_secret)
    if not roster:
        # Fall back to local accounts in config if roster is empty
        roster = cfg.get("accounts", [])

    if not roster:
        logger.info("No active accounts found in roster to sync.")
        return 0

    logger.info(f"Found {len(roster)} account(s) to sync.")
    snapshots = []

    for entry in roster:
        acc_num = str(entry.get("accountNumber") or entry.get("login") or "")
        password = entry.get("password")
        server = entry.get("server") or "MetaQuotes-Demo"

        if not acc_num or not password or password == "••••••••":
            logger.warning(f"Skipping #{acc_num}: Missing password in roster.")
            continue

        try:
            # 1. Try native
            snap = extract_account_native(login=acc_num, password=password, server=server)
            # 2. Try web
            if not snap:
                snap = await extract_account_web(login=acc_num, password=password, server=server, headless=headless)

            if snap:
                snapshots.append(snap)
        except Exception as acc_err:
            logger.error(f"Error syncing account #{acc_num}: {acc_err}")

    if snapshots:
        try:
            push_snapshots(site_url, bridge_secret, snapshots)
            logger.info(f"✅ Successfully synced and pushed {len(snapshots)} account(s).")
        except Exception as e:
            logger.error(f"Error pushing snapshots to bridge: {e}")

    return len(snapshots)


async def main():
    """Main continuous agent loop."""
    cfg = load_config()
    interval = cfg.get("intervalSeconds", 120)

    logger.info("=" * 70)
    logger.info("🚀 Propino MetaTrader 5 Bridge Agent is starting...")
    logger.info(f"🔗 Target Site: {cfg['siteUrl']}")
    logger.info(f"⏱️ Sync Interval: {interval} seconds")
    logger.info(f"🖥️ Mode: {'Headless Web Terminal' if cfg.get('headless', True) else 'Visible Browser'}")
    logger.info("=" * 70)

    # Initial cycle
    await run_sync_cycle(cfg)

    while True:
        try:
            await asyncio.sleep(interval)
            await run_sync_cycle(cfg)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Unexpected error in agent loop: {e}")
            await asyncio.sleep(15)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Agent stopped by user.")
