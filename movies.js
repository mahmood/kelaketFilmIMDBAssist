const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeTop250Movies() {
    console.log('🚀 Launching browser for Movies...');
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
    const url = 'https://www.imdb.com/chart/top/?count=250';

    console.log(`Navigating to ${url}`);

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // منتظر ماندن برای لود شدن اولین آیتم
        await page.waitForSelector('li.ipc-metadata-list-summary-item');

        console.log('Scrolling to load all 250 movies...');
        
        // اصلاح شده: اسکرول هوشمند تا زمانی که تعداد به 250 برسد
        let count = 0;
        while (count < 250) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
            await page.waitForTimeout(1000); // زمان برای لود شدن تیکه‌های جدید
            count = await page.locator('li.ipc-metadata-list-summary-item').count();
            console.log(`Loaded ${count}/250 movies...`);
            
            // جلوگیری از حلقه بی‌پایان در صورت بروز خطا
            if (count === 0) break; 
        }

        const items = page.locator('li.ipc-metadata-list-summary-item');
        const finalCount = await items.count();
        console.log(`Found ${finalCount} elements. Starting extraction...`);

        const moviesData = await items.evaluateAll((nodes) => {
            return nodes.map((element, index) => {
                const safeText = (el) => el ? el.textContent.trim() : null;

                // سلکتورهای دقیق‌تر برای نسخه جدید
                const titleEl = element.querySelector('.ipc-title-link-wrapper h3');
                const imgEl = element.querySelector('.ipc-image');
                const metaEls = element.querySelectorAll('.cli-title-metadata-item');
                const ratingEl = element.querySelector('span[aria-label^="IMDb rating"]');

                const fullTitle = safeText(titleEl) || '';
                const rankMatch = fullTitle.match(/^(\d+)\.\s*(.*)$/);

                return {
                    rank: rankMatch ? parseInt(rankMatch[1], 10) : index + 1,
                    title: rankMatch ? rankMatch[2].trim() : fullTitle,
                    year: metaEls[0] ? parseInt(metaEls[0].textContent.trim()) : null,
                    rate: ratingEl ? parseFloat(ratingEl.textContent.split('(')[0].trim()) : null,
                    url: element.querySelector('a.ipc-title-link-wrapper')?.href || null,
                    image: imgEl?.src || null,
                    id: element.querySelector('a.ipc-title-link-wrapper')?.href.match(/tt\d+/)?.[0] || null
                };
            }).filter(item => item.title && item.url);
        });

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
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

scrapeTop250Movies();
