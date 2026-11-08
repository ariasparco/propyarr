"""Central configuration and logging setups for MetaTrader Automation."""

import logging
import sys
import io

# Ensure UTF-8 output encoding for Windows terminals
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Configure standard formal logging
LOG_FORMAT = '%(asctime)s [%(levelname)s] %(message)s'
LOG_DATEFMT = '%Y-%m-%d %H:%M:%S'

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATEFMT))

logger = logging.getLogger("MT5WebTerminal")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(handler)

METATRADER_WEB_URL = "https://web.metatrader.app/terminal"
DEFAULT_NAVIGATION_TIMEOUT_MS = 60000
DEFAULT_SELECTOR_TIMEOUT_MS = 30000
WORKSPACE_WAIT_TIMEOUT_MS = 45000
TAB_SWITCH_TIMEOUT_MS = 15000

# Browser launch arguments
CHROMIUM_ARGS = [
    "--start-maximized",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled"
]
