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

The actual scraping runs in `background.js` (the extension's persistent
service worker), not in the popup. That means once you click a Scrape button
you can close the popup, click elsewhere, or open other tabs — the job keeps
running. Reopen the popup any time to see live progress; it's a thin UI that
just reads/writes state, not the thing doing the work.

## Use: one page at a time

1. Navigate to `https://www.imdb.com/chart/top/` (movies) or
   `https://www.imdb.com/chart/toptv/` (series) in a normal tab.
2. If IMDb shows a "Human Verification" page, solve it yourself.
3. Once the chart is visible, click the extension icon, then "Scrape This Page".
4. It scrolls the page to load all 250 items before extracting data (~30-60s)
   — you can close the popup while this runs.
5. A save dialog opens for `top250movies.json` or `top250series.json`. Save it
   over the matching file at the repo root.

## Use: everything at once ("Scrape All")

Solve IMDb's human-verification page at least once in a normal tab first, so
this browser's cookies already carry a valid session — the button below opens
background tabs and can't solve a challenge itself.

Click the extension icon, then "Scrape All (4 files)". It opens each of these
in a background tab, waits for it to load, scrapes it, and closes it:

- `chart/top/` → `top250movies.json`
- `chart/toptv/` → `top250series.json`
- `chart/boxoffice/` → `boxoffice.json`
- `calendar/?type=MOVIE` + `calendar/?type=TV` → merged into `upcoming.json`

Whichever succeed are silently downloaded (no per-file save dialog) into your
browser's default Downloads folder using the exact repo filenames. If any page
still shows the human-verification challenge, that one file is skipped and the
status log tells you which — solve it manually and re-run, or use the
single-page flow above for just that one.

Move the downloaded files into the repo root, then `git add` / commit / push
to update the data — nothing here touches git for you.

## Notes

- Output shape matches the existing scrapers exactly (e.g. movies/series:
  `{ rank, title, year, rate, url, image, id }`).
- If a button reports a wrong-page or challenge error, re-check the tab and retry.
- "Clear" resets a stuck or finished status back to idle; it doesn't undo any
  downloads already made.
- Only one job (single-page or Scrape All) runs at a time — starting another
  while one is in progress is rejected until it finishes.
