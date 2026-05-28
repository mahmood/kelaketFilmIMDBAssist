const { chromium } = require('playwright');
const fs = require('fs');

const SOURCES = [
  { type: 'movie', url: 'https://www.imdb.com/calendar/?region=US&type=MOVIE' },
  { type: 'series', url: 'https://www.imdb.com/calendar/?region=US&type=TV' },
];

const DEBUG_DIR = 'debug-calendar';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function saveDebug(page, sourceType, label) {
  try {
    ensureDir(DEBUG_DIR);

    const html = await page.content().catch(() => '');
    fs.writeFileSync(`${DEBUG_DIR}/${sourceType}-${label}.html`, html, 'utf8');

    const meta = [
      `TIME: ${new Date().toISOString()}`,
      `URL: ${page.url()}`,
      `TITLE: ${await page.title().catch(() => '')}`,
    ].join('\n');

    fs.writeFileSync(`${DEBUG_DIR}/${sourceType}-${label}.txt`, meta, 'utf8');
  } catch (err) {
    console.error(`⚠️ saveDebug failed for ${sourceType}/${label}: ${err.message}`);
  }
}

async function gotoWithRetry(page, url, sourceType, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`➡️ [${sourceType}] goto attempt ${attempt}/${maxAttempts}`);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      console.log(`✅ [${sourceType}] goto ok`);
      console.log(`📡 [${sourceType}] status: ${response ? response.status() : 'no response'}`);
      console.log(`🌍 [${sourceType}] final url: ${page.url()}`);
      console.log(`📄 [${sourceType}] title: ${await page.title().catch(() => '')}`);

      return response;
    } catch (err) {
      lastError = err;
      console.error(`❌ [${sourceType}] goto failed attempt ${attempt}: ${err.message}`);
      await saveDebug(page, sourceType, `goto-fail-attempt-${attempt}`);

      if (attempt < maxAttempts) {
        await sleep(2000 * attempt);
      }
    }
  }

  throw lastError;
}

