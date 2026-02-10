from playwright.sync_api import sync_playwright
import time

def verify_settings_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Inject mock electronAPI
        context.add_init_script("""
            window.electronAPI = {
                login: (creds) => Promise.resolve({
                    success: true,
                    token: 'mock-token',
                    user: { id: 1, username: 'superadmin', roles: ['Superadmin'], need_guide: 0 }
                }),
                getProfile: (data) => Promise.resolve({
                    success: true,
                    profile: { id: 1, username: 'superadmin', roles: ['Superadmin'] }
                }),
                getLogo: () => Promise.resolve({ success: true, path: 'assets/logos/icon.png' }),
                getSettings: () => Promise.resolve({
                    success: true,
                    settings: {
                        national_association_name: 'الرابطة الوطنية للقرآن الكريم',
                        backup_path: '/tmp/backup',
                        google_connected: true,
                        google_account_email: 'branch-tunis@gmail.com',
                        cloud_backup_enabled: true,
                        annual_fee: 50,
                        standard_monthly_fee: 10
                    }
                }),
                getBackupStatus: () => Promise.resolve({
                    success: true,
                    status: {
                        success: true,
                        timestamp: new Date().toISOString(),
                        message: 'Backup successful'
                    }
                }),
                listCloudBackups: () => Promise.resolve([
                    {
                        id: '1',
                        name: 'backup-2026-02-10.qdb',
                        driveFileId: 'drive-1',
                        shareableLink: 'https://drive.google.com/link1',
                        createdAt: new Date().toISOString(),
                        size: 2500000,
                        createdBy: 'branch-tunis@gmail.com'
                    },
                    {
                        id: '2',
                        name: 'backup-old.qdb',
                        driveFileId: 'drive-2',
                        shareableLink: 'https://drive.google.com/link2',
                        createdAt: new Date(Date.now() - 86400000).toISOString(),
                        size: 2400000,
                        createdBy: 'branch-tunis@gmail.com'
                    }
                ]),
                onForceLogout: () => () => {},
                onImportCompleted: () => () => {},
                isPackaged: () => Promise.resolve(false),
                getAppVersion: () => Promise.resolve('1.2.3'),
                openDirectoryDialog: () => Promise.resolve({ success: false }),
                uploadLogo: () => Promise.resolve({ success: false }),
                relaunchApp: () => { console.log('App Relaunch Triggered'); }
            };
        """)

        page = context.new_page()
        page.goto("http://localhost:3000")

        # Login
        page.locator("input#username").fill("superadmin")
        page.locator("input[type='password']").fill("superadmin")
        page.get_by_role("button", name="تسجيل الدخول").click()

        # Wait for navigation
        time.sleep(3)

        # Go to settings
        # Now the link should be visible, or we can just goto
        page.get_by_role("link", name="الإعدادات").click()
        time.sleep(2)

        # Click on Backup tab
        page.get_by_role("tab", name="النسخ الاحتياطي").click()
        time.sleep(1)
        page.screenshot(path="verification/backup_tab_mocked.png")

        # Open help modal
        page.get_by_role("button", name="كيفية الربط والاشتراك؟").click()
        time.sleep(1)
        page.screenshot(path="verification/help_modal_mocked.png")
        page.get_by_role("button", name="فهمت ذلك").click()

        # Open restore confirmation
        page.locator("button[title='استرجاع']").first.click()
        time.sleep(1)
        page.screenshot(path="verification/restore_confirm_mocked.png")

        browser.close()

if __name__ == "__main__":
    import os
    if not os.path.exists("verification"):
        os.makedirs("verification")
    verify_settings_page()
