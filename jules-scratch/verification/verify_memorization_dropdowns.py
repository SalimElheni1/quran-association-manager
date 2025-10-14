from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # It's an electron app, so we can't navigate to a URL.
    # We need to wait for the app to load.
    page.wait_for_timeout(10000) # Wait for 10 seconds for the app to load

    # The app opens to a login page.
    # Let's log in.
    page.get_by_label("اسم المستخدم").fill("superadmin")
    page.get_by_label("كلمة المرور").fill("123456")
    page.get_by_role("button", name="تسجيل الدخول").click()

    # Wait for the main page to load
    expect(page.get_by_text("إدارة الطلاب")).to_be_visible()

    # Go to the students page
    page.get_by_role("link", name="الطلاب").click()

    # Wait for the students page to load
    expect(page.get_by_text("قائمة الطلاب")).to_be_visible()

    # Click the "Add Student" button
    page.get_by_role("button", name="إضافة طالب جديد").click()

    # Wait for the modal to appear
    expect(page.get_by_text("إضافة طالب جديد")).to_be_visible()

    # Take a screenshot of the modal with the new dropdowns
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)