from pathlib import Path
import time
from playwright.sync_api import sync_playwright
root = Path(__file__).parents[1]
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9224')
    pages = [page for context in browser.contexts for page in context.pages]
    page = next(page for page in pages if page.url.startswith('file:'))
    page.set_viewport_size({'width': 1120, 'height': 760})
    page.wait_for_selector('#library-view', state='attached')
    print('title',page.title(),'url',page.url)
    print('init',page.evaluate('window.fileSeek.call("init")'))
    fixture = str((root / 'demo/fixtures').resolve())
    print('add',page.evaluate('(root) => window.fileSeek.call("addRoot", {root})', fixture))
    page.reload(); page.click('#nav-library'); page.wait_for_selector('#scan')
    page.click('#scan')
    for _ in range(100):
        if page.locator('#index-state').text_content() == 'Complete': break
        time.sleep(.2)
    assert page.locator('#index-state').text_content() == 'Complete'
    page.click('#nav-search')
    page.fill('#query','cobalt autumn launch')
    page.click('.searchbox button')
    page.wait_for_selector('.result',timeout=10000)
    page.wait_for_timeout(1500)
    print('result count',page.locator('.result').count())
    print('first',page.locator('.result h3').first.text_content())
    assert page.locator('.result').count() >= 3
    assert page.locator('.result h3').first.text_content().endswith(('.txt','.docx','.pdf'))
    (root / 'media').mkdir(exist_ok=True)
    page.screenshot(path=str(root / 'media/screenshot.png'),full_page=True)
    page.click('#nav-library')
    page.screenshot(path=str(root / 'demo/library.png'),full_page=True)
    page.click('#nav-settings')
    page.screenshot(path=str(root / 'demo/settings.png'),full_page=True)
    print('screenshots ready')
    browser.close()
