// Owns the actual scraping work so it keeps running regardless of whether the
// popup is open, closed, or unfocused. The popup is just a thin UI that sends
// messages here and displays whatever state is persisted in chrome.storage.

const DEFAULT_STATE = { status: 'idle', log: [], startedAt: null, finishedAt: null };

async function getState() {
  const { scrapeState } = await chrome.storage.local.get('scrapeState');
  return scrapeState || DEFAULT_STATE;
}

async function setState(state) {
  await chrome.storage.local.set({ scrapeState: state });
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state }).catch(() => {
    // No popup listening right now — that's fine, state is persisted.
  });
  return state;
}

async function appendLog(state, line) {
  state.log = [...state.log, line].slice(-300);
  return setState(state);
}

// --- Injected into IMDb tabs via chrome.scripting.executeScript. ---
// Each must be fully self-contained: no references to anything outside itself.

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
    if (isChallengePage()) return { ok: false, error: 'challenge' };

    const pageInfo = detectPageType();
    if (!pageInfo) return { ok: false, error: 'wrong-page' };

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

// --- Orchestration (runs entirely in this background service worker). ---

function downloadJson(filename, data, saveAs) {
  const json = JSON.stringify(data, null, 2);
  const url = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(json)));
  return chrome.downloads.download({ url, filename, saveAs: !!saveAs });
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

async function runScrapeAll() {
  let state = await setState({ status: 'running', log: [], startedAt: Date.now(), finishedAt: null });

  const targets = [
    { key: 'movies', url: 'https://www.imdb.com/chart/top/', kind: 'chart', filename: 'top250movies.json' },
    { key: 'series', url: 'https://www.imdb.com/chart/toptv/', kind: 'chart', filename: 'top250series.json' },
    { key: 'boxoffice', url: 'https://www.imdb.com/chart/boxoffice/', kind: 'boxoffice', filename: 'boxoffice.json' },
    { key: 'upcoming-movie', url: 'https://www.imdb.com/calendar/?region=US&type=MOVIE', kind: 'upcoming', sourceType: 'movie' },
    { key: 'upcoming-series', url: 'https://www.imdb.com/calendar/?region=US&type=TV', kind: 'upcoming', sourceType: 'series' },
  ];

  const results = {};

  for (const target of targets) {
    state = await appendLog(state, `Opening ${target.url} …`);
    let tabId;
    try {
      tabId = await openTabAndLoad(target.url);
    } catch (err) {
      state = await appendLog(state, `✗ ${target.key}: failed to load (${err.message})`);
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
      state = await appendLog(state, `✗ ${target.key}: ${reason}`);
      continue;
    }

    state = await appendLog(state, `✓ ${target.key}: ${injResult.items.length} items`);
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

  state = await appendLog(state, 'Done. Files landed in your default Downloads folder — move whichever succeeded into the repo root, then commit and push.');
  await setState({ ...state, status: 'done', finishedAt: Date.now() });
}

async function runScrapeSingleTab(tabId) {
  let state = await setState({ status: 'running', log: [], startedAt: Date.now(), finishedAt: null });
  state = await appendLog(state, 'Scraping current tab …');

  let result;
  try {
    const [{ result: r }] = await chrome.scripting.executeScript({ target: { tabId }, func: detectAndScrape, args: [250] });
    result = r;
  } catch (err) {
    result = { ok: false, error: 'exec-failed', message: err.message };
  }

  if (!result || !result.ok) {
    const reason = result && result.error === 'challenge'
      ? 'IMDb is showing a "Human Verification" page. Solve it in this tab, then click Scrape again.'
      : result && result.error === 'wrong-page'
        ? 'This tab is not a chart page. Open https://www.imdb.com/chart/top/ or https://www.imdb.com/chart/toptv/.'
        : (result && result.message) || 'Scrape failed for an unknown reason.';
    state = await appendLog(state, `✗ ${reason}`);
    await setState({ ...state, status: 'error', finishedAt: Date.now() });
    return;
  }

  state = await appendLog(state, `Extracted ${result.items.length} ${result.type}.`);
  await downloadJson(result.filename, result.items, true);
  state = await appendLog(state, `Downloading ${result.filename} — save it over the matching file in your repo.`);
  await setState({ ...state, status: 'done', finishedAt: Date.now() });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    getState().then(sendResponse);
    return true;
  }

  if (msg.type === 'START_SCRAPE_ALL' || msg.type === 'START_SCRAPE_ACTIVE_TAB') {
    getState().then((state) => {
      if (state.status === 'running') {
        sendResponse({ ok: false, error: 'busy' });
        return;
      }
      sendResponse({ ok: true });
      if (msg.type === 'START_SCRAPE_ALL') {
        runScrapeAll().catch((err) => setState({ status: 'error', log: [`Error: ${err.message}`], startedAt: Date.now(), finishedAt: Date.now() }));
      } else {
        runScrapeSingleTab(msg.tabId).catch((err) => setState({ status: 'error', log: [`Error: ${err.message}`], startedAt: Date.now(), finishedAt: Date.now() }));
      }
    });
    return true;
  }

  if (msg.type === 'RESET') {
    setState(DEFAULT_STATE).then(() => sendResponse({ ok: true }));
    return true;
  }
});
