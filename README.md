```md
# 🎬 IMDb Top 250 Scraper

A simple automated scraper for fetching IMDb Top 250 **Movies** and **TV Series** using **Playwright**, with daily updates powered by **GitHub Actions** and optional **Telegram notifications**.

## ✨ Features

- Scrapes IMDb Top 250 **movies**
- Scrapes IMDb Top 250 **TV series**
- Saves results as local JSON files
- Automatically runs every day using **GitHub Actions**
- Commits and pushes updated data back to the repository
- Sends **Telegram notifications** on success or failure
- Uses a more reliable Playwright loading strategy for CI environments

---

## 📁 Output Files

The scraper generates:

- `top250movies.json`
- `top250series.json`

---

## ⚙️ Tech Stack

- [Node.js](https://nodejs.org/)
- [Playwright](https://playwright.dev/)
- [GitHub Actions](https://github.com/features/actions)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

## 📦 Installation

Clone the repository and install dependencies:

```bash
npm install
```

Install Playwright Chromium:

```bash
npx playwright install --with-deps chromium
```

---

## 🚀 Run Locally

Run both scrapers manually:

```bash
node movies.js
node series.js
```

After running, the generated JSON files will be updated in the project root.

---

## 🧠 Scraping Strategy

To avoid timeout issues in CI environments like GitHub Actions, the scraper uses:

- `waitUntil: 'domcontentloaded'`
- explicit `waitForSelector(...)`

instead of relying on:

- `waitUntil: 'networkidle'`

This makes the workflow more stable and reliable on headless runners.

Additionally, the scripts include a safety check to avoid saving incomplete results if the scraped dataset is unexpectedly small.

---

## 🤖 GitHub Actions Automation

This project includes a workflow that runs automatically every day.

### Schedule

The workflow runs daily at:

- **03:00 UTC**
- **06:30 AM Tehran time** (UTC+3:30)

It can also be triggered manually from the **Actions** tab using `workflow_dispatch`.

### Workflow File

```text
.github/workflows/update-imdb-data.yml
```

### What the workflow does

1. Checks out the repository
2. Sets up Node.js
3. Installs dependencies
4. Installs Playwright Chromium
5. Runs the movie and series scrapers
6. Detects changes in generated JSON files
7. Commits and pushes updates to the repository
8. Sends a Telegram notification with run status

---

## 🔐 Required GitHub Secrets

If you want Telegram notifications to work, add these secrets in:

**Repository → Settings → Secrets and variables → Actions**

### Required secrets

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

---

## 📲 Telegram Notifications

The workflow can send Telegram messages after each run.

### Success message includes:

- run status
- repository name
- branch name
- trigger actor
- event type
- movies count
- series count
- file sizes
- top movie
- top series
- run URL
- commit URL

### Failure message includes:

- failure status
- repository name
- branch name
- actor
- event type
- logs URL
- commit URL

---

## 🛠 Telegram Bot Setup

### 1. Create a bot

Use [@BotFather](https://t.me/BotFather) on Telegram:

- send `/newbot`
- choose a name
- choose a username
- copy the bot token

### 2. Get your chat ID

Send a message to your bot, then open:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

If needed, first delete any webhook:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook
```

Then use the returned `chat.id` as your `TELEGRAM_CHAT_ID`.

---

## 📂 Project Structure

```text
.
├── movies.js
├── series.js
├── top250movies.json
├── top250series.json
├── package.json
└── .github
    └── workflows
        └── update-imdb-data.yml
```

---

## ✅ Notes

- GitHub Actions cron schedules use **UTC**
- The workflow uses `git pull --rebase` before pushing to reduce push conflicts
- Notifications are optional, but recommended for monitoring
- The scraper is optimized for headless CI usage

---

## ▶️ Manual Trigger

You can manually run the workflow from GitHub:

1. Open the repository
2. Go to the **Actions** tab
3. Select the workflow
4. Click **Run workflow**

---

## 🧪 Troubleshooting

### Timeout issues
If Playwright times out in CI:

- avoid `networkidle`
- use `domcontentloaded`
- wait for the actual list selector explicitly

### Push rejected
If GitHub Actions fails to push due to remote changes, make sure your workflow includes:

```bash
git pull --rebase origin "${GITHUB_REF_NAME}"
```

### Telegram message not sent
Check:

- `TELEGRAM_BOT_TOKEN` is valid
- `TELEGRAM_CHAT_ID` is correct
- the bot has already received at least one message from you

---

## 📌 Example Use Cases

- Keep a public snapshot of IMDb Top 250 data
- Use the JSON files in another project or API
- Track ranking changes over time
- Power a Telegram bot, website, or dashboard

---

## 📄 License

This project is for educational and automation purposes.  
Make sure your usage complies with IMDb’s terms of service.
