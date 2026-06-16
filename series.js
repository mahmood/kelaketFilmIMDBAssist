const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeTop250Series() {
    console.log('🚀 Launching browser for Series...');
    const browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 1400 },
        locale: 'en-US',
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });

    const page = await context.newPage();
    const url = 'https://www.imdb.com/chart/toptv/?count=250';

    try {
        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await page.waitForSelector('li.ipc-metadata-list-summary-item', { timeout: 30000 });

        console.log('Scrolling to load all 250 series...');
        let currentCount = 0;
        let retries = 0;

        while (currentCount < 250 && retries < 20) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
            await page.waitForTimeout(1200);
            currentCount = await page.locator('li.ipc-metadata-list-summary-item').count();
            console.log(`Progress: ${currentCount}/250 loaded...`);
            retries++;
        }

        const items = page.locator('li.ipc-metadata-list-summary-item');
        const finalCount = await items.count();
        console.log(`Found ${finalCount} elements. Starting extraction...`);

        const seriesData = await items.evaluateAll((nodes) => {
            return nodes.map((element, index) => {
                const safeText = (el) => el ? el.textContent.trim() : null;

                const titleEl = element.querySelector('h4.ipc-title__text, h3.ipc-title__text');
                const linkEl = element.querySelector('a.ipc-title-link-wrapper');
                const imgEl = element.querySelector('img.ipc-image');
                const ratingEl = element.querySelector('span.ipc-rating-star--rating');
                const metaItems = element.querySelectorAll('ul.ipc-inline-list li.ipc-inline-list__item');

                const fullTitle = safeText(titleEl) || '';
                const rankMatch = fullTitle.match(/^(\d+)\.\s*(.*)$/);

                const rank = rankMatch ? parseInt(rankMatch[1], 10) : index + 1;
                const title = rankMatch ? rankMatch[2].trim() : fullTitle;

                let year = null;
                if (metaItems && metaItems.length > 0) {
                    year = metaItems[0].textContent.trim(); // مثل: 2008–2013 یا 2018–
                }

                let rating = null;
                if (ratingEl) {
                    const rateMatch = ratingEl.textContent.trim().match(/(\d+(\.\d+)?)/);
                    rating = rateMatch ? parseFloat(rateMatch[1]) : null;
                }

                const href = linkEl ? linkEl.getAttribute('href') : null;
                const cleanHref = href ? href.split('?')[0] : null;
                const imdbUrl = cleanHref ? `https://www.imdb.com${cleanHref}` : null;

                const idMatch = cleanHref ? cleanHref.match(/tt\d+/) : null;
                const id = idMatch ? idMatch[0] : null;

                let image = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null;
                if (image) {
                    image = image.replace(/_V1_.*?\.(jpg|png|webp)/i, '_V1_UX500.jpg');
                }

                return { rank, title, year, rate: rating, url: imdbUrl, image, id };
            }).filter(item => item.title && item.url);
        });

        console.log(`✅ Successfully extracted ${seriesData.length} series.`);

        if (seriesData.length > 200) {
            fs.writeFileSync('top250series.json', JSON.stringify(seriesData, null, 2), 'utf8');
            console.log('✅ File saved: top250series.json');
        } else {
            console.error('❌ Scrape failed or returned too few items.');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ An error occurred:', error);
        process.exit(1);
    } finally {
        console.log('Closing browser...');
        await browser.close();
    }
}

scrapeTop250Series();
