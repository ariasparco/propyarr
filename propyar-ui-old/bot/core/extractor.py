"""Extraction algorithms for live Trade metrics (Equity, Margin) and full trading History."""

import asyncio
from typing import Dict, Any
from playwright.async_api import Page

from core.config import logger
from core.terminal import TerminalController


class AccountExtractor:
    """Extracts live account status (Equity, Balance, Margin) and complete deal history."""

    def __init__(self, terminal: TerminalController):
        self.terminal = terminal
        self.page: Page = terminal.page

    async def extract_live_metrics(self) -> Dict[str, Any]:
        """Extracts Equity, Balance, Free Margin, and Margin from the active Trade tab."""
        logger.info("Reading live account metrics (Equity, Balance, Free Margin)...")
        # Ensure we are on the Trade tab
        await self.terminal.switch_tab("Trade")
        await asyncio.sleep(1.0)

        js_metrics = r"""
        () => {
            function extractMetric(text, label) {
                if (!text) return null;
                const regex = new RegExp(label + ":?\\s*([+\\-\\d\\s.,\\u00a0]+)", "i");
                const match = text.match(regex);
                if (!match || !match[1]) return null;
                const cleaned = match[1].replace(/[\s\u00a0]/g, "").replace(/,/g, "");
                return isNaN(parseFloat(cleaned)) ? null : cleaned;
            }

            const candidates = Array.from(document.querySelectorAll('.tbody .tr, .tr, .table, div, footer, span'));
            for (const el of candidates) {
                const txt = (el.innerText || '').replace(/\n+/g, ' ').trim();
                if (txt.includes('Balance:') && (txt.includes('Equity:') || txt.includes('Free margin:') || txt.includes('Margin:'))) {
                    let currency = "USD";
                    const curMatch = txt.match(/\b(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/i);
                    if (curMatch) currency = curMatch[1].toUpperCase();

                    return {
                        raw_trade: txt,
                        currency: currency,
                        balance: extractMetric(txt, 'Balance'),
                        equity: extractMetric(txt, 'Equity'),
                        margin: extractMetric(txt, 'Margin') || "0.00",
                        free_margin: extractMetric(txt, 'Free margin') || extractMetric(txt, 'Free Margin'),
                        margin_level: extractMetric(txt, 'Level') || extractMetric(txt, 'Margin level') || "0.00%",
                        profit: extractMetric(txt, 'Profit') || "0.00"
                    };
                }
            }
            return {};
        }
        """
        try:
            metrics = await self.page.evaluate(js_metrics)
            if metrics:
                logger.info(f"Live Metrics Captured -> Equity: ${metrics.get('equity')}, Balance: ${metrics.get('balance')}, Free Margin: ${metrics.get('free_margin')}")
            return metrics or {}
        except Exception as e:
            logger.warning(f"Failed to extract live metrics from Trade tab: {e}")
            return {}

    async def extract_complete_history(self) -> Dict[str, Any]:
        """Harvests all closed deals and history summary from the History tab."""
        # 1. First capture live metrics from Trade tab
        live_metrics = await self.extract_live_metrics()

        # 2. Switch to History tab
        await self.terminal.switch_tab("History")

        try:
            await self.page.wait_for_selector('.tbody, .table, tbody', timeout=15000)
            await asyncio.sleep(1.5)
        except Exception as e:
            logger.warning(f"Table body wait notice: {e}")

        logger.info("Extracting all-time history data...")

        js_extractor = r"""
        () => {
            return new Promise(async (resolve) => {
                const sleep = ms => new Promise(r => setTimeout(r, ms));

                function cleanNum(val) {
                    if (val === undefined || val === null || val === "-" || val === "") return 0.0;
                    const cleaned = String(val).replace(/[\s\u00a0]/g, "").replace(/,/g, "");
                    const num = parseFloat(cleaned);
                    return isNaN(num) ? val : num;
                }

                function extractMetric(text, label) {
                    if (!text) return null;
                    const regex = new RegExp(label + ":?\\s*([+\\-\\d\\s.,\\u00a0]+)", "i");
                    const match = text.match(regex);
                    if (!match || !match[1]) return null;
                    const cleaned = match[1].replace(/[\s\u00a0]/g, "").replace(/,/g, "");
                    return isNaN(parseFloat(cleaned)) ? null : cleaned;
                }

                // 1. Context Menu -> Explicitly select 'All history'
                const anyCell = document.querySelector('.tbody .td, table tbody td, .td, .tbody .tr');
                if (anyCell) {
                    anyCell.dispatchEvent(new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        button: 2
                    }));
                    await sleep(500);

                    const periodItem = Array.from(document.querySelectorAll('.item, div, button'))
                        .find(el => el.textContent.trim().includes('Period'));

                    if (periodItem) {
                        periodItem.dispatchEvent(new MouseEvent('mouseenter', {
                            bubbles: true,
                            cancelable: true
                        }));
                        await sleep(400);

                        const allHistoryBtn = Array.from(document.querySelectorAll('.item, div, button'))
                            .find(el => el.textContent.trim().toLowerCase().includes('all history') || 
                                        el.textContent.trim().toLowerCase().includes('entire history') ||
                                        el.textContent.trim().includes('کل تاریخچه'));

                        if (allHistoryBtn) {
                            allHistoryBtn.click();
                            await sleep(2000);
                        }
                    }
                }

                // Dismiss context menu
                document.body.click();
                await sleep(300);

                // 2. Find scrollable container
                const tbody = document.querySelector(".tbody") || document.querySelector("tbody");
                if (!tbody) {
                    resolve({ trades: [], summary: { error: "Table container not found" } });
                    return;
                }

                let scroller = tbody;
                while (scroller && scroller !== document.body) {
                    const s = getComputedStyle(scroller);
                    if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflow === "auto")
                        && scroller.scrollHeight > scroller.clientHeight + 5) break;
                    scroller = scroller.parentElement;
                }
                if (!scroller || scroller === document.body) {
                    scroller = document.querySelector(".table") || tbody.parentElement || tbody;
                }

                const tradesMap = new Map();
                let summaryData = {};

                function harvestCurrentRows() {
                    const rows = document.querySelectorAll(".tbody .tr, tbody tr, .tr");
                    rows.forEach(row => {
                        if (row.querySelector(".th") || row.querySelector("th")) return;

                        const fullText = (row.innerText || '').replace(/\n+/g, " | ").trim();
                        if (row.classList.contains("sticky") || row.classList.contains("inactive") || fullText.includes("Profit:") || fullText.includes("Balance:") || fullText.includes("Deposit:")) {
                            if (fullText.includes("Profit:") || fullText.includes("Balance:") || fullText.includes("Deposit:")) {
                                summaryData = {
                                    raw: fullText,
                                    profit: extractMetric(fullText, "Profit") || "0.00",
                                    credit: extractMetric(fullText, "Credit") || "0.00",
                                    deposit: extractMetric(fullText, "Deposit") || "0.00",
                                    withdrawal: extractMetric(fullText, "Withdrawal") || "0.00",
                                    balance: extractMetric(fullText, "Balance") || "0.00"
                                };
                                const tds = row.querySelectorAll(".td, td");
                                if (tds.length >= 2) {
                                    summaryData.swap = cleanNum(tds[tds.length - 2].innerText.trim());
                                    summaryData.total_profit = cleanNum(tds[tds.length - 1].innerText.trim());
                                }
                                return;
                            }
                        }


                        const cells = row.querySelectorAll(".td, td");
                        if (cells.length < 5) return;

                        let closeBySL = false;
                        let closeByTP = false;
                        const vals = [];

                        cells.forEach((cell) => {
                            let title = cell.getAttribute("title") || "";
                            let text = cell.innerText.trim();
                            let raw = title !== "" ? title : text;

                            if (raw.includes("Close by SL")) {
                                closeBySL = true;
                                raw = raw.replace(/Close by SL/gi, "").trim();
                            }
                            if (raw.includes("Close by TP")) {
                                closeByTP = true;
                                raw = raw.replace(/Close by TP/gi, "").trim();
                            }
                            vals.push(raw);
                        });

                        const ticket = vals[1] || row.dataset.id || '';
                        const closeTime = vals.length > 8 ? vals[8] : vals[2] || '';
                        if (!ticket && !closeTime) return;

                        const trade = {
                            "open_time": vals[0] || "",
                            "ticket": ticket,
                            "type": vals[2] || "",
                            "volume": cleanNum(vals[3]),
                            "symbol": vals[4] || "",
                            "open_price": cleanNum(vals[5]),
                            "stop_loss": cleanNum(vals[6]),
                            "take_profit": cleanNum(vals[7]),
                            "close_time": closeTime,
                            "close_price": cleanNum(vals[9] || vals[8]),
                            "commission": cleanNum(vals[10]),
                            "fee": cleanNum(vals[11]),
                            "swap": cleanNum(vals[12]),
                            "profit": cleanNum(vals[13] || vals[vals.length - 1]),
                            "close_by_sl": closeBySL,
                            "close_by_tp": closeByTP
                        };

                        const key = `${trade.ticket}_${trade.close_time}_${trade.open_time}`;
                        tradesMap.set(key, trade);
                    });
                }

                // 3. Complete Deep Virtual Scroll
                scroller.scrollTop = 0;
                await sleep(300);
                harvestCurrentRows();

                const step = Math.max(scroller.clientHeight * 0.7, 180);
                let lastScrollTop = -1;
                let stuckCounter = 0;

                for (let round = 0; round < 300; round++) {
                    scroller.scrollTop += step;
                    await sleep(120);
                    harvestCurrentRows();

                    if (scroller.scrollTop === lastScrollTop) {
                        stuckCounter++;
                        if (stuckCounter >= 3) break;
                    } else {
                        stuckCounter = 0;
                    }
                    lastScrollTop = scroller.scrollTop;
                }

                scroller.scrollTop = scroller.scrollHeight;
                await sleep(300);
                harvestCurrentRows();
                scroller.scrollTop = 0;

                const allTrades = Array.from(tradesMap.values()).filter(t => String(t.type).toLowerCase() !== "balance");
                resolve({
                    trades: allTrades,
                    summary: summaryData
                });
            });
        }
        """
        try:
            data = await self.page.evaluate(js_extractor) or {"trades": [], "summary": {}}
            summary = data.get("summary", {})

            # Merge live metrics with history summary
            merged_summary = {
                "equity": live_metrics.get("equity") or summary.get("balance", "0.00"),
                "balance": summary.get("balance") or live_metrics.get("balance", "0.00"),
                "free_margin": live_metrics.get("free_margin") or summary.get("balance", "0.00"),
                "margin": live_metrics.get("margin", "0.00"),
                "margin_level": live_metrics.get("margin_level", "0.00%"),
                "profit": summary.get("profit", "0.00"),
                "deposit": summary.get("deposit", "0.00"),
                "withdrawal": summary.get("withdrawal", "0.00"),
                "credit": summary.get("credit", "0.00"),
                "swap": summary.get("swap", 0.0),
                "currency": live_metrics.get("currency", "USD"),
                "raw_history": summary.get("raw", ""),
                "raw_trade": live_metrics.get("raw_trade", "")
            }

            data["summary"] = merged_summary
            return data

        except Exception as e:
            logger.error(f"Error during history extraction: {e}")
            return {"trades": [], "summary": live_metrics}
