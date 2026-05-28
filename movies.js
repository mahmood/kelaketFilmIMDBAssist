const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeTop250Movies() {
    console.log('🚀 Launching browser...');
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
    
    // اضافه کردن count=250 برای مجبور کردن IMDb به نمایش تمام لیست در یک صفحه
    const url = 'https://www.imdb.com/chart/top/?count=250';

    console.log(`Navigating to ${url}`);

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // اطمینان از اینکه لیست لود شده است
        await page.waitForSelector('li.ipc-metadata-list-summary-item', { timeout: 30000 });

        console.log('Scrolling to load all 250 posters...');
        await autoScroll(page);

        const items = page.locator('li.ipc-metadata-list-summary-item');
        const count = await items.count();
        console.log(`Found ${count} elements on page.`);

        const moviesData = await items.evaluateAll((nodes) => {
            return nodes.map((element, index) => {
                const safeText = (el) => el ? el.textContent.trim() : null;

                const titleEl = element.querySelector('h3.ipc-title__text');
                const linkEl = element.querySelector('a[href*="/title/tt"]');
                const imgEl = element.querySelector('img');
                const metaEls = element.querySelectorAll('.cli-title-metadata-item');

                const fullTitle = safeText(titleEl) || '';
                // جدا کردن رتبه از عنوان (مثلا "1. The Shawshank Redemption")
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
                }

                const href = linkEl ? linkEl.getAttribute('href') : null;
                const cleanHref = href ? href.split('?')[0] : null;
                const imdbUrl = cleanHref ? `https://www.imdb.com${cleanHref}` : null;

                const idMatch = cleanHref ? cleanHref.match(/tt\d+/) : null;
                const id = idMatch ? idMatch[0] : null;

                let image = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null;
                if (image) {
                    // تبدیل به کیفیت بالا
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

        console.log(`✅ Successfully extracted ${moviesData.length} movies.`);
        
        fs.writeFileSync('top250movies.json', JSON.stringify(moviesData, null, 2), 'utf8');
        console.log('✅ File saved: top250movies.json');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await browser.close();
    }
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 800; // سرعت اسکرول بیشتر برای ۲۵۰ مورد
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

scrapeTop250Movies();
