// The platform console and the invitation flow, in the browser.

const crypto = require('crypto');
const {
  test,
  expect,
  apiClient,
  newBranch,
  PLATFORM_ADMIN,
  BASE_URL,
  dismissOnboarding,
  navigate,
  modal,
  login,
  SUPERADMIN,
} = require('./fixtures');

async function platformLogin(page) {
  await page.goto('/platform');
  await page.locator('#platform-email').fill(PLATFORM_ADMIN.email);
  await page.locator('input[name="platform-password"]').fill(PLATFORM_ADMIN.password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByRole('heading', { name: 'الفروع' })).toBeVisible();
}

async function acceptInvitation(page, link, { username, password }) {
  await page.goto(link);
  await page.locator('#first_name').fill('سالم');
  await page.locator('#last_name').fill('الهاني');
  await page.locator('#national_id').fill(String(crypto.randomInt(10000000, 99999999)));
  await page.locator('#phone_number').fill(String(crypto.randomInt(20000000, 99999999)));
  await page.locator('#username').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.getByRole('button', { name: 'إنشاء الحساب والدخول' }).click();
}

test.describe('platform console', () => {
  test('a wrong password is refused', async ({ page }) => {
    await page.goto('/platform');
    await page.locator('#platform-email').fill(PLATFORM_ADMIN.email);
    await page.locator('input[name="platform-password"]').fill('not-the-password');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة.')).toBeVisible();
  });

  test('create a branch, invite its Superadmin, who signs up and lands in the branch', async ({
    page,
    browser,
  }) => {
    await platformLogin(page);
    const slug = `p-${crypto.randomBytes(4).toString('hex')}`;
    await page.getByRole('button', { name: '+ فرع جديد' }).click();
    await modal(page).locator('#branch-name').fill('فرع المنستير');
    await modal(page).locator('#branch-slug').fill(slug);
    await modal(page).getByRole('button', { name: 'إنشاء الفرع' }).click();
    await expect(page.getByRole('heading', { name: /فرع المنستير/ })).toBeVisible();
    await expect(page.getByText('الخطوة التالية: أرسل دعوة لمدير النظام في الفرع.')).toBeVisible();

    await page.locator('#invite-name').fill('سالم الهاني');
    await page.locator('[data-testid="invite-superadmin"]').click();
    const link = await page.locator('#invite-link-input').inputValue();
    expect(link).toMatch(new RegExp(`^${BASE_URL}/invite/[A-Za-z0-9_-]{40,}$`));
    await expect(page.locator('a', { hasText: 'إرسال عبر واتساب' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/\?text=/,
    );

    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(link);
    await expect(
      invitee.getByRole('heading', { name: 'دعوة للانضمام إلى فرع المنستير' }),
    ).toBeVisible();
    await expect(invitee.getByText('بصفة: مدير النظام')).toBeVisible();
    await acceptInvitation(invitee, link, { username: 'monastir', password: 'Monastir#2026' });
    await expect(invitee).toHaveURL(new RegExp(`/b/${slug}/#/`));
    await dismissOnboarding(invitee);
    await expect(invitee.locator('.topbar')).toBeVisible();

    // The link works once.
    const again = await (await browser.newContext()).newPage();
    await again.goto(link);
    await expect(again.getByText('استُعملت هذه الدعوة من قبل.', { exact: false })).toBeVisible();

    // The console now counts the branch's Superadmin and user.
    await page.goto('/platform#/branches');
    const row = page.locator('tr', { hasText: 'فرع المنستير' });
    await expect(row).toBeVisible();
    await expect(row.getByText('بلا مدير نظام')).toHaveCount(0);
  });

  test('suspending a branch signs its users out and blocks the login', async ({
    page,
    browser,
    branch,
  }) => {
    const member = await (await browser.newContext()).newPage();
    await member.goto(`/b/${branch.slug}/#/login`);
    await login(member);
    await dismissOnboarding(member);
    await expect(member.locator('.topbar')).toBeVisible();

    await platformLogin(page);
    await page.locator('tr', { hasText: branch.slug }).locator('a', { hasText: 'إدارة' }).click();
    await page.getByRole('button', { name: 'إيقاف الفرع' }).click();
    await modal(page).locator('#confirm-slug').fill(branch.slug);
    await modal(page).getByRole('button', { name: 'إيقاف الفرع' }).click();
    await expect(page.getByRole('button', { name: 'إعادة تفعيل الفرع' })).toBeVisible();

    await member.reload();
    await expect(member.getByRole('heading', { name: 'الفرع موقوف' })).toBeVisible();

    await page.getByRole('button', { name: 'إعادة تفعيل الفرع' }).click();
    await expect(page.getByRole('button', { name: 'إيقاف الفرع' })).toBeVisible();
    await member.goto(`/b/${branch.slug}/#/login`);
    await member.reload();
    await login(member);
    await expect(member.locator('.topbar')).toBeVisible();
  });
});

test.describe('branch invitations and isolation', () => {
  test('the branch Superadmin invites a finance manager, who only gets finance access', async ({
    authedPage: page,
    browser,
  }) => {
    await navigate(page, 'إدارة المستخدمين');
    await page.locator('[data-testid="invite-user"]').click();
    await modal(page).locator('select').selectOption('FinanceManager');
    await modal(page).getByRole('button', { name: 'إنشاء الدعوة' }).click();
    const link = await modal(page).locator('#invite-link-input').inputValue();
    await modal(page).getByRole('button', { name: 'إغلاق' }).click();
    await expect(
      page.locator('[data-section="web-users-extras"]').getByText('بانتظار القبول'),
    ).toBeVisible();

    const invitee = await (await browser.newContext()).newPage();
    await acceptInvitation(invitee, link, { username: 'treasurer', password: 'Treasurer#2026' });
    await dismissOnboarding(invitee);
    await expect(invitee.locator('.topbar')).toBeVisible();
    await expect(invitee.locator('a.nav-link', { hasText: 'الشؤون المالية' })).toBeVisible();
    await expect(invitee.locator('a.nav-link', { hasText: 'إدارة المستخدمين' })).toHaveCount(0);
    await expect(invitee.locator('a.nav-link', { hasText: 'الإعدادات' })).toHaveCount(0);

    // The Superadmin sees the accepted invitation and the new session.
    await page.reload();
    await dismissOnboarding(page);
    const extras = page.locator('[data-section="web-users-extras"]');
    // The platform's invitation of the Superadmin, and this one.
    await expect(extras.getByText('مقبولة')).toHaveCount(2);
    await extras.getByRole('tab', { name: 'الجلسات المفتوحة' }).click();
    await expect(extras.getByText('treasurer')).toBeVisible();
    await extras.getByRole('tab', { name: 'سجل النشاط' }).click();
    await expect(extras.getByText('قبول دعوة')).toHaveCount(2);
  });

  test('a branch session cannot read another branch', async ({ branch }) => {
    const other = await newBranch();
    const member = apiClient();
    await member('POST', `/api/b/${branch.slug}/auth/login`, {
      username: SUPERADMIN.username,
      password: SUPERADMIN.password,
    });
    const own = await member('POST', `/api/b/${branch.slug}/rpc/students:get`, { args: [{}] });
    expect(own.ok).toBe(true);
    await expect(
      member('POST', `/api/b/${other.slug}/rpc/students:get`, { args: [{}] }),
    ).rejects.toThrow(/401/);
  });
});
