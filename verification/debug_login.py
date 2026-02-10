from playwright.sync_api import sync_playwright

def debug_login_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="verification/login_debug.png")
        print(page.content())
        browser.close()

if __name__ == "__main__":
    debug_login_page()
