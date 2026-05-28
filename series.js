const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeTop250Series() {
    console.log('🚀 Launching browser...');
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

    // مثل نسخه فیلم‌ها، count=250 اضافه شده
    const url = 'https://www.imdb.com/chart/toptv/?count=250';

    try {
        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        await page.waitForSelector('li.ipc-metadata-list-summary-item', { timeout: 30000 });

        console.log('Scrolling to load all 250 posters...');
        await autoScroll(page);

        const items = page.locator('li.ipc-metadata-list-summary-item');
        const count = await items.count();
        console.log(`Found ${count} elements. Starting extraction...`);

        const seriesData = await items.evaluateAll((nodes) => {
            return nodes.map((element, index) => {
                const safeText = (el) => el ? el.textContent.trim() : null;

                const titleEl = element.querySelector('h3.ipc-title__text');
                const linkEl = element.querySelector('a[href*="/title/tt"]');
                const imgEl = element.querySelector('img');
                const metaEls = element.querySelectorAll('.cli-title-metadata-item');

                const fullTitle = safeText(titleEl) || '';
                const rankMatch = fullTitle.match(/^(\d+)\.\s*(.*)$/);

                const rank = rankMatch ? parseInt(rankMatch[1], 10) : index + 1;
                const title = rankMatch ? rankMatch[2].trim() : fullTitle;

                const yearText = metaEls[0] ? metaEls[0].textContent.trim() : null;
                const yearMatch = yearText ? yearText.match(/\d{4}/) : null;
                const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

                let rating = null;
                const ratingEl = element.querySelector('.ipc-rating-star--rating');
                if (ratingEl) {
                    rating = parseFloat(ratingEl.textContent.trim());
                } else {
                    const allText = element.textContent || '';
                    const ratingMatch = allText.match(/(\d\.\d)\s*\(/);
                    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
                }

                const href = linkEl ? linkEl.getAttribute('href') : null;
                const cleanHref = href ? href.split('?')[0] : null;
                const imdbUrl = cleanHref ? `https://www.imdb.com${cleanHref}` : null;

                const idMatch = cleanHref ? cleanHref.match(/tt\d+/) : null;
                const id = idMatch ? idMatch[0] : null;

                let image = imgEl
                    ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src'))
                    : null;

                if (image) {
                    image = image.replace(/_V1_.*?\.(jpg|png|webp)/i, '_V1_UX500.jpg');
                }

                return {
                    rank,
                    title,
                    year,
                    rate: rating,
                    url: imdbUrl,
                    image,
                    id
                };
            }).filter(item => item.title && item.url);
        });

        console.log(`✅ Successfully scraped ${seriesData.length} series.`);
        fs.writeFileSync('top250series.json', JSON.stringify(seriesData, null, 2), 'utf8');
        console.log('✅ Data saved to top250series.json');

    } catch (error) {
        console.error('❌ An error occurred:', error);
    } finally {
        console.log('Closing browser...');
        await browser.close();
    }
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 800;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 150);
        });
    });
}

scrapeTop250Series();
