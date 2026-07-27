const statusEl = document.getElementById('status');
const btn = document.getElementById('scrapeBtn');

function log(msg) {
  statusEl.textContent += `\n${msg}`;
  statusEl.scrollTop = statusEl.scrollHeight;
}

// Injected into the IMDb tab via chrome.scripting.executeScript.
// Must be fully self-contained: no references to anything outside this function.
function detectAndScrape(maxCount) {
  function detectPageType() {
    const path = location.pathname;
    if (path.startsWith('/chart/top/') || path === '/chart/top') {
      return { type: 'movies', filename: 'top250movies.json' };
    }
    if (path.startsWith('/chart/toptv/') || path === '/chart/toptv') {
      return { type: 'series', filename: 'top250series.json' };
    }
    return null;
  }

  function isChallengePage() {
    return document.title.includes('Human Verification') || !!document.querySelector('#captcha-container');
  }

  function extractItems() {
    const nodes = Array.from(document.querySelectorAll('li.ipc-metadata-list-summary-item'));
    return nodes.map((element, index) => {
      const safeText = (el) => (el ? el.textContent.trim() : null);
      const titleEl = element.querySelector('h3.ipc-title__text, h4.ipc-title__text');
      const linkEl = element.querySelector('a.ipc-title-link-wrapper');
      const imgEl = element.querySelector('img.ipc-image');
      const ratingEl = element.querySelector('span.ipc-rating-star--rating');
      const metaItems = element.querySelectorAll('ul.ipc-inline-list li.ipc-inline-list__item');

      const fullTitle = safeText(titleEl) || '';
      const rankMatch = fullTitle.match(/^(\d+)\.\s*(.*)$/);
      const rank = rankMatch ? parseInt(rankMatch[1], 10) : index + 1;
      const title = rankMatch ? rankMatch[2].trim() : fullTitle;

      const year = metaItems[0] ? metaItems[0].textContent.trim() : null;

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
      if (image) image = image.replace(/_V1_.*?\.(jpg|png|webp)/i, '_V1_UX500.jpg');

      return { rank, title, year, rate: rating, url: imdbUrl, image, id };
    }).filter((item) => item.title && item.url);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return (async () => {
    if (isChallengePage()) {
      return { ok: false, error: 'challenge' };
    }

    const pageInfo = detectPageType();
    if (!pageInfo) {
      return { ok: false, error: 'wrong-page' };
    }

    let count = document.querySelectorAll('li.ipc-metadata-list-summary-item').length;
    let retries = 0;
    while (count < maxCount && retries < 40) {
      window.scrollBy(0, window.innerHeight * 2);
      await wait(700);
      count = document.querySelectorAll('li.ipc-metadata-list-summary-item').length;
      retries++;
    }

    return { ok: true, type: pageInfo.type, filename: pageInfo.filename, items: extractItems() };
  })();
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = 'Working…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.startsWith('https://www.imdb.com/')) {
      log('Open an IMDb chart page in this tab first.');
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectAndScrape,
      args: [250],
    });

    if (!result || !result.ok) {
      if (result && result.error === 'challenge') {
        log('IMDb is showing a "Human Verification" page. Solve it in this tab, then click Scrape again.');
      } else if (result && result.error === 'wrong-page') {
        log('This tab is not a chart page. Open https://www.imdb.com/chart/top/ or https://www.imdb.com/chart/toptv/.');
      } else {
        log('Scrape failed for an unknown reason.');
      }
      return;
    }

    log(`Extracted ${result.items.length} ${result.type}.`);

    const json = JSON.stringify(result.items, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url,
      filename: result.filename,
      saveAs: true,
    });

    log(`Downloading ${result.filename} — save it over the matching file in your repo.`);
  } catch (err) {
    log(`Error: ${err.message || err}`);
  } finally {
    btn.disabled = false;
  }
});