function extractCalendarFromDocument(sourceType) {
    const DATE_RE = /^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}$/;
  
    function findNearestPreviousDate(el) {
      let node = el;
  
      while (node) {
        let sib = node.previousElementSibling;
  
        while (sib) {
          const heading =
            sib.matches?.('h3.ipc-title__text')
              ? sib
              : sib.querySelector?.('h3.ipc-title__text');
  
          if (heading) {
            const text = (heading.textContent || '').trim();
            if (DATE_RE.test(text)) return text;
          }
  
          sib = sib.previousElementSibling;
        }
  
        node = node.parentElement;
      }
  
      return null;
    }
  
    function getLargestSrcFromSrcset(srcset) {
      if (!srcset || typeof srcset !== 'string') return null;
  
      const parts = srcset
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((entry) => {
          const m = entry.match(/^(https?:\/\/\S+)\s+(\d+)w$/);
          if (!m) return null;
          return { url: m[1], width: Number(m[2]) };
        })
        .filter(Boolean);
  
      if (!parts.length) return null;
  
      parts.sort((a, b) => b.width - a.width);
      return parts[0].url;
    }
  
    function upscaleAmazonPoster(url) {
      if (!url || typeof url !== 'string') return null;
  
      // IMDb/Amazon image URLs usually look like:
      // ...@._V1_QL75_UX50_CR0,1,50,74_.jpg
      // Convert to a cleaner larger version:
      // ...@._V1_UX500.jpg
  
      return url.replace(/@\._V1_.*?\.(jpg|jpeg|png)$/i, '@._V1_UX500.jpg');
    }
  
    function findPosterNearElement(el) {
      if (!el) return null;
  
      const selectors = [
        'img.ipc-image',
        '[data-testid="poster"] img',
        '.ipc-poster img',
        'img',
      ];
  
      let node = el;
  
      while (node) {
        for (const sel of selectors) {
          const img = node.querySelector?.(sel);
          if (img) {
            const raw =
              getLargestSrcFromSrcset(img.getAttribute('srcset')) ||
              img.getAttribute('src') ||
              null;
  
            if (raw) return upscaleAmazonPoster(raw);
          }
        }
        node = node.parentElement;
      }
  
      return null;
    }
  
    function extractFromLink(a) {
      const href = a.getAttribute('href') || '';
      const idMatch = href.match(/tt\d+/);
      if (!idMatch) return null;
  
      const id = idMatch[0];
      const cleanHref = href.split('?')[0];
  
      let title = (a.textContent || '').trim();
      title = title.replace(/^\d+\.\s*/, '').trim();
      title = title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
  
      if (!title) return null;
  
      const rawDate = findNearestPreviousDate(a);
      if (!rawDate) return null;
  
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return null;
  
      const poster = findPosterNearElement(a);
  
      return {
        type: sourceType,
        date: date.toISOString().slice(0, 10),
        title,
        id,
        url: `https://www.imdb.com${cleanHref}`,
        poster,
      };
    }
  
    const result = [];
  
    // Pass 1: specific rows if present
    const rows = Array.from(document.querySelectorAll('li[data-testid="coming-soon-entry"]'));
  
    for (const row of rows) {
      const a =
        row.querySelector('a.ipc-metadata-list-summary-item__t[href*="/title/tt"]') ||
        row.querySelector('a[href*="/title/tt"]');
  
      if (!a) continue;
  
      const item = extractFromLink(a);
      if (item) {
        if (!item.poster) {
          item.poster = findPosterNearElement(row);
        }
        result.push(item);
      }
    }
  
    // Pass 2: fallback over all title links
    if (result.length === 0) {
      const links = Array.from(document.querySelectorAll('a[href*="/title/tt"]'));
  
      for (const a of links) {
        const item = extractFromLink(a);
        if (item) result.push(item);
      }
    }
  
    const seen = new Set();
    return result.filter((item) => {
      const key = `${item.type}|${item.date}|${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  

async function scrapeCalendarPage(page, sourceType, url) {
  console.log(`\n🔎 Scraping ${sourceType}: ${url}`);

  try {
    await gotoWithRetry(page, url, sourceType, 3);
    await sleep(4000);

    const title = await page.title().catch(() => '');
    const finalUrl = page.url();

    if (
      /captcha|robot|sign in|login|access denied|error/i.test(title) ||
      /captcha|signin|login/.test(finalUrl)
    ) {
      console.error(`❌ [${sourceType}] blocked/challenge page detected`);
      await saveDebug(page, sourceType, 'blocked');
      return [];
    }

    const linkCount = await page.locator('a[href*="/title/tt"]').count().catch(() => 0);
    const headingCount = await page.locator('h3.ipc-title__text').count().catch(() => 0);

    console.log(`ℹ️ [${sourceType}] title links: ${linkCount}`);
    console.log(`ℹ️ [${sourceType}] headings: ${headingCount}`);

    const items = await page.evaluate(extractCalendarFromDocument, sourceType);

    console.log(`✅ [${sourceType}] extracted items: ${items.length}`);

    if (items.length === 0) {
      await saveDebug(page, sourceType, 'zero-items');
    }

    return items;
  } catch (err) {
    console.error(`❌ [${sourceType}] scrape failed: ${err.message}`);
    await saveDebug(page, sourceType, 'fatal');
    return [];
  }
}

async function main() {
  ensureDir(DEBUG_DIR);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    viewport: { width: 1440, height: 2200 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(45000);

  const all = [];

  try {
    for (const source of SOURCES) {
      const items = await scrapeCalendarPage(page, source.type, source.url);
      all.push(...items);
      await sleep(2000);
    }

    all.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.title.localeCompare(b.title);
    });

    fs.writeFileSync('upcoming.json', JSON.stringify(all, null, 2), 'utf8');
    console.log(`\n✅ Saved ${all.length} items to upcoming.json`);
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
