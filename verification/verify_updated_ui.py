from playwright.sync_api import sync_playwright
import time

def test_cloud_backup_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 1024})
        page = context.new_page()

        page.goto("http://localhost:3000")

        page.evaluate("""() => {
            window.electronAPI = {
                getSettings: () => Promise.resolve({
                    success: true,
                    settings: {
                        google_connected: true,
                        google_account_email: 'test@gmail.com',
                        backup_path: '/tmp/backup/',
                        backup_enabled: true,
                        backup_frequency: 'daily',
                        backup_time: '14:30',
                        cloud_backup_enabled: true
                    }
                }),
                getBackupStatus: () => Promise.resolve({
                    success: true,
                    status: { timestamp: new Date().toISOString(), success: true }
                }),
                listCloudBackups: () => Promise.resolve([
                    {
                        id: '1',
                        name: 'backup_2026-10-02.qdb',
                        createdAt: new Date().toISOString(),
                        size: 2.5 * 1024 * 1024,
                        shareableLink: 'http://drive.google.com/link1',
                        status: 'success'
                    },
                    {
                        id: '2',
                        name: 'backup_pending.qdb',
                        createdAt: new Date().toISOString(),
                        size: 1.2 * 1024 * 1024,
                        status: 'pending'
                    }
                ]),
                openDirectoryDialog: () => Promise.resolve({ success: false }),
                updateSettings: () => Promise.resolve({ success: true, message: 'Updated' }),
                connectGoogle: () => Promise.resolve({ success: true, email: 'test@gmail.com' }),
                disconnectGoogle: () => Promise.resolve({ success: true }),
                runBackup: () => Promise.resolve({ success: true, message: 'Backup Done' })
            };
            localStorage.setItem('user', JSON.stringify({ id: 1, role: 'Superadmin', username: 'superadmin' }));
        }""")

        page.goto("http://localhost:3000/#/settings")
        time.sleep(2)

        # Select Backup Tab
        tabs = page.query_selector_all(".nav-link")
        for tab in tabs:
            if "النسخ الاحتياطي" in tab.inner_text():
                tab.click()
                break

        time.sleep(1)
        page.screenshot(path="verification/backup_tab_updated_final.png")

        browser.close()

if __name__ == "__main__":
    test_cloud_backup_ui()
