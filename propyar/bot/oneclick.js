(async () => {
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const MAX_RETRIES = 3;

  function realClick(el) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  async function waitForElement(selector, timeout = 5000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await wait(200);
    }

    return null;
  }

  async function waitForCondition(checkFn, timeout = 5000, interval = 200) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const result = checkFn();
      if (result) return result;
      await wait(interval);
    }

    return null;
  }

  function findOneClickTradingButton() {
    return [...document.querySelectorAll('button.item[title="One Click Trading"], button[title="One Click Trading"]')]
      .find(el => el.textContent?.includes('One Click Trading'));
  }

  function isCheckedButton(btn) {
    return btn?.classList.contains('checked') || !!btn?.querySelector('.checked-icon.active');
  }

  async function closeMenu(menuButton) {
    realClick(menuButton);
    console.log('📦 Menu closed');
  }

  async function runFlow() {
    // 1) باز کردن منو
    const menuButton = await waitForElement('.icon-button[title="Menu"]', 5000);
    if (!menuButton) throw new Error('دکمه Menu پیدا نشد');

    realClick(menuButton);
    console.log('✅ Menu opened');

    await wait(1000);

    // 2) پیدا کردن دکمه One Click Trading
    const oneClickBtn = await waitForCondition(() => findOneClickTradingButton(), 5000);
    if (!oneClickBtn) throw new Error('دکمه One Click Trading پیدا نشد');

    // 3) اگر از قبل checked بود، فقط منو را ببند و تمام
    if (isCheckedButton(oneClickBtn)) {
      console.log('ℹ️ One Click Trading از قبل فعال است، نیازی به ادامه نیست');
      await wait(300);
      await closeMenu(menuButton);
      console.log('✅ عملیات کامل شد، چون قبلاً فعال بود');
      return;
    }

    // 4) اگر checked نبود، باید فعالش کنیم
    realClick(oneClickBtn);
    console.log('✅ One Click Trading clicked');

    // 5) صبر برای آمدن checkbox
    const checkbox = await waitForCondition(() => {
      return document.querySelector('.controls input[type="checkbox"]');
    }, 5000);

    if (!checkbox) throw new Error('checkbox مربوط به Terms پیدا نشد');

    // 6) تیک زدن checkbox
    if (!checkbox.checked) {
      const label = checkbox.closest('label');
      if (label) {
        realClick(label);
      } else {
        realClick(checkbox);
      }

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('✅ Checkbox checked');
    } else {
      console.log('ℹ️ Checkbox از قبل تیک خورده بود');
    }

    // 7) صبر برای فعال شدن دکمه Accept
    const acceptBtn = await waitForCondition(() => {
      const buttons = [...document.querySelectorAll('.controls .buttons button, .buttons button')];
      return buttons.find(btn =>
        btn.textContent?.trim().includes('Accept') &&
        !btn.disabled
      );
    }, 5000);

    if (!acceptBtn) throw new Error('دکمه Accept فعال نشد');

    await wait(500);
    realClick(acceptBtn);
    console.log('✅ Accept clicked');

    // 8) کمی صبر برای اعمال تغییر
    await wait(1000);

    // 9) اگر خواستی بعدش منو هم بسته شود
    const menuButtonAgain = document.querySelector('.icon-button[title="Menu"]');
    if (menuButtonAgain) {
      realClick(menuButtonAgain);
      console.log('📦 Menu closed after activation');
    }
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🚀 تلاش ${attempt} از ${MAX_RETRIES}`);
      await runFlow();
      console.log('🎉 عملیات با موفقیت انجام شد');
      return;
    } catch (error) {
      console.error(`❌ خطا در تلاش ${attempt}: ${error.message}`);

      if (attempt < MAX_RETRIES) {
        console.log('🔄 دوباره تلاش می‌کنم...');
        await wait(1500);
      } else {
        console.error('💀 بعد از ۳ بار تلاش هم موفق نشدم');
      }
    }
  }
})();