const statusEl = document.getElementById('status');
const btn = document.getElementById('scrapeBtn');
const scrapeAllBtn = document.getElementById('scrapeAllBtn');

function log(msg) {
  statusEl.textContent += `\n${msg}`;
  statusEl.scrollTop = statusEl.scrollHeight;
}

function downloadJson(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  return chrome.downloads.download({ url, filename, saveAs: false });
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

// Injected into the box office tab. Mirrors boxoffice.js's extraction logic.
function scrapeBoxOfficePage() {
  function isChallengePage() {
    return document.title.includes('Human Verification') || !!document.querySelector('#captcha-container');
  }

  function cleanValue(value, type) {
    if (!value) return null;
    let v = value.replace(/\s+/g, ' ').trim();
    if (type === 'weekend') v = v.replace(/^Weekend Gross:\s*/i, '').trim();
    if (type === 'gross') v = v.replace(/^Total Gross:\s*/i, '').trim();
    if (type === 'weeks') v = v.replace(/^Weeks Released:\s*/i, '').trim();
    return v;
  }

  if (isChallengePage()) return { ok: false, error: 'challenge' };

  const nodes = Array.from(document.querySelectorAll('li.ipc-metadata-list-summary-item'));
  const items = nodes.map((element, index) => {
    const safeText = (el) => (el ? el.textContent.trim() : null);
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
    if (poster) poster = poster.replace(/_V1_.*?\.(jpg|png|webp)/i, '_V1_UX500.jpg');

    const metadataItems = Array.from(
      element.querySelectorAll('ul li, .ipc-metadata-list-summary-item__tl li, .cli-title-metadata-item')
    ).map((li) => li.textContent.trim()).filter(Boolean);

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
      weekend: cleanValue(weekend, 'weekend'),
      gross: cleanValue(gross, 'gross'),
      weeks: cleanValue(weeks, 'weeks'),
    };
  }).filter((item) => item.title && item.id);

  return { ok: true, items };
}

// Injected into the upcoming-calendar tab. Mirrors upcoming.js's extractCalendar logic.
function scrapeUpcomingPage(sourceType) {
  function isChallengePage() {
    return document.title.includes('Human Verification') || !!document.querySelector('#captcha-container');
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return (async () => {
    if (isChallengePage()) return { ok: false, error: 'challenge' };

    window.scrollBy(0, document.body.scrollHeight);
    await wait(2000);

    const sections = document.querySelectorAll('article[data-testid="calendar-section"]');
    const result = [];

    for (const section of sections) {
      const dateEl = section.querySelector('h4.ipc-title__text');
      if (!dateEl) continue;
      const rawDate = dateEl.textContent.trim();
      const date = new Date(rawDate);
      if (isNaN(date)) continue;

      const items = section.querySelectorAll('li[data-testid="coming-soon-entry"]');
      for (const item of items) {
        const link = item.querySelector('a.ipc-metadata-list-summary-item__t');
        if (!link) continue;
        const href = link.getAttribute('href') || '';
        const idMatch = href.match(/tt\d+/);
        if (!idMatch) continue;

        let title = link.textContent.trim();
        title = title.replace(/\(\d{4}\)/, '').trim();

        const img = item.querySelector('img.ipc-image');
        let poster = null;
        if (img) {
          poster = img.getAttribute('src') || img.getAttribute('data-src') || null;
          if (poster) poster = poster.replace(/@\._V1_.*?\.(jpg|png)/, '@._V1_UX500.jpg');
        }

        result.push({
          type: sourceType,
          date: date.toISOString().slice(0, 10),
          title,
          id: idMatch[0],
          url: 'https://www.imdb.com' + href.split('?')[0],
          poster,
        });
      }
    }

    return { ok: true, items: result };
  })();
}

function openTabAndLoad(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let tabId;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout loading ${url}`));
    }, timeoutMs);

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        cleanup();
        setTimeout(() => resolve(tabId), 2500);
      }
    }
    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.create({ url, active: false }).then((tab) => {
      tabId = tab.id;
    }).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

async function scrapeAll() {
  const targets = [
    { key: 'movies', url: 'https://www.imdb.com/chart/top/', kind: 'chart', filename: 'top250movies.json' },
    { key: 'series', url: 'https://www.imdb.com/chart/toptv/', kind: 'chart', filename: 'top250series.json' },
    { key: 'boxoffice', url: 'https://www.imdb.com/chart/boxoffice/', kind: 'boxoffice', filename: 'boxoffice.json' },
    { key: 'upcoming-movie', url: 'https://www.imdb.com/calendar/?region=US&type=MOVIE', kind: 'upcoming', sourceType: 'movie' },
    { key: 'upcoming-series', url: 'https://www.imdb.com/calendar/?region=US&type=TV', kind: 'upcoming', sourceType: 'series' },
  ];

  const results = {};

  for (const target of targets) {
    log(`Opening ${target.url} …`);
    let tabId;
    try {
      tabId = await openTabAndLoad(target.url);
    } catch (err) {
      log(`✗ ${target.key}: failed to load (${err.message})`);
      continue;
    }

    let injResult;
    try {
      if (target.kind === 'chart') {
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: detectAndScrape, args: [250] });
        injResult = result;
      } else if (target.kind === 'boxoffice') {
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: scrapeBoxOfficePage });
        injResult = result;
      } else {
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: scrapeUpcomingPage, args: [target.sourceType] });
        injResult = result;
      }
    } catch (err) {
      injResult = { ok: false, error: 'exec-failed', message: err.message };
    }

    await chrome.tabs.remove(tabId).catch(() => {});

    if (!injResult || !injResult.ok) {
      const reason = injResult && injResult.error === 'challenge'
        ? 'IMDb showed a Human Verification page — solve it manually in a normal tab, then retry'
        : (injResult && injResult.message) || 'unknown error';
      log(`✗ ${target.key}: ${reason}`);
      continue;
    }

    log(`✓ ${target.key}: ${injResult.items.length} items`);
    results[target.key] = injResult.items;
  }

  if (results.movies) await downloadJson('top250movies.json', results.movies);
  if (results.series) await downloadJson('top250series.json', results.series);
  if (results.boxoffice) await downloadJson('boxoffice.json', results.boxoffice);

  const upcoming = [...(results['upcoming-movie'] || []), ...(results['upcoming-series'] || [])];
  if (upcoming.length) {
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    await downloadJson('upcoming.json', upcoming);
  }

  log('Done. Downloaded files land in your default Downloads folder — move whichever succeeded into the repo root, then commit and push.');
}

scrapeAllBtn.addEventListener('click', async () => {
  scrapeAllBtn.disabled = true;
  btn.disabled = true;
  statusEl.textContent = 'Working…';
  try {
    await scrapeAll();
  } catch (err) {
    log(`Error: ${err.message || err}`);
  } finally {
    scrapeAllBtn.disabled = false;
    btn.disabled = false;
  }
});

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

    await chrome.downloads.download({ url, filename: result.filename, saveAs: true });

    log(`Downloading ${result.filename} — save it over the matching file in your repo.`);
  } catch (err) {
    log(`Error: ${err.message || err}`);
  } finally {
    btn.disabled = false;
  }
});
