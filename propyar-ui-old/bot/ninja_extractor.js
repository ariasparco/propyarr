// =========================================================================
// 🔗 COMBINED SCRIPT — اجرای پی‌در‌پی هر سه اسکریپت بدون هیچ تغییری در منطق هرکدوم
// ترتیب: 1) فعال‌سازی History + گرفتن Profit امروز
//        2) استخراج کامل معاملات از جدول (Virtual Scroll Extractor v5.1)
//        3) کلیک روی تب Trade
// =========================================================================

(function runAll() {

  // -----------------------------------------------------------------------
  // 🧩 SCRIPT 1 — Check & click History button, navigate to Today, extract Profit
  // (بدون هیچ تغییری نسبت به نسخه‌ی اصلی)
  // -----------------------------------------------------------------------
  function runScript1() {
    // Step 1: Check & click History button if needed
    const btn = document.querySelector('[title="History"]');
    if (!btn) {
      console.error('❌ History button not found');
      // If we can't find the history button, just execute script 2 directly or fail gracefully
      runScript3();
      return;
    }

    const wasChecked = btn.classList.contains('checked');

    if (wasChecked) {
      console.log('✅ Already active, no click needed');
    } else {
      btn.click();
      console.log('🖱️ Clicked to activate History');
    }

    // اگه checked بود 0ms صبر می‌کنیم، اگه نبود 800ms
    const delay = wasChecked ? 0 : 800;

    setTimeout(() => {

      // Step 2: Right-click روی td
      const td = document.querySelector('.td.svelte-6vhlj1');
      if (!td) {
        console.error('❌ td not found');
        runScript2(); // fallback
      } else {
        td.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2
        }));
        console.log('🖱️ Right-clicked on td!');

        // Step 3: Hover روی Period
        setTimeout(() => {
          const periodItem = Array.from(document.querySelectorAll('.item'))
            .find(el => el.textContent.includes('Period'));

          if (!periodItem) {
            console.error('❌ Period not found');
            runScript2(); // fallback
          } else {
            console.log('✅ Found Period!', periodItem);
            periodItem.dispatchEvent(new MouseEvent('mouseenter', {
              bubbles: true,
              cancelable: true
            }));
            console.log('✨ Hovered over Period!');

            // Step 4: Click روی Today
            setTimeout(() => {
              const todayBtn = Array.from(document.querySelectorAll('.item'))
                .find(el => el.textContent.includes('Today'));

              if (todayBtn) {
                console.log('✅ Found Today button!', todayBtn);
                todayBtn.click();
                console.log('🎯 Clicked on Today!');

                // Step 5: Extract Profit (we also extract it in script 2 natively, but keep it as requested)
                setTimeout(() => {
                  const layoutDiv = document.querySelector('.layout.svelte-1i9wdgu');
                  if (layoutDiv) {
                    const profitDiv = Array.from(layoutDiv.querySelectorAll('div'))
                      .find(el => el.textContent.includes('Profit:'));

                    if (profitDiv) {
                      const profitText = profitDiv.textContent.trim();
                      const profitValue = parseFloat(profitText.replace('Profit:', '').trim());
                      console.log('💰 Profit:', profitValue);
                    }
                  }

                  // ✅ بعد از اتمام کامل اسکریپت ۱، میریم سراغ اسکریپت ۲
                  setTimeout(runScript2, 500);

                }, 300);

              } else {
                console.error('❌ Today button not found');
                runScript2();
              }
            }, 200);
          }
        }, 200);
      }

    }, delay); // ⬅️ اینجاست که معجزه میکنه!
  }

  // -----------------------------------------------------------------------
  // 🧩 SCRIPT 2 — MetaTrader VIRTUAL SCROLL Extractor v5.1
  // (بدون هیچ تغییری نسبت به نسخه‌ی اصلی)
  // -----------------------------------------------------------------------
  async function runScript2() {
    // =========================================================================
    // 🎯 MetaTrader VIRTUAL SCROLL Extractor v5.1 - "TP هم رام شد!"
    // =========================================================================
    console.clear();
    console.log("%c🚀 v5.1 - Close by TP حالا عدد خالص میشه!", "color:#00bcd4; font-size:14px; font-weight:bold;");

    await (async function extractAllTrades() {

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        function cleanNum(val) {
            if (!val || val === "-" || val === "") return "";
            const cleaned = val.replace(/\s/g, "").replace(",", "");
            const num = parseFloat(cleaned);
            return isNaN(num) ? val : num;
        }

        const tbody = document.querySelector(".tbody");
        if (!tbody) {
            console.error("❌ جدول پیدا نشد! صفحه رو چک کن.");
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
            scroller = document.querySelector(".table") || tbody.parentElement;
        }
        console.log(`%c📦 scroller: <${scroller.tagName.toLowerCase()} class="${scroller.className.trim().split(" ")[0]}">`, "color:#888;");

        const tradesMap = new Map();
        let summaryData = null;

        function harvestCurrentRows() {
            document.querySelectorAll(".tbody .tr").forEach(row => {

                if (row.querySelector(".th")) return;

                if (row.classList.contains("inactive") && row.classList.contains("sticky")) {
                    const text = row.innerText.replace(/\n+/g, " | ").trim();
                    const match = {
                        raw: text,
                        profit:     (text.match(/Profit:\s*([-\d.]+)/)  || [])[1] || "",
                        credit:     (text.match(/Credit:\s*([-\d.]+)/)  || [])[1] || "",
                        deposit:    (text.match(/Deposit:\s*([\d ,.]+)/) || [])[1]?.replace(/\s/g,"") || "",
                        withdrawal: (text.match(/Withdrawal:\s*([\d .]+)/) || [])[1]?.replace(/\s/g,"") || "",
                        balance:    (text.match(/Balance:\s*([-\d .]+)/)  || [])[1]?.replace(/\s/g,"") || "",
                        swap:       "",
                        total_profit: ""
                    };
                    const tds = row.querySelectorAll(".td");
                    if (tds.length >= 2) {
                        match.swap         = tds[tds.length - 2].innerText.trim();
                        match.total_profit = tds[tds.length - 1].innerText.trim();
                    }
                    summaryData = match;
                    return;
                }

                const cells = row.querySelectorAll(".td");
                if (cells.length < 2) return;

                const hasColspan = [...cells].some(c => {
                    const gc = c.style.gridColumn;
                    return gc && gc.includes("/");
                });

                if (hasColspan) {
                    const trade = {
                        "open_time":   cells[0]?.getAttribute("title") || cells[0]?.innerText.trim(),
                        "ticket":      cells[1]?.getAttribute("title") || cells[1]?.innerText.trim(),
                        "type":        cells[2]?.getAttribute("title") || cells[2]?.innerText.trim(),
                        "profit":      cleanNum(cells[cells.length - 1]?.getAttribute("title") || cells[cells.length - 1]?.innerText.trim()),
                    };
                    const key = `${trade.open_time}_${trade.ticket}_balance`;
                    tradesMap.set(key, trade);
                    return;
                }

                if (cells.length < 14) return;

                let closeBySL = false;
                let closeByTP = false;
                const vals = [];

                cells.forEach((cell, i) => {
                    let title = cell.getAttribute("title") || "";
                    let text  = cell.innerText.trim();

                    let raw = title !== "" ? title : text;

                    // Stop Loss (i=6): اگه "Close by SL" داره، برچسبو بکن، عددو نگه دار
                    if (i === 6 && raw.includes("Close by SL")) {
                        closeBySL = true;
                        raw = raw.replace(/Close by SL/gi, "").trim();
                    }

                    // 🆕 Take Profit (i=7): اگه "Close by TP" داره، برچسبو بکن، عددو نگه دار
                    if (i === 7 && raw.includes("Close by TP")) {
                        closeByTP = true;
                        raw = raw.replace(/Close by TP/gi, "").trim();
                    }

                    vals.push(raw);
                });

                const trade = {
                    "open_time":   vals[0],
                    "ticket":      vals[1],
                    "type":        vals[2],
                    "volume":      cleanNum(vals[3]),
                    "symbol":      vals[4],
                    "open_price":  cleanNum(vals[5]),
                    "stop_loss":   cleanNum(vals[6]),
                    "take_profit": cleanNum(vals[7]),
                    "close_time":  vals[8],
                    "close_price": cleanNum(vals[9]),
                    "commission":  cleanNum(vals[10]),
                    "fee":         cleanNum(vals[11]),
                    "swap":        cleanNum(vals[12]),
                    "profit":      cleanNum(vals[13]),
                    "close_by_sl": closeBySL,
                    "close_by_tp": closeByTP
                };

                const key = `${trade.ticket}_${trade.close_time}`;
                tradesMap.set(key, trade);
            });
        }

        scroller.scrollTop = 0;
        await sleep(250);
        harvestCurrentRows();

        const step = Math.max(scroller.clientHeight * 0.7, 180);
        let lastScrollTop = -1;
        let stuckCounter  = 0;
        let round = 0;

        while (round < 400) {
            round++;
            scroller.scrollTop += step;
            await sleep(150);
            harvestCurrentRows();

            const progress = Math.round((scroller.scrollTop / scroller.scrollHeight) * 100);
            console.log(`%c🔄 راند ${round} | ${progress}% | شکار: ${tradesMap.size}`, "color:#FF9800;");

            if (scroller.scrollTop === lastScrollTop) {
                if (++stuckCounter >= 3) {
                    console.log("%c✅ رسیدیم ته جدول!", "color:#4CAF50; font-weight:bold;");
                    break;
                }
            } else {
                stuckCounter = 0;
            }
            lastScrollTop = scroller.scrollTop;
        }

        scroller.scrollTop = scroller.scrollHeight;
        await sleep(300);
        harvestCurrentRows();
        scroller.scrollTop = 0;

        const all = Array.from(tradesMap.values());
        const trades = all.filter(t => t.type !== "balance");
        const balRow = all.find(t => t.type === "balance");

        window.__myTrades   = trades;
        window.__mySummary  = summaryData;
        
        console.log("%c🗂️  window.__myTrades | window.__mySummary", "color:#9C27B0;");
        console.log("\n%c🎉 تمام! حالا TP هم عدد خالص شد!", "color:#4CAF50; font-size:16px; font-weight:bold;");

    })();

    // ✅ بعد از اتمام کامل اسکریپت ۲، میریم سراغ اسکریپت ۳
    runScript3();
  }

  // -----------------------------------------------------------------------
  // 🧩 SCRIPT 3 — کلیک روی تب Trade
  // (بدون هیچ تغییری نسبت به نسخه‌ی اصلی)
  // -----------------------------------------------------------------------
  function runScript3() {
    // روش ۱: با title
    const tBtn = document.querySelector('[title="Trade"]');
    if (tBtn) tBtn.click();
    window.__historyDone = true;
  }

  // 🚀 شروع زنجیره از اسکریپت ۱
  if (!window.__historyRunning) {
      window.__historyRunning = true;
      window.__historyDone = false;
      runScript1();
  }

})();
