const { test, expect, navigate } = require('./fixtures');

test.describe('About page (حول التطبيق)', () => {
  test('navigates to About page and displays general application information', async ({
    authedPage: page,
  }) => {
    await navigate(page, 'حول التطبيق');

    await expect(page.getByRole('heading', { name: 'حول التطبيق' })).toBeVisible();

    // Check main tabs exist
    const aboutTab = page.getByRole('tab', { name: 'عن التطبيق' });
    const techTab = page.getByRole('tab', { name: 'تفاصيل تقنية' });
    const supportTab = page.getByRole('tab', { name: 'الدعم والمساهمة' });

    await expect(aboutTab).toBeVisible();
    await expect(techTab).toBeVisible();
    await expect(supportTab).toBeVisible();

    // Default active tab is 'عن التطبيق'
    await expect(aboutTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByText('مدير فروع القرآن الكريم هو تطبيق سطح مكتب حديث لنظام Windows'),
    ).toBeVisible();
  });

  test('switches between tabs and displays technical and support details', async ({
    authedPage: page,
  }) => {
    await navigate(page, 'حول التطبيق');

    // Switch to Technical Details tab
    const techTab = page.getByRole('tab', { name: 'تفاصيل تقنية' });
    await techTab.click();
    await expect(techTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('تقنيات التطوير')).toBeVisible();
    await expect(page.getByText('النسخة الحالية:')).toBeVisible();

    // Switch to Support Tab
    const supportTab = page.getByRole('tab', { name: 'الدعم والمساهمة' });
    await supportTab.click();
    await expect(supportTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('تواصل مع المطور')).toBeVisible();
    await expect(page.getByText('سليم الهاني')).toBeVisible();
  });

  test('external support links open in the system browser, never inside Electron', async ({
    authedPage: page,
    electronApp,
  }) => {
    await electronApp.evaluate(({ shell }) => {
      global.__opened = [];
      shell.openExternal = async (u) => {
        global.__opened.push(u);
      };
    });

    await navigate(page, 'حول التطبيق');
    await page.getByRole('tab', { name: 'الدعم والمساهمة' }).click();
    await page.getByRole('link', { name: 'GitHub' }).click();

    // openExternal is called from the main process's window-open handler, after the click.
    await expect
      .poll(() => electronApp.evaluate(() => global.__opened))
      .toContain('https://github.com/SalimElheni1');
    expect(electronApp.windows()).toHaveLength(1);
  });
});
