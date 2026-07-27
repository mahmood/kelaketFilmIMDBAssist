# IMDb Top250 Manual Scraper (Chrome extension)

Fallback for when the headless Playwright scrapers (`movies.js` / `series.js`) get
blocked by IMDb's AWS WAF "Human Verification" challenge. This extension runs in
your own real, logged-in browser tab, so any bot-check is solved by you manually,
exactly like a normal visitor — the extension only reads the page DOM after it
has loaded.

## Install (unpacked)

1. Go to `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this `extension/` folder.

## Use

1. Navigate to `https://www.imdb.com/chart/top/` (movies) or
   `https://www.imdb.com/chart/toptv/` (series) in a normal tab.
2. If IMDb shows a "Human Verification" page, solve it yourself.
3. Once the chart is visible, click the extension icon, then "Scrape This Page".
4. Keep the popup open — it scrolls the page to load all 250 items before
   extracting data (~30-60s).
5. A save dialog opens for `top250movies.json` or `top250series.json`. Save it
   over the matching file at the repo root.

## Notes

- Output shape matches the existing scrapers exactly: `{ rank, title, year, rate, url, image, id }`.
- If the button reports a wrong-page or challenge error, re-check the tab and retry.
