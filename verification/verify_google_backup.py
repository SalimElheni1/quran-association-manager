from playwright.sync_api import Page, expect, sync_playwright
import time
import os

def test_settings_google_backup(page: Page):
    page.add_init_script("""
        window.electronAPI = {
            login: () => Promise.resolve({
                success: true,
                token: 'mock-token',
                user: { id: 1, username: 'superadmin', roles: ['Superadmin'] }
            }),
            getSettings: () => Promise.resolve({
                success: true,
                settings: {
                    backup_path: '/tmp/backup',
                    backup_enabled: true,
                    backup_frequency: 'daily',
                    backup_reminder_enabled: true,
                    backup_reminder_frequency_days: 7,
                    cloud_backup_enabled: true,
                    google_connected: true,
                    google_account_email: 'branch-tunis@gmail.com',
                }
            }),
            getBackupStatus: () => Promise.resolve({
                success: true,
                status: {
                    success: true,
                    timestamp: new Date().toISOString()
                }
            }),
            listCloudBackups: () => Promise.resolve([
                {
                    fileName: 'backup-1.qdb',
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                    size: 1024 * 1024 * 2.5,
                    deviceName: 'Laptop-1'
                }
            ]),
            onForceLogout: () => () => {},
            isPackaged: () => Promise.resolve(false),
            getAppVersion: () => Promise.resolve('1.2.3'),
            getLogo: () => Promise.resolve({ success: true, path: null }),
            onImportCompleted: () => () => {},
            getInitialCredentials: () => Promise.resolve(null),
            logout: () => {}
        };
    """)

    page.goto("http://localhost:3000/#/login")
    page.locator("#username").fill("superadmin")
    page.locator('input[name="password"]').fill("superadmin")
    page.get_by_role("button", name="تسجيل الدخول").click()

    page.wait_for_url("**/")
    page.goto("http://localhost:3000/#/settings")
    page.wait_for_selector("text=إعدادات النظام")
    page.get_by_role("tab", name="النسخ الاحتياطي").click()

    page.wait_for_selector("text=النسخ الاحتياطي السحابي (Google Drive)")

    # Take screenshot of the connected state
    page.screenshot(path="verification/google_backup_connected.png", full_page=True)

    # Click help button
    page.click("button[title='كيفية الربط والاشتراك؟']")
    time.sleep(1)
    page.screenshot(path="verification/google_backup_help.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 1200})
        try:
            test_settings_google_backup(page)
        finally:
            browser.close()
