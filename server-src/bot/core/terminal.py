"""MetaTrader Web Terminal automation and session management."""

import asyncio
from typing import Optional
from playwright.async_api import Page, BrowserContext, async_playwright, Browser

from core.config import (
    logger,
    METATRADER_WEB_URL,
    DEFAULT_NAVIGATION_TIMEOUT_MS,
    WORKSPACE_WAIT_TIMEOUT_MS,
    TAB_SWITCH_TIMEOUT_MS
)


class TerminalController:
    """Manages browser lifecycle, login workflows, and navigation in MetaTrader Web."""

    def __init__(self, headless: bool = False):
        self.headless = headless
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None

    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        mode_str = "بی‌صدا در پس‌زمینه (Headless)" if self.headless else "پنجره فعال مانیتور (Visible Browser)"
        logger.info(f"🌐 در حال اجرای مرورگر کرومیوم متاتریدر در حالت {mode_str}...")
        
        launch_args = [
            "--start-maximized",
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage"
        ]

        try:
            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                channel="chrome",
                args=launch_args
            )
        except Exception:
            # Fallback to bundled chromium if chrome channel not found
            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                args=launch_args
            )

        self.context = await self.browser.new_context(no_viewport=True)
        self.page = await self.context.new_page()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        logger.info("🔒 جلسه کاری مرورگر متاتریدر با موفقیت بسته شد.")

    async def handle_cookie_and_popups(self) -> None:
        """Accepts cookies or dismisses welcome modal dialogues if present."""
        try:
            accept_btn = self.page.locator(
                'button:has-text("Accept"), button:has-text("Agree"), button:has-text("Accept all"), .accept-cookies'
            )
            if await accept_btn.count() > 0 and await accept_btn.first.is_visible():
                await accept_btn.first.click()
                logger.info("✅ اعلان کوکی و قوانین تأیید شد.")
        except Exception as e:
            logger.debug(f"بررسی پاپ‌آپ: {e}")

    async def login(self, login_id: str, password: str, server: Optional[str] = None) -> bool:
        """Fills credentials and logs into MetaTrader Web Terminal."""
        try:
            logger.info(f"🚀 در حال اتصال به وب‌ترمینال متاتریدر ۵ ({METATRADER_WEB_URL})...")
            await self.page.goto(
                METATRADER_WEB_URL,
                wait_until="domcontentloaded",
                timeout=DEFAULT_NAVIGATION_TIMEOUT_MS
            )
            await self.handle_cookie_and_popups()

            logger.info("⏳ در حال انتظار برای لود شدن فرم ورود متاتریدر...")
            login_input = self.page.locator(
                'input[name="login"], input[type="text"]:visible, input[autocomplete="username"]'
            ).first
            password_input = self.page.locator(
                'input[name="password"], input[type="password"]:visible'
            ).first

            await login_input.wait_for(state="visible", timeout=30000)
            await password_input.wait_for(state="visible", timeout=30000)

            logger.info(f"🔑 ثبت شماره حساب: {login_id}")
            await login_input.fill(str(login_id))
            await password_input.fill(str(password))

            if server:
                logger.info(f"🏢 انتخاب سرور بروکر: {server}")
                server_input = self.page.locator('input[name="server"], input[placeholder*="Server" i]:visible').first
                if await server_input.count() > 0 and await server_input.is_visible():
                    await server_input.fill(server)
                    await self.page.keyboard.press("Enter")

            logger.info("📤 ارسال فرم ورود و اتصال به سرور متاتریدر...")
            connect_btn = self.page.locator(
                'button[type="submit"], button:has-text("Connect to account"), button:has-text("OK"), button:has-text("Login")'
            ).first
            await connect_btn.click()

            # Check for immediate errors on modal
            await asyncio.sleep(2.0)
            error_msg = self.page.locator('.error, .alert, .message-box, [class*="error" i]').first
            if await error_msg.count() > 0 and await error_msg.is_visible():
                err_text = await error_msg.inner_text()
                if err_text and len(err_text.strip()) > 0:
                    logger.warning(f"⚠️ پیام سرور متاتریدر: {err_text}")

            logger.info("⏳ در حال دریافت جریان داده‌های حساب (Trades/Equity)...")
            await self.page.wait_for_selector(
                'div.icon-button[title="Trade"], [title="Trade"], .table, .tbody',
                timeout=35000
            )
            await asyncio.sleep(3.0)

            logger.info("🎉 ورود به متاتریدر با موفقیت انجام شد و فضای کاری بارگذاری شد.")
            return True

        except Exception as e:
            logger.error(f"❌ خطا در احراز هویت یا تایم‌اوت ورود به متاتریدر: {e}")
            return False

    async def switch_tab(self, tab_name: str) -> bool:
        """Switches to a specific tab (e.g. 'Trade', 'History', 'Journal')."""
        try:
            logger.info(f"📑 تغییر به تب {tab_name}...")
            tab_btn = self.page.locator(
                f'[title="{tab_name}" i], div.icon-button[title="{tab_name}" i], button:has-text("{tab_name}")'
            ).first
            await tab_btn.wait_for(state="visible", timeout=TAB_SWITCH_TIMEOUT_MS)

            is_active = await tab_btn.evaluate(
                "el => el.classList.contains('checked') || el.classList.contains('active')"
            )
            if not is_active:
                await tab_btn.click()
                await asyncio.sleep(2.5)

            logger.info(f"✅ تب {tab_name} فعال شد.")
            return True

        except Exception as e:
            logger.error(f"❌ خطا در جابجایی به تب {tab_name}: {e}")
            return False

    async def set_history_period_all(self) -> bool:
        """Configures history period to 'All history' to load entire lifetime trades."""
        try:
            logger.info("📅 تنظیم بازه تاریخچه معاملات روی تمام دوران (All History)...")
            history_btn = self.page.locator(
                'button:has-text("All history"), div:has-text("All history"), [title*="All history" i]'
            ).first

            if await history_btn.count() > 0 and await history_btn.is_visible():
                await history_btn.click()
                await asyncio.sleep(2.0)
                logger.info("✅ فیلتر بازه تاریخچه روی All History تنظیم شد.")
                return True

            logger.info("اطلاعات تاریخچه به صورت کامل پیش‌فرض فعال است.")
            return True
        except Exception as e:
            logger.warning(f"⚠️ عدم نیاز به تغییر فیلتر تاریخچه: {e}")
            return False
