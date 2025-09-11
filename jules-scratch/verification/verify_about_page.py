from playwright.sync_api import sync_playwright, Page, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the login page
        page.goto("http://localhost:3001/login", wait_until="load")

        # Give the app time to render
        time.sleep(5)


        # 2. Log in
        username_input = page.get_by_placeholder("اسم المستخدم")
        expect(username_input).to_be_visible(timeout=60000)
        username_input.fill("superadmin")

        page.get_by_placeholder("كلمة المرور").fill("your-strong-default-password")
        page.get_by_role("button", name="تسجيل الدخول").click()

        # Wait for navigation to the dashboard after login
        expect(page).to_have_url("http://localhost:3001/", timeout=60000)

        # 3. Navigate to the About page
        page.goto("http://localhost:3001/about", wait_until="load")

        # Give the app time to render
        time.sleep(5)

        # Wait for the tabs to be visible
        about_tab = page.get_by_role("tab", name="عن التطبيق")
        expect(about_tab).to_be_visible(timeout=60000)


        # 4. Take a screenshot of the default tab
        page.screenshot(path="jules-scratch/verification/about-page-tab1.png")

        # 5. Click on the "Technical Details" tab and take a screenshot
        tech_tab = page.get_by_role("tab", name="تفاصيل تقنية")
        tech_tab.click()
        time.sleep(2)
        page.screenshot(path="jules-scratch/verification/about-page-tab2.png")

        # 6. Click on a h5 to make sure the tab is loaded
        expect(page.locator('h5:text("تقنيات التطوير")')).to_be_visible()

        # 7. Click on the "Support & Contribution" tab and take a screenshot
        support_tab = page.get_by_role("tab", name="الدعم والمساهمة")
        support_tab.click()
        time.sleep(2)
        page.screenshot(path="jules-scratch/verification/verification.png")

        # 8. Click on a h5 to make sure the tab is loaded
        expect(page.locator('h5:text("تواصل مع المطور")')).to_be_visible()


    except Exception as e:
        print(f"An error occurred: {e}")
        print("Page content:")
        page.screenshot(path="jules-scratch/verification/error.png")
        print(page.content())

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
