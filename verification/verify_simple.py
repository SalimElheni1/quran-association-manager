from playwright.sync_api import sync_playwright
import time

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")
        time.sleep(2)
        page.screenshot(path="verification/simple_home.png")
        browser.close()

if __name__ == "__main__":
    test()
