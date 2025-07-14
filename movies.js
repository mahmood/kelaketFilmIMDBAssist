// Filename: imdb_scraper_with_images.js

const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeTop250Movies() {
    console.log('🚀 Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
    });
    const page = await context.newPage();

    const url = 'https://www.imdb.com/chart/top/';
    console.log(`Navigating to ${url}`);

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Page loaded. Starting to scroll to load all movies...');
        await autoScroll(page);

        console.log('Scrolling complete. Scraping all 250 movies...');
        const movieSelector = '[data-testid="chart-layout-main-column"] ul > li';
        await page.waitForSelector(movieSelector, { state: 'visible', timeout: 10000 });

        const moviesData = await page.locator(movieSelector).evaluateAll((movieItems) => {
            const movies = [];
            movieItems.forEach(element => {
                try {
                    const titleElement = element.querySelector('h3.ipc-title__text');
                    const linkElement = element.querySelector('a.ipc-title-link-wrapper');

                    const fullTitle = titleElement ? titleElement.innerText : '';
                    const rankMatch = fullTitle.match(/^(\d+)\./);
                    const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
                    const title = titleElement ? fullTitle.replace(/^\d+\.\s*/, '') : 'N/A';

                    const metadataElements = element.querySelectorAll('.cli-title-metadata-item');
                    const year = metadataElements[0] ? parseInt(metadataElements[0].innerText, 10) : null;

                    const ratingElement = element.querySelector('.ipc-rating-star');
                    const rating = ratingElement ? parseFloat(ratingElement.innerText.split('\n')[0]) : null;

                    const imdbUrl = linkElement ? `https://www.imdb.com${linkElement.getAttribute('href')}` : null;

                    // **NEW: Get the poster image URL**
                    const imageElement = element.querySelector('img');
                    const image = imageElement ? imageElement.src : null;

                    const image_bigger = image.replace(/_V1[\s\S][^.jpg]+/, 'UX500');

                    const idMatch = linkElement.getAttribute('href').match(/tt\d+/);
                    const id = idMatch ? idMatch[0] : null;

                    if (rank && title) {
                        movies.push({ rank, title, year, rate: rating, url: imdbUrl, image: image_bigger, id });
                    }
                } catch (e) {
                    // Ignore errors for non-movie elements
                }
            });
            return movies;
        });

        console.log(`Successfully scraped ${moviesData.length} movies.`);

        fs.writeFileSync('top250movies.json', JSON.stringify(moviesData, null, 2));
        console.log('✅ Data saved');

        return moviesData;

    } catch (error) {
        console.error('❌ An error occurred during scraping:', error);
    } finally {
        console.log('Closing browser...');
        await browser.close();
    }
}

/**
 * Helper function to scroll to the bottom of the page.
 */
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 200;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        });
    });
}

// Run the scraper
scrapeTop250Movies();