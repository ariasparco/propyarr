"""
MT5 Terminal Bridge Agent (Upgraded Hybrid Engine).
Supports both direct MetaTrader 5 Python integration and Playwright Web Terminal extraction.
Automatically falls back to Web Terminal if Desktop terminal is not running or on non-Windows environments.
"""

import os
import sys
import asyncio
from pathlib import Path

# Add project root and bot folder to path
HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent
BOT_DIR = PROJECT_ROOT / "bot"

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BOT_DIR) not in sys.path:
    sys.path.insert(0, str(BOT_DIR))

# Import the new robust bridge agent implementation
from bot.bridge_agent import main as run_bridge_agent, load_config, sync_single_account, sync_all_accounts

if __name__ == "__main__":
    try:
        asyncio.run(run_bridge_agent())
    except KeyboardInterrupt:
        print("\nAgent stopped by user.")
