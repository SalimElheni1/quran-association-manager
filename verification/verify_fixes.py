from playwright.sync_api import sync_playwright
import time

def test_cloud_backup_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 1024})
        page = context.new_page()

        page.goto("http://localhost:3000")

        page.evaluate("""() => {
            localStorage.setItem('user', JSON.stringify({ id: 1, role: 'Superadmin', username: 'superadmin' }));
        }""")

        page.goto("http://localhost:3000/#/settings")
        time.sleep(3)

        page.screenshot(path="verification/settings_page_initial.png")

        # Try to find the backup tab by index or title
        # Tabs are in a .nav-tabs
        tabs = page.query_selector_all(".nav-link")
        for i, tab in enumerate(tabs):
            print(f"Tab {i}: {tab.inner_text()}")
            if "النسخ الاحتياطي" in tab.inner_text():
                tab.click()
                break

        time.sleep(1)
        page.screenshot(path="verification/backup_tab_final.png")

        # Security warning in Help Modal
        help_btn = page.query_selector("button[title='كيفية الربط والاشتراك؟']")
        if help_btn:
            help_btn.click()
            time.sleep(1)
            page.screenshot(path="verification/backup_help_warning.png")

        browser.close()

if __name__ == "__main__":
    test_cloud_backup_ui()
