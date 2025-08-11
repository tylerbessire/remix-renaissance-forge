import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Capture and print console logs
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

    try:
        # 1. Navigate to the app
        page.goto("http://localhost:8080/")

        # 2. Find the YouTube search input and perform a search
        search_input = page.get_by_placeholder("e.g., 'Never Gonna Give You Up'")
        expect(search_input).to_be_visible(timeout=10000) # Wait for app to load
        search_input.fill("Rick Astley - Never Gonna Give You Up")

        search_button = page.get_by_role("button", name="Search")
        search_button.click()

        # 3. Wait for search results and click the first one
        # The results are in a div with a specific structure
        # We'll wait for the first result to be visible
        first_result_selector = "div.space-y-2 > div:first-child"
        first_result = page.locator(first_result_selector)
        expect(first_result).to_be_visible(timeout=15000) # Wait for search to complete

        # Get the title of the song we are about to click
        song_title_element = first_result.locator("p.font-semibold")
        song_title = song_title_element.inner_text()

        first_result.click()

        # 4. Wait for the download and for the song to appear in the first column
        # The toast message is a good indicator that the download has started
        expect(page.locator("text=/Downloading/")).to_be_visible()

        # Now wait for the success toast
        expect(page.locator(f"text=/\"{song_title}\" added to 'Vibe Check'!/")).to_be_visible(timeout=20000) # Long timeout for download

        # 5. Verify the song is in the first column
        # The columns are now cards with a title
        first_column = page.locator("div.xl\\:col-span-3 > div:first-child")
        expect(first_column.locator(f"text={song_title}")).to_be_visible()

        # 6. Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        print("Verification script completed successfully.")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        # Take a screenshot on error for debugging
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
