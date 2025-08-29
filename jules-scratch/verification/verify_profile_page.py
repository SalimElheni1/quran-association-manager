from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Login
        page.goto("http://localhost:3000")
        page.locator("#username").fill("superadmin")
        page.locator("#password").fill("Admin123!")
        page.get_by_role("button", name="تسجيل الدخول").click()

        # Wait for navigation to the dashboard
        expect(page).to_have_url("http://localhost:3000/#/dashboard")

        # 2. Navigate to Profile Page
        page.get_by_role("link", name="ملفي الشخصي").click()
        expect(page).to_have_url("http://localhost:3000/#/profile")

        # 3. Initial Screenshot
        page.screenshot(path="jules-scratch/verification/profile_initial.png")

        # 4. Update Profile
        page.get_by_label("الاسم الأول").fill("محمد الجديد")
        page.get_by_label("اللقب").fill("الأمين الجديد")
        page.get_by_role("button", name="حفظ معلوماتي").click()

        # Check for success toast
        expect(page.locator(".Toastify__toast--success")).to_be_visible()
        # hide toast
        page.locator(".Toastify__toast--success").click()


        # 5. Update Username
        page.get_by_label("اسم المستخدم").fill("superadmin_new")
        page.get_by_role("button", name="حفظ معلوماتي").click()
        expect(page.locator(".Toastify__toast--success")).to_be_visible()
        # hide toast
        page.locator(".Toastify__toast--success").click()

        # 6. Update Password
        page.get_by_label("كلمة المرور الحالية").fill("Admin123!")
        page.get_by_label("كلمة المرور الجديدة").fill("NewAdmin123!")
        page.get_by_label("تأكيد كلمة المرور الجديدة").fill("NewAdmin123!")
        page.get_by_role("button", name="تغيير كلمة المرور").click()
        expect(page.locator(".Toastify__toast--success")).to_be_visible()

        # 7. Final Screenshot
        page.screenshot(path="jules-scratch/verification/profile_final.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
