"""JSON report exporter with detailed performance statistics."""

import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from core.config import logger


def to_float(val, default: float = 0.0) -> float:
    """Safely converts string or raw value to float."""
    try:
        if val is None or val == "" or val == "-":
            return default
        cleaned = str(val).replace(" ", "").replace("\u00a0", "").replace(",", "")
        return float(cleaned)
    except Exception:
        return default


def compute_trade_analytics(trades: List[Dict[str, Any]], summary: Dict[str, Any]) -> Dict[str, Any]:
    """Calculates comprehensive trading analytics including win rate, profit factor, and volume."""
    total_trades = len(trades)
    winning_trades = 0
    losing_trades = 0
    breakeven_trades = 0
    gross_profit = 0.0
    gross_loss = 0.0
    total_volume = 0.0
    buy_count = 0
    sell_count = 0

    for t in trades:
        pnl = to_float(t.get("profit", 0.0))
        vol = to_float(t.get("volume", 0.0))
        total_volume += vol

        ttype = str(t.get("type", "")).lower()
        if "buy" in ttype:
            buy_count += 1
        elif "sell" in ttype:
            sell_count += 1

        if pnl > 0:
            winning_trades += 1
            gross_profit += pnl
        elif pnl < 0:
            losing_trades += 1
            gross_loss += abs(pnl)
        else:
            breakeven_trades += 1

    win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 1.0)

    deposit = to_float(summary.get("deposit", 0.0))
    balance = to_float(summary.get("balance", 0.0))
    equity = to_float(summary.get("equity", balance))
    net_profit = to_float(summary.get("profit", 0.0))

    return {
        "total_trades": total_trades,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "breakeven_trades": breakeven_trades,
        "win_rate_pct": round(win_rate, 2),
        "loss_rate_pct": round(100 - win_rate, 2) if total_trades > 0 else 0.0,
        "buy_trades": buy_count,
        "sell_trades": sell_count,
        "total_volume": round(total_volume, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
        "profit_factor": round(profit_factor, 2),
        "net_profit": round(net_profit, 2),
        "starting_deposit": round(deposit, 2),
        "current_balance": round(balance, 2),
        "current_equity": round(equity, 2)
    }


def save_json_report(history_data: Dict[str, Any], account_id: str, output_path: str = None) -> str:
    """Exports structured metrics, deals, statistics, and account status to a JSON file."""
    trades = history_data.get("trades", [])
    summary = history_data.get("summary", {})
    timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    analytics = compute_trade_analytics(trades, summary)

    filename = output_path or f"history_{account_id}.json"
    
    payload = {
        "account_id": str(account_id),
        "extracted_at": timestamp_str,
        "summary": summary,
        "analytics": analytics,
        "total_trades": len(trades),
        "trades": trades
    }

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=4)

    logger.info(f"💾 JSON report saved: {filename}")
    return filename
