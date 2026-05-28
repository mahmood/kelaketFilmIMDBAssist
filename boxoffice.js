const { chromium } = require('playwright');
const fs = require('fs');

function cleanBoxOfficeValue(value, type = '') {
  if (!value) return null;

  let v = value.replace(/\s+/g, ' ').trim();

  if (type === 'weekend') {
    v = v.replace(/^Weekend Gross:\s*/i, '').trim();
  }

  if (type === 'gross') {
    v = v.replace(/^Total Gross:\s*/i, '').trim();
  }

  if (type === 'weeks') {
    v = v.replace(/^Weeks Released:\s*/i, '').trim();
  }

  return v;
}

async function scrapeBoxOffice() {
  console.log('🚀 Launching browser for Box Office...');
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    viewport: { width: 1440, height: 1400 }
  });

  const page = await context.newPage();
  const url = 'https://www.imdb.com/chart/boxoffice/';

  console.log(`Navigating to ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('li.ipc-metadata-list-summary-item', { timeout: 30000 });

    const items = page.locator('li.ipc-metadata-list-summary-item');
    const count = await items.count();
    console.log(`Found ${count} box office items on page. Starting extraction...`);

    const boxOfficeData = await items.evaluateAll((nodes) => {
      const safeText = (el) => el ? el.textContent.trim() : null;

      return nodes.map((element, index) => {
        const titleEl = element.querySelector('h3.ipc-title__text, .ipc-title__text');
        const linkEl = element.querySelector('a[href*="/title/tt"]');
        const imgEl = element.querySelector('img');

        const fullTitle = safeText(titleEl) || '';
        const rankMatch = fullTitle.match(/^(\d+)\.\s*(.*)$/);

        const rank = rankMatch ? parseInt(rankMatch[1], 10) : index + 1;
        const title = rankMatch ? rankMatch[2].trim() : fullTitle;

        const href = linkEl ? linkEl.getAttribute('href') : null;
        const cleanHref = href ? href.split('?')[0] : null;
        const imdbUrl = cleanHref ? `https://www.imdb.com${cleanHref}` : null;

        const idMatch = cleanHref ? cleanHref.match(/tt\d+/) : null;
        const id = idMatch ? idMatch[0] : null;

        let poster = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null;
        if (poster) {
          poster = poster.replace(/_V1_.*?\.(jpg|png|webp)/i, '_V1_UX500.jpg');
        }

        const metadataItems = Array.from(
          element.querySelectorAll('ul li, .ipc-metadata-list-summary-item__tl li, .cli-title-metadata-item')
        )
          .map(li => li.textContent.trim())
          .filter(Boolean);

        let weekend = null;
        let gross = null;
        let weeks = null;

        if (metadataItems.length >= 3) {
          weekend = metadataItems[0] || null;
          gross = metadataItems[1] || null;
          weeks = metadataItems[2] || null;
        }

        return {
          rank,
          title,
          id,
          url: imdbUrl,
          poster,
          weekend,
          gross,
          weeks
        };
      }).filter(item => item.title && item.id);
    });

    const cleanedData = boxOfficeData.map(item => ({
      ...item,
      weekend: cleanBoxOfficeValue(item.weekend, 'weekend'),
      gross: cleanBoxOfficeValue(item.gross, 'gross'),
      weeks: cleanBoxOfficeValue(item.weeks, 'weeks'),
    }));

    console.log(`✅ Successfully extracted ${cleanedData.length} box office items.`);

    if (cleanedData.length >= 10) {
      fs.writeFileSync('boxoffice.json', JSON.stringify(cleanedData, null, 2), 'utf8');
      console.log('✅ File saved: boxoffice.json');
    } else {
      console.error('❌ Scrape failed or returned too few items. File was not updated.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error scraping box office:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

scrapeBoxOffice();
