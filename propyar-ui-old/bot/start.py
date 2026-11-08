"""Main application entry point supporting both Web Panel API Server and CLI extraction."""

import asyncio
import sys
import uvicorn
from typing import Optional

from core.config import logger
from core.terminal import TerminalController
from core.extractor import AccountExtractor
from reporters import save_json_report, save_html_report


async def run_pipeline(
    login_id: str,
    password: str,
    server: Optional[str] = None,
    headless: bool = False
) -> bool:
    """Orchestrates authentication, live metric extraction, history harvesting, and report generation via CLI."""
    async with TerminalController(headless=headless) as terminal:
        # 1. Login to terminal
        logged_in = await terminal.login(login_id, password, server)
        if not logged_in:
            logger.error("Session terminated due to login failure.")
            return False

        # 2. Extract metrics and trading history
        extractor = AccountExtractor(terminal)
        logger.info("Fetching complete all-time history & account metrics...")
        history_data = await extractor.extract_complete_history()

        # 3. Export reports (JSON + HTML)
        save_json_report(history_data, account_id=str(login_id))
        save_html_report(history_data, account_id=str(login_id))

        # 4. Return to Trade tab cleanly
        await terminal.switch_tab("Trade")
        logger.info("Operation completed successfully.")
        return True


def start_server(host: str = "127.0.0.1", port: int = 8000):
    """Starts the FastAPI Web Dashboard & REST API server."""
    logger.info("=" * 70)
    logger.info(f"🚀 MetaTrader Web Dashboard is running at: http://{host}:{port}")
    logger.info(f"📚 Interactive REST API Documentation: http://{host}:{port}/docs")
    logger.info("=" * 70)
    uvicorn.run("api.app:app", host=host, port=port, reload=False, log_level="info")


def main():
    """Parses CLI arguments or starts the web server."""
    args = sys.argv[1:]

    # If --server or no args or -s is passed, run the Web UI Server
    if not args or args[0] in ["--server", "-s", "server", "web"]:
        start_server(host="127.0.0.1", port=8000)
        return

    # Otherwise run direct CLI extraction
    account_login = args[0] if len(args) > 0 else "5054534737"
    account_password = args[1] if len(args) > 1 else "YOUR_ACCOUNT_PASSWORD"
    account_server = args[2] if len(args) > 2 else "MetaQuotes-Demo"

    try:
        asyncio.run(run_pipeline(
            login_id=account_login,
            password=account_password,
            server=account_server,
            headless=False
        ))
    except KeyboardInterrupt:
        logger.info("Execution stopped manually by user.")


if __name__ == "__main__":
    main()