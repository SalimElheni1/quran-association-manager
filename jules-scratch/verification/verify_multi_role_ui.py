from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # Navigate to the login page
        page.goto("http://localhost:3000/login")

        # Log in as superadmin
        page.get_by_placeholder("اسم المستخدم").fill("superadmin")
        page.get_by_placeholder("كلمة المرور").fill("123456")
        page.get_by_role("button", name="تسجيل الدخول").click()

        # Wait for navigation to the dashboard
        expect(page).to_have_url("http://localhost:3000/")

        # Navigate to the Users page
        page.get_by_role("link", name="إدارة المستخدمين").click()
        expect(page).to_have_url("http://localhost:3000/users")

        # Click the "Add User" button
        page.get_by_role("button", name="إضافة مستخدم جديد").click()

        # Wait for the modal to appear
        modal_title = page.locator(".modal-title")
        expect(modal_title).to_have_text("إضافة مستخدم جديد")

        # Take a screenshot of the user form modal
        page.screenshot(path="jules-scratch/verification/verification.png")

        print("Screenshot taken successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")

    finally:
        # Clean up
        context.close()
        browser.close()

with sync_playwright() as playwright:
    run(playwright)