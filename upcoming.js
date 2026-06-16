const { chromium } = require('playwright');
const fs = require('fs');

const SOURCES = [
  { type: 'movie', url: 'https://www.imdb.com/calendar/?region=US&type=MOVIE' },
  { type: 'series', url: 'https://www.imdb.com/calendar/?region=US&type=TV' },
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function warmup(page) {
  console.log('🌐 Opening IMDb homepage (challenge bypass)');
  await page.goto('https://www.imdb.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await page.waitForTimeout(6000);

  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(2000);

  console.log('✅ Homepage loaded');
}

function extractCalendar(sourceType) {

  const sections = document.querySelectorAll(
    'article[data-testid="calendar-section"]'
  );

  const result = [];

  for (const section of sections) {

    const dateEl = section.querySelector('h4.ipc-title__text');
    if (!dateEl) continue;

    const rawDate = dateEl.textContent.trim();
    const date = new Date(rawDate);
    if (isNaN(date)) continue;

    const items = section.querySelectorAll(
      'li[data-testid="coming-soon-entry"]'
    );

    for (const item of items) {

      const link = item.querySelector(
        'a.ipc-metadata-list-summary-item__t'
      );

      if (!link) continue;

      const href = link.getAttribute('href') || '';
      const idMatch = href.match(/tt\d+/);
      if (!idMatch) continue;

      let title = link.textContent.trim();

      title = title.replace(/\(\d{4}\)/, '').trim();

      const img = item.querySelector('img.ipc-image');

      let poster = null;

      if (img) {
        poster =
          img.getAttribute('src') ||
          img.getAttribute('data-src') ||
          null;

        if (poster) {
          poster = poster.replace(
            /@\._V1_.*?\.(jpg|png)/,
            '@._V1_UX500.jpg'
          );
        }
      }

      result.push({
        type: sourceType,
        date: date.toISOString().slice(0, 10),
        title,
        id: idMatch[0],
        url: 'https://www.imdb.com' + href.split('?')[0],
        poster
      });
    }
  }

  return result;
}


async function scrape(page, source) {

  console.log(`\n🔎 ${source.type} calendar`);

  await page.goto(source.url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await page.waitForTimeout(6000);

  await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  const count = await page.locator('a[href*="/title/tt"]').count();
  console.log(`ℹ️ title links: ${count}`);

  const items = await page.evaluate(extractCalendar);

  console.log(`✅ extracted: ${items.length}`);

  return items.map(x => ({ ...x, type: source.type }));
}

async function main() {

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',

    locale: 'en-US',

    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    },

    viewport: { width: 1440, height: 2000 }
  });

  const page = await context.newPage();

  await warmup(page);

  const all = [];

  for (const src of SOURCES) {
    const items = await scrape(page, src);
    all.push(...items);
    await sleep(2000);
  }

  all.sort((a,b) => a.date.localeCompare(b.date));

  fs.writeFileSync(
    'upcoming.json',
    JSON.stringify(all,null,2),
    'utf8'
  );

  console.log(`\n✅ saved ${all.length} items`);
  await browser.close();
}

main();
