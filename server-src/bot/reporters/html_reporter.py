"""HTML dashboard generator with rich UI, trade analytics, and interactive equity curve chart."""

import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from core.config import logger
from reporters.json_reporter import compute_trade_analytics, to_float


def save_html_report(history_data: Dict[str, Any], account_id: str, output_path: str = None) -> str:
    """Generates a standalone, responsive HTML dashboard report with performance charts."""
    trades = history_data.get("trades", [])
    summary = history_data.get("summary", {})
    timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    analytics = compute_trade_analytics(trades, summary)

    profit_val = to_float(summary.get("profit", 0.0))
    balance_val = to_float(summary.get("balance", 0.0))
    equity_val = to_float(summary.get("equity", balance_val))
    deposit_val = to_float(summary.get("deposit", 0.0))
    withdrawal_val = to_float(summary.get("withdrawal", 0.0))
    free_margin_val = to_float(summary.get("free_margin", equity_val))
    currency = summary.get("currency", "USD")

    # 1. Build Cumulative Balance Curve Data
    # Sort trades chronologically by open_time or close_time
    sorted_trades = sorted(
        trades,
        key=lambda x: str(x.get("close_time") or x.get("open_time") or "")
    )

    # Initial starting balance before trades
    start_capital = deposit_val if deposit_val > 0 else max(balance_val - profit_val, 0.0)
    
    chart_labels = ["Start (واریز اولیه)"]
    chart_balance_data = [start_capital]
    chart_pnl_data = [0.0]
    chart_tooltips = ["Initial Deposit"]

    running_balance = start_capital
    cumulative_pnl = 0.0

    for idx, t in enumerate(sorted_trades, 1):
        pnl = to_float(t.get("profit", 0.0))
        swap = to_float(t.get("swap", 0.0))
        commission = to_float(t.get("commission", 0.0))
        fee = to_float(t.get("fee", 0.0))
        net_deal = pnl + swap + commission + fee

        running_balance += net_deal
        cumulative_pnl += net_deal

        time_label = str(t.get("close_time") or t.get("open_time") or f"Deal #{idx}")
        # Shorten label for chart axis
        short_time = time_label.split(" ")[-1] if " " in time_label else time_label

        chart_labels.append(f"#{idx} ({t.get('symbol', '')})")
        chart_balance_data.append(round(running_balance, 2))
        chart_pnl_data.append(round(cumulative_pnl, 2))
        chart_tooltips.append(
            f"Deal #{t.get('ticket')} | {t.get('symbol')} ({t.get('type')}) | PnL: ${pnl:+.2f} | Time: {time_label}"
        )

    # Ensure final point matches current balance / equity if known
    if chart_balance_data and abs(chart_balance_data[-1] - balance_val) > 0.05 and balance_val > 0:
        chart_balance_data[-1] = balance_val

    # Table Rows
    rows_html = ""
    for idx, t in enumerate(sorted_trades, 1):
        pnl = to_float(t.get("profit", 0.0))
        pnl_class = "profit-pos" if pnl >= 0 else "profit-neg"
        pnl_sign = "+" if pnl > 0 else ""
        badge_sl = '<span class="badge badge-sl">SL</span>' if t.get("close_by_sl") else ''
        badge_tp = '<span class="badge badge-tp">TP</span>' if t.get("close_by_tp") else ''

        rows_html += f"""
        <tr>
            <td><strong>#{t.get('ticket')}</strong></td>
            <td>{t.get('symbol')}</td>
            <td><span class="badge type-{str(t.get('type', '')).lower()}">{str(t.get('type', '')).upper()}</span></td>
            <td>{t.get('volume')}</td>
            <td>{t.get('open_price')}</td>
            <td>{t.get('close_price')}</td>
            <td>{t.get('stop_loss') or '-'}</td>
            <td>{t.get('take_profit') or '-'}</td>
            <td>{t.get('open_time')}</td>
            <td>{t.get('close_time')}</td>
            <td>{t.get('swap')}</td>
            <td class="{pnl_class}"><strong>{pnl_sign}{pnl:.2f}</strong> {badge_sl} {badge_tp}</td>
        </tr>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>گزارش و تحلیل حساب معاملاتی متاتریدر - #{account_id}</title>
    <!-- Chart.js for Growth Curve -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {{
            --bg-color: #0b0f19;
            --card-bg: #151d30;
            --card-hover: #1c2640;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent-green: #10b981;
            --accent-red: #ef4444;
            --accent-blue: #3b82f6;
            --accent-purple: #8b5cf6;
            --accent-cyan: #06b6d4;
            --border-color: #232f48;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Roboto, sans-serif; }}
        body {{ background-color: var(--bg-color); color: var(--text-main); padding: 24px; direction: rtl; }}
        .container {{ max-width: 1400px; margin: auto; }}
        
        /* Header */
        .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-color); padding-bottom: 20px; margin-bottom: 24px; flex-wrap: wrap; gap: 15px; }}
        .header h1 {{ font-size: 24px; font-weight: 700; display: flex; align-items: center; gap: 10px; }}
        .header .meta {{ color: var(--text-muted); font-size: 14px; margin-top: 5px; }}
        .header .badge-live {{ background: rgba(16, 185, 129, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; }}

        /* Summary Grid */
        .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }}
        .summary-card {{ background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 14px; padding: 20px; transition: transform 0.2s ease, border-color 0.2s ease; position: relative; overflow: hidden; }}
        .summary-card:hover {{ transform: translateY(-3px); border-color: var(--accent-blue); background: var(--card-hover); }}
        .summary-card .label {{ color: var(--text-muted); font-size: 13px; font-weight: 600; margin-bottom: 8px; display: flex; justify-content: space-between; }}
        .summary-card .value {{ font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }}
        .summary-card .sub-text {{ font-size: 12px; color: var(--text-muted); margin-top: 6px; }}

        /* Chart Section */
        .chart-card {{ background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 14px; padding: 24px; margin-bottom: 24px; }}
        .chart-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }}
        .chart-header h2 {{ font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; }}
        .chart-container {{ position: relative; height: 360px; width: 100%; }}

        /* Analytics Grid */
        .analytics-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 24px; }}
        .mini-card {{ background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; text-align: center; }}
        .mini-card .title {{ font-size: 12px; color: var(--text-muted); margin-bottom: 5px; }}
        .mini-card .num {{ font-size: 18px; font-weight: bold; }}

        /* Table Section */
        .table-card {{ background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 14px; overflow: hidden; }}
        .table-header {{ padding: 18px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }}
        .table-header h2 {{ font-size: 18px; font-weight: 700; }}
        .table-responsive {{ overflow-x: auto; }}
        table {{ width: 100%; border-collapse: collapse; text-align: right; font-size: 14px; }}
        th {{ background: #0b0f19; color: var(--text-muted); padding: 14px 16px; font-weight: 600; border-bottom: 1px solid var(--border-color); white-space: nowrap; }}
        td {{ padding: 12px 16px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }}
        tr:hover {{ background: rgba(255, 255, 255, 0.02); }}
        
        /* Badges & Colors */
        .profit-pos {{ color: var(--accent-green); font-weight: bold; }}
        .profit-neg {{ color: var(--accent-red); font-weight: bold; }}
        .badge {{ padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }}
        .badge-sl {{ background: rgba(239, 68, 68, 0.2); color: var(--accent-red); margin-right: 4px; }}
        .badge-tp {{ background: rgba(16, 185, 129, 0.2); color: var(--accent-green); margin-right: 4px; }}
        .type-buy {{ background: rgba(59, 130, 246, 0.2); color: #60a5fa; }}
        .type-sell {{ background: rgba(249, 115, 22, 0.2); color: #fb923c; }}
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div>
                <h1>📈 داشبورد و گزارش تحلیلی متاتریدر</h1>
                <div class="meta">شماره حساب: <strong>{account_id}</strong> | ارز پایه: <strong>{currency}</strong> | زمان استخراج: <strong>{timestamp_str}</strong></div>
            </div>
            <div class="badge-live">● وضعیت زنده حساب</div>
        </div>

        <!-- Primary Financial Metrics -->
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label"><span>اکوئیتی لحظه‌ای (Equity)</span> <span>💎</span></div>
                <div class="value" style="color: var(--accent-blue);">${equity_val:,.2f}</div>
                <div class="sub-text">سرمایه لحظه‌ای با احتساب سود شناور</div>
            </div>

            <div class="summary-card">
                <div class="label"><span>موجودی حساب (Balance)</span> <span>🏦</span></div>
                <div class="value">${balance_val:,.2f}</div>
                <div class="sub-text">موجودی بسته شده معاملات</div>
            </div>

            <div class="summary-card">
                <div class="label"><span>سود خالص کل (Total Profit)</span> <span>📊</span></div>
                <div class="value {'profit-pos' if profit_val >= 0 else 'profit-neg'}">${profit_val:+,.2f}</div>
                <div class="sub-text">مجموع سود/زیان کلیه معاملات</div>
            </div>

            <div class="summary-card">
                <div class="label"><span>واریز / برداشت</span> <span>💳</span></div>
                <div class="value">${deposit_val:,.2f} <span style="font-size:14px; color:var(--text-muted);">/ -${withdrawal_val:,.2f}</span></div>
                <div class="sub-text">سرمایه اولیه: ${start_capital:,.2f}</div>
            </div>

            <div class="summary-card">
                <div class="label"><span>مارجین آزاد (Free Margin)</span> <span>🛡️</span></div>
                <div class="value">${free_margin_val:,.2f}</div>
                <div class="sub-text">مارجین در دسترس برای باز کردن پوزیشن</div>
            </div>

            <div class="summary-card">
                <div class="label"><span>تعداد کل معاملات</span> <span>🔢</span></div>
                <div class="value" style="color: var(--accent-purple);">{analytics['total_trades']} معامله</div>
                <div class="sub-text">وین‌ریت: {analytics['win_rate_pct']}%</div>
            </div>
        </div>

        <!-- Secondary Performance Analytics -->
        <div class="analytics-grid">
            <div class="mini-card">
                <div class="title">معاملات برنده (Win)</div>
                <div class="num" style="color: var(--accent-green);">{analytics['winning_trades']} ({analytics['win_rate_pct']}%)</div>
            </div>
            <div class="mini-card">
                <div class="title">معاملات بازنده (Loss)</div>
                <div class="num" style="color: var(--accent-red);">{analytics['losing_trades']} ({analytics['loss_rate_pct']}%)</div>
            </div>
            <div class="mini-card">
                <div class="title">تعداد Buy / Sell</div>
                <div class="num">{analytics['buy_trades']} خرید / {analytics['sell_trades']} فروش</div>
            </div>
            <div class="mini-card">
                <div class="title">حجم کل معاملات (Lots)</div>
                <div class="num">{analytics['total_volume']} Lot</div>
            </div>
            <div class="mini-card">
                <div class="title">سود ناخالص (Gross Profit)</div>
                <div class="num profit-pos">+${analytics['gross_profit']:,.2f}</div>
            </div>
            <div class="mini-card">
                <div class="title">زیان ناخالص (Gross Loss)</div>
                <div class="num profit-neg">-${analytics['gross_loss']:,.2f}</div>
            </div>
            <div class="mini-card">
                <div class="title">پرافیت فاکتور (PF)</div>
                <div class="num" style="color: var(--accent-cyan);">{analytics['profit_factor']}</div>
            </div>
        </div>

        <!-- Interactive Growth Chart -->
        <div class="chart-card">
            <div class="chart-header">
                <h2>📈 نمودار رشد سرمایه و بالانس از شروع تا آخرین معامله (Growth Curve)</h2>
                <div style="font-size: 13px; color: var(--text-muted);">
                    سرمایه استارت: <strong>${start_capital:,.2f} {currency}</strong> ➔ سرمایه فعلی: <strong>${balance_val:,.2f} {currency}</strong>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="growthChart"></canvas>
            </div>
        </div>

        <!-- Closed Trades Table -->
        <div class="table-card">
            <div class="table-header">
                <h2>📋 جدول کلیه معاملات بسته شده ({len(trades)} معامله)</h2>
            </div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>شماره تیکت (Ticket)</th>
                            <th>نماد (Symbol)</th>
                            <th>نوع معامله</th>
                            <th>حجم (Volume)</th>
                            <th>قیمت ورود</th>
                            <th>قیمت خروج</th>
                            <th>حد ضرر (S/L)</th>
                            <th>حد سود (T/P)</th>
                            <th>زمان ورود</th>
                            <th>زمان خروج</th>
                            <th>سواپ (Swap)</th>
                            <th>سود/زیان ($)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html if rows_html else '<tr><td colspan="12" style="text-align:center; padding:30px; color:#94a3b8;">هیچ معامله بسته‌شده‌ای ثبت نشده است.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Chart Configuration Script -->
    <script>
        const labels = {json.dumps(chart_labels, ensure_ascii=False)};
        const balanceData = {json.dumps(chart_balance_data)};
        const tooltips = {json.dumps(chart_tooltips, ensure_ascii=False)};

        const ctx = document.getElementById('growthChart').getContext('2d');
        
        // Create Gradient Fill
        const gradient = ctx.createLinearGradient(0, 0, 0, 360);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.45)');
        gradient.addColorStop(0.7, 'rgba(59, 130, 246, 0.08)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        new Chart(ctx, {{
            type: 'line',
            data: {{
                labels: labels,
                datasets: [{{
                    label: 'سرمایه / بالانس ($)',
                    data: balanceData,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    pointBackgroundColor: '#60a5fa',
                    pointBorderColor: '#0f172a',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#10b981',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35
                }}]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {{
                    mode: 'index',
                    intersect: false
                }},
                plugins: {{
                    legend: {{
                        display: false
                    }},
                    tooltip: {{
                        rtl: true,
                        backgroundColor: '#1e293b',
                        titleColor: '#f8fafc',
                        bodyColor: '#94a3b8',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {{
                            title: function(context) {{
                                const idx = context[0].dataIndex;
                                return tooltips[idx] || labels[idx];
                            }},
                            label: function(context) {{
                                return ' بالانس حساب: $' + Number(context.parsed.y).toLocaleString(undefined, {{ minimumFractionDigits: 2, maximumFractionDigits: 2 }});
                            }}
                        }}
                    }}
                }},
                scales: {{
                    x: {{
                        grid: {{
                            color: 'rgba(51, 65, 85, 0.4)',
                            drawBorder: false
                        }},
                        ticks: {{
                            color: '#94a3b8',
                            font: {{ size: 11 }}
                        }}
                    }},
                    y: {{
                        grid: {{
                            color: 'rgba(51, 65, 85, 0.4)',
                            drawBorder: false
                        }},
                        ticks: {{
                            color: '#94a3b8',
                            font: {{ size: 12 }},
                            callback: function(value) {{
                                return '$' + value.toLocaleString();
                            }}
                        }}
                    }}
                }}
            }}
        }});
    </script>
</body>
</html>
"""
    filename = output_path or f"report_{account_id}.html"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(html_content)

    logger.info(f"🌐 HTML dashboard generated: {filename}")
    return filename
