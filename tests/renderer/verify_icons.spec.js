const { test, expect } = require('@playwright/test');
const path = require('path');

test('Verify Cloud Backup UI with new icons', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Mock electronAPI
  await page.evaluate(() => {
    window.electronAPI = {
      getSettings: () => Promise.resolve({
        success: true,
        settings: {
          google_connected: true,
          google_account_email: 'test@gmail.com',
          backup_path: '/tmp/backup/',
          cloud_backup_enabled: true
        }
      }),
      getBackupStatus: () => Promise.resolve({
        success: true,
        status: { timestamp: new Date().toISOString(), success: true }
      }),
      listCloudBackups: () => Promise.resolve([
        {
          id: '1',
          name: 'backup_2026-10-02.qdb',
          createdAt: new Date().toISOString(),
          size: 2.5 * 1024 * 1024,
          shareableLink: 'http://drive.google.com/link1'
        }
      ]),
      openDirectoryDialog: () => Promise.resolve({ success: false }),
      updateSettings: () => Promise.resolve({ success: true, message: 'Updated' })
    };

    // Bypass login if needed
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'Superadmin', username: 'superadmin' }));
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
