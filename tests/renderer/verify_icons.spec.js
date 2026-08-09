const { test, expect } = require('@playwright/test');

test('Verify Backup UI with new icons', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Mock electronAPI
  await page.evaluate(() => {
    window.electronAPI = {
      getSettings: () =>
        Promise.resolve({
          success: true,
          settings: {
            backup_path: '/tmp/backup/',
          },
        }),
      getBackupStatus: () =>
        Promise.resolve({
          success: true,
          status: { timestamp: new Date().toISOString(), success: true },
        }),
      openDirectoryDialog: () => Promise.resolve({ success: false }),
      updateSettings: () => Promise.resolve({ success: true, message: 'Updated' }),
    };

    // Bypass login if needed
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, role: 'Superadmin', username: 'superadmin' }),
    );
  });

  await page.goto('http://localhost:3000/#/settings');
  await page.waitForTimeout(1000);

  // Click Backup Tab (النسخ الاحتياطي)
  await page.click('button:has-text("النسخ الاحتياطي")');
  await page.waitForTimeout(500);

  // Take screenshot
  await page.screenshot({ path: 'verification/backup_tab_final.png', fullPage: true });

  // Check if icons are present (they are SVGs now)
  const svgCount = await page.locator('svg').count();
  console.log('SVG Count:', svgCount);
  expect(svgCount).toBeGreaterThan(0);
});
