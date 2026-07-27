// Thin UI only — all scraping runs in background.js so it survives this
// popup closing or losing focus. This file just sends messages and renders
// whatever state background.js reports back.

const statusEl = document.getElementById('status');
const badgeEl = document.getElementById('badge');
const btn = document.getElementById('scrapeBtn');
const scrapeAllBtn = document.getElementById('scrapeAllBtn');
const resetBtn = document.getElementById('resetBtn');

function render(state) {
  statusEl.textContent = state.log.length ? state.log.join('\n') : 'Idle.';
  statusEl.scrollTop = statusEl.scrollHeight;

  badgeEl.textContent = state.status;
  badgeEl.className = `badge ${state.status}`;

  const running = state.status === 'running';
  btn.disabled = running;
  scrapeAllBtn.disabled = running;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE') render(msg.state);
});

chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(render);

resetBtn.addEventListener('click', async () => {
  const state = await chrome.runtime.sendMessage({ type: 'RESET' });
  chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(render);
});

scrapeAllBtn.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'START_SCRAPE_ALL' });
  if (!res.ok && res.error === 'busy') {
    statusEl.textContent = 'A scrape is already running — check progress above.';
    return;
  }
  chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(render);
});

btn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://www.imdb.com/')) {
    statusEl.textContent = 'Open an IMDb chart page in this tab first.';
    return;
  }

  const res = await chrome.runtime.sendMessage({ type: 'START_SCRAPE_ACTIVE_TAB', tabId: tab.id });
  if (!res.ok && res.error === 'busy') {
    statusEl.textContent = 'A scrape is already running — check progress above.';
    return;
  }
  chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(render);
});
