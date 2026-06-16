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
        // استفاده از networkidle برای اطمینان از لود شدن دیتاهای اولیه
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        await page.waitForSelector('li.ipc-metadata-list-summary-item', { timeout: 30000 });

        console.log('Scrolling to load all 250 series...');
        
        // اصلاح شده: اسکرول هوشمند تا لود شدن کامل لیست
        let currentCount = 0;
        let retries = 0;
        while (currentCount < 250 && retries < 20) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
            await page.waitForTimeout(1500); // زمان کافی برای لود شدن Chunk بعدی
            
            currentCount = await page.locator('li.ipc-metadata-list-summary-item').count();
            console.log(`Progress: ${currentCount}/250 loaded...`);
            
            if (currentCount >= 250) break;
            retries++;
        }

        const items = page.locator('li.ipc-metadata-list-summary-item');
        const finalCount = await items.count();
        console.log(`Found ${finalCount} elements. Starting extraction...`);

        const seriesData = await items.evaluateAll((nodes) => {
            return nodes.map((element, index) => {
                const safeText = (el) => el ? el.textContent.trim() : null;

                // سلکتورهای بهینه‌سازی شده برای نسخه 2024-2025 IMDb
                const titleEl = element.querySelector('h3.ipc-title__text');
                const linkEl = element.querySelector('a.ipc-title-link-wrapper');
                const imgEl = element.querySelector('.ipc-image');
                const metaEls = element.querySelectorAll('.cli-title-metadata-item');
                const ratingEl = element.querySelector('span[aria-label^="IMDb rating"]');

                const fullTitle = safeText(titleEl) || '';
                const rankMatch = fullTitle.match(/^(\d+)\.\s*(.*)$/);

                const rank = rankMatch ? parseInt(rankMatch[1], 10) : index + 1;
                const title = rankMatch ? rankMatch[2].trim() : fullTitle;

                // استخراج سال (معمولاً اولین آیتم در متا دیتا)
                const yearText = metaEls[0] ? metaEls[0].textContent.trim() : null;
                
                // استخراج امتیاز (پاکسازی متن امتیاز از پرانتزها)
                let rating = null;
                if (ratingEl) {
                    const rateMatch = ratingEl.textContent.match(/(\d+(\.\d+)?)/);
                    rating = rateMatch ? parseFloat(rateMatch[1]) : null;
                }

                const href = linkEl ? linkEl.getAttribute('href') : null;
                const cleanHref = href ? href.split('?')[0] : null;
                const imdbUrl = cleanHref ? `https://www.imdb.com${cleanHref}` : null;

                const idMatch = cleanHref ? cleanHref.match(/tt\d+/) : null;
                const id = idMatch ? idMatch[0] : null;

                // اصلاح کیفیت تصویر به سایز بزرگتر (UX500)
                let image = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null;
                if (image) {
                    image = image.replace(/_V1_.*?\.(jpg|png|webp)/i, '_V1_UX500.jpg');
                }

                return { rank, title, year: yearText, rate: rating, url: imdbUrl, image, id };
            }).filter(item => item.title && item.url);
        });

        console.log(`✅ Successfully extracted ${seriesData.length} series.`);

        if (seriesData.length > 200) {
            fs.writeFileSync('top250series.json', JSON.stringify(seriesData, null, 2), 'utf8');
            console.log('✅ File saved: top250series.json');
        } else {
            console.error('❌ Scrape failed or returned too few items. Check selectors.');
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
