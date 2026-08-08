import os
from playwright.sync_api import sync_playwright

def verify_financial_settings():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # Add console listener
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err.message}"))

        # Inject mock data before any script loads
        page.add_init_script("""
            console.log("Pre-injecting mock data via add_init_script...");
            window.electronAPI = {
                isPackaged: () => Promise.resolve(false),
                getAppVersion: () => Promise.resolve("1.2.7"),
                getSetting: (key) => Promise.resolve(null),
                login: (creds) => Promise.resolve({
                    success: true,
                    token: 'mock-token',
                    user: {
                        id: 1,
                        roles: ['Superadmin'],
                        username: 'superadmin',
                        first_name: 'أحمد',
                        last_name: 'العلوي'
                    }
                }),
                getSettings: () => Promise.resolve({
                    success: true,
                    settings: {
                        national_association_name: 'الرابطة الوطنية للقرآن الكريم',
                        regional_association_name: 'تونس الكبرى',
                        local_branch_name: 'فرع تونس المدينة',
                        president_full_name: 'أحمد بن علي',
                        backup_path: '/tmp/backup/',
                        backup_enabled: false,
                        backup_frequency: 'daily',
                        financial_cash_limit: 500.0,
                        financial_enforce_cash_limit: true,
                        financial_default_export_format: 'xlsx',
                        financial_report_custom_header: 'الهيئة الإدارية المالية - فرع تونس',
                        financial_association_law_type: 'tunisian_2011_88'
                    }
                }),
                getBackupStatus: () => Promise.resolve({
                    success: true,
                    status: { timestamp: new Date().toISOString(), success: true }
                }),
                getAgeGroups: () => Promise.resolve({
                    success: true,
                    ageGroups: []
                }),
                getLogo: () => Promise.resolve({ success: true, path: null }),
                updateSettings: (s) => Promise.resolve({ success: true, message: 'تم التحديث بنجاح' }),
                getProfile: () => Promise.resolve({
                    success: true,
                    profile: {
                        id: 1,
                        username: 'superadmin',
                        first_name: 'أحمد',
                        last_name: 'العلوي',
                        roles: ['Superadmin']
                    }
                }),
                onForceLogout: () => {
                    return () => {};
                },
                onImportCompleted: () => {
                    return () => {};
                },
                getInitialCredentials: () => Promise.resolve({ success: true, credentials: null }),
                clearInitialCredentials: () => Promise.resolve(),
                getTodaysClasses: () => Promise.resolve([]),
                getDashboardStats: () => Promise.resolve({}),
                getBackupReminderStatus: () => Promise.resolve({ success: true, enabled: false })
            };
            console.log("Mock data injected!");
        """)

        # Navigate to login page
        print("Navigating to Login page...")
        page.goto("http://localhost:3000/#/login")
        page.wait_for_timeout(2000)

        # Fill credentials
        print("Typing credentials...")
        page.fill('input[type="text"]', "superadmin")
        page.fill('input[type="password"]', "superadmin")

        # Click login button
        print("Clicking login...")
        page.click('button:has-text("تسجيل الدخول")')
        page.wait_for_timeout(2000)

        # Navigate directly to settings page
        print("Navigating to settings...")
        page.goto("http://localhost:3000/#/settings")
        page.wait_for_timeout(3000)

        print("Current URL:", page.url)

        # Check body HTML
        body_html = page.evaluate("() => document.body.innerHTML")
        print("Body HTML length:", len(body_html))

        # Check buttons/tabs on page
        buttons = page.evaluate("() => Array.from(document.querySelectorAll('button, a, .nav-link')).map(b => b.textContent || b.innerText)")
        print("Buttons/Tabs found on settings page:", buttons)

        # Click the "اللائحة المالية" tab
        print("Clicking 'اللائحة المالية' tab...")
        page.click('button:has-text("اللائحة المالية")')
        page.wait_for_timeout(2000)

        # Take full-page screenshot
        os.makedirs("verification", exist_ok=True)
        screenshot_path = "verification/financial_settings_screenshot.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot taken and saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_financial_settings()
