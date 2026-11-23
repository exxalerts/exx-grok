# exx.grok (live app for Google Chrome)

**exx.grok** is a live version of the EXXAlerts dashboard. It runs on your own computer or on a hosted link you can share with coworkers, and it opens in Chrome like an app.

- **Trending now** at the bottom: the current top 10 topics each on X, Facebook and Instagram, shown as compact two-column lists in source order (not filtered to the account). Each row has a View link plus Short / Long generate buttons and Publish.
- **Top 5 posts this week** from @EXXAlerts, as square cards
- **National news** (blue): latest from Fox News, CNN, ABC, NBC, The Independent, Axios, The Hill and AP, newest first, with photos
- **Local stories** (green): fresh local stories picked by AI to match what does well on @EXXAlerts (bodycam/911/video, bizarre crime, place tags, outrage), with a "why it fits" note
- **X feed** (gray): latest posts from @EricLDaugh, @LeadingReport, @CollinRugg, @Breaking911, @NickSortor
- On every card: **Generate short post** / **Generate long post** (written live in your style), an editable box with a 280 counter, **Reset draft**, **Regenerate**, **Copy**, photo/video upload with preview, **Generate Video**, and **Publish**. Publish shows the exact text and media first and only posts when you click Post.
- Refreshes every 10 minutes on its own, plus a Refresh button.

---

## What you need

| Thing | Needed for | Where |
|---|---|---|
| Node.js 20 or newer | Running the app | https://nodejs.org (pick "LTS") |
| Google Chrome | Using the app | https://google.com/chrome |
| xAI API key | AI drafts, smart Local picks, video footage ideas | https://console.x.ai |
| X API keys | X feed, live Top 5, Publish | https://console.x.com (the X Developer Console, linked from developer.x.com) |

**The news columns work with no keys at all.** Add keys whenever you're ready. The app tells you at the top what's missing.

---

## Setup (about 15 minutes)

1. **Install Node.js.** Go to https://nodejs.org, download the LTS version, and run the installer with the default options.
2. **Unzip** `exxalerts-app.zip` somewhere easy, like your Desktop. You'll get a folder called `exxalerts-app` (the app itself is named exx.grok).
3. **Open a terminal in that folder.**
   - Windows: open the folder, click the address bar, type `cmd` and press Enter.
   - Mac: right-click the folder, then choose **New Terminal at Folder**.
4. Type `npm install` and press Enter. It finishes right away, because the app has no extra packages.
5. **Make your settings file.** Copy `.env.example` and name the copy `.env`.
   - Windows: `copy .env.example .env`
   - Mac: `cp .env.example .env`
6. Open `.env` in Notepad (Windows) or TextEdit (Mac) and paste in your keys (see below). Save it.
7. Type `npm start` and press Enter. Leave that window open. Closing it stops the app.
8. Open Chrome and go to **http://localhost:5177**
9. **Install it as an app (optional):** click **⤓ Install app** in the top bar, or the install icon at the right end of Chrome's address bar. It then opens in its own window and shows up in your Start menu, Dock or Launchpad. Keep `npm start` running whenever you use it.

**Shortcut:** after step 6 you can double-click `Start EXXAlerts (Windows).bat` (Windows) or `start-mac.command` (Mac). It starts exx.grok and opens Chrome for you. On a Mac, the first time, right-click the file and choose Open.

**Check your setup:** run `npm run check`. It tests the news feeds, your AI key and your X keys, and posts nothing. The X check costs about one cent.

---

## Getting your keys

### xAI key (AI writing)
1. Go to https://console.x.ai and sign in with your X account.
2. Add credits under **Billing**. A few dollars lasts a long time.
3. Open **API Keys**, click **Create API Key**, and copy the key.
4. In `.env`, set `AI_API_KEY=` to your key. Leave `AI_BASE_URL=https://api.x.ai/v1` and `AI_MODEL=grok-4.3` as they are.
   (Any OpenAI-compatible service works too: change `AI_BASE_URL` and `AI_MODEL`.)

### X API keys (X feed, Top 5, Publish)
1. Go to https://console.x.com (you can also get there from developer.x.com). Sign in **as @EXXAlerts** and accept the Developer Agreement.
2. Click **New App** (or **Create App**). Copy the **API Key / Consumer Key** and **API Secret / Secret Key** right away, because they're only shown once. Then copy the **Bearer Token**.
3. Open the app, find **User authentication settings**, and click **Set up**:
   - App permissions: **Read and write**
   - Type of App: **Web App, Automated App or Bot**
   - Callback URL: `http://127.0.0.1`, Website: any website you own
   - Save.
4. Back on **Keys and tokens**, generate the **Access Token and Secret**. Do this *after* step 3, or the token can't post.
5. Go to **Billing → Credits**, buy credits, and set a **spending limit**. With no credits, nothing works, not even reads.
6. Put all five values in `.env`: `X_BEARER_TOKEN`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.
7. Restart the app: press Ctrl+C in the terminal, then `npm start` again.

Want to test Publish without really posting? Set `DRY_RUN=1` in `.env`.

---

## What it costs (checked Nov 23, 2026)

**X API:** X no longer sells monthly plans (Basic and Pro are gone). It's **pay-per-use**: you prepay credits at console.x.com, there's no minimum, and you can set a spending cap. Current listed prices:

| Action | Price |
|---|---|
| Publishing a post | **$0.015** |
| Publishing a post that contains a link | **$0.20**. The app warns you when your text has a link. |
| Reading a post from other accounts (X feed) | $0.005 per post |
| Reading your own posts (Top 5, "owned reads") | $0.001 per post |
| Looking up an account | $0.010 each (the app looks each one up once per start) |
| US trending topics (`GET /2/trends/by/woeid/23424977`) | **$0.010 per request**. Deduplication does not apply, so every refresh is billed. |

The same post read twice in one day (UTC) is only billed once. The app only asks X for **new** posts on each refresh.

**Rough monthly cost if the app runs all day, every day:**
- X feed (5 busy accounts, about 200 to 250 new posts a day): about $1 to $1.25 a day, or **$30 to $40 a month**. To cut this, raise `X_FEED_REFRESH_MIN` (for example to 30).
- Trending now (one US trends call every 15 minutes, `TRENDS_REFRESH_MIN`): about **$0.96 a day** if the app runs 24/7, or about **$29 a month**. This is on top of the X feed. Raise `TRENDS_REFRESH_MIN` (for example to 30 or 60) to spend less. If the Trends endpoint is not on your plan, the app skips it and does not keep retrying in a tight loop.
- Top 5 (about 150 of your own posts, refreshed hourly): about **$5 a month** at most
- Publishing 20 posts a day with no links: about **$9 a month**
- xAI (grok-4.3 costs $1.25 per million input tokens and $2.50 per million output): the AI Local pick every 10 minutes is about **$0.50 to $1 a day** if left running. Each draft costs under a cent.

The app only uses credits while `npm start` is running. Close the window when you're done for the day to stop spending.

Posts over 280 characters (long posts) only work if @EXXAlerts has **X Premium**. Videos over 2 minutes 20 seconds also need Premium.

---

## Generate Video: what it can and can't do

- **Find footage + plan:** the AI suggests exact searches, such as the agency name plus "bodycam" plus the date, and names the accounts or channels that usually post that footage. You get one-click YouTube, X and Google Video searches, plus caption ideas.
- **It can't download news footage for you.** Bodycam, 911 audio and TV clips belong to police departments and stations. Download a clip you're allowed to use, add it in the pop-up, and the app adds your captions, the ALERT badge, the source credit and @EXXAlerts.
- **Build video:** made right in Chrome from the story photo, your photos and clips, and caption lines (one per scene). It comes in square, landscape or vertical. Chrome on Windows and Mac records X-ready MP4 directly. Keep the tab in front while it builds.
- **Attach to post** puts the finished video on your draft, ready to publish.

---

## Keyboard shortcuts
`/` search · `R` refresh · `1` `2` `3` jump to a column · `J` / `K` next or previous card · `S` / `L` short or long draft for the selected card · `V` video · `Ctrl/⌘+Enter` publish while typing · `?` help · `Esc` close

## Trending now: where the lists come from

- **X:** the official X Trends API for the United States (`GET /2/trends/by/woeid/23424977`), shown in the API's own order, up to 10 topics. Post counts are shown only when X sends them. If your keys are missing or the endpoint is not on your plan, the X column falls back to the US Google Trends list and labels it as a stand-in, with no fake X post counts.
- **Facebook and Instagram have no public trending API.** Those two columns use the [Google Trends US RSS feed](https://trends.google.com/trending/rss?geo=US) as a stand-in, clearly labeled, and show that feed's current topics in source order. Search-volume bands such as "50,000+" come from Google Trends, not from Meta. The app never invents engagement numbers.
- Topics are **not** filtered or re-ranked for @EXXAlerts. The lists are the source top 10 as-is.
- The lists refresh every 15 minutes by default (`TRENDS_REFRESH_MIN`).

## Good to know
- AP and some other sites block automated readers, so a few cards show without a photo or summary. Drafts for those are written from the headline. Always check names and numbers before posting.
- Your keys stay in `.env`. Never share that file or paste keys in chat. Anyone with those keys can post as @EXXAlerts.
- For local use, the app stays on this computer (localhost) unless you set `HOST` and `APP_PASSWORD`.
- Settings you can change in `.env`: the shared password, refresh times, the accounts in the X feed, the port, and the AI model.

---

## Share with coworkers (password-protected)

Coworkers open one link, type the shared password, and get full access — including **Publish to @EXXAlerts**. Anyone with the password can post as the account and spend your X and AI credits. Pick a strong password and only give it to people you trust. Each person stays signed in for 30 days, or until they click **Log out**.

### 1. Turn the password on

In `.env` set:

```
APP_PASSWORD=a-long-password-only-your-team-knows
SESSION_SECRET=another-long-random-string
```

`SESSION_SECRET` keeps people signed in across restarts. If you skip it, everyone has to log in again whenever the app restarts. Restart the app after you save the file.

On your own computer, that only adds a login screen at http://localhost:5177. To put the app on the internet, host it with the steps below. The app will not listen on a public address unless `APP_PASSWORD` is set.

### 2. Host it (recommended: Render, free)

The included `Dockerfile` and `render.yaml` are set up for [Render](https://render.com). This is the simplest way to get a stable https link. You will need a Render account (you can sign up with GitHub or email). A credit card is not required for the free web service.

**Important limits of Render's free plan (checked Nov 23, 2026):**
- The app **goes to sleep after 15 minutes** with no visitors. The next person waits about a minute for it to wake. While it is asleep, the 10-minute refresh timers do not run, so the news and X feed are stale until someone opens it again.
- Each workspace gets **750 free hours per month**. If the app stays awake all month (~720–744 hours) you can bump into that cap and it will pause until the next month.
- Files on disk are wiped when it sleeps or restarts. That is fine; the app can rebuild its cache.

**Steps:**

1. Create a **private** GitHub repository and upload this folder to it. Do **not** add your `.env` file, `node_modules`, or the `data` folder (they are already in `.gitignore`).
2. Sign up at [render.com](https://render.com) and log in.
3. Click **New**, then **Blueprint**. Connect the private GitHub repo. Render reads `render.yaml` and creates a free web service named `exx-grok`.
4. When Render asks for secret environment variables (they are marked so they are not stored in the file), paste:
   - `APP_PASSWORD` — the shared team password
   - `SESSION_SECRET` — a long random string
   - `AI_API_KEY`
   - `X_BEARER_TOKEN`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`
5. Deploy. When it finishes, Render gives you a link like `https://exx-grok.onrender.com`. That is the link you share. Send coworkers the password in a separate message, not in the same place as the link if you can help it.

To run it only on your Mac instead, see "Other hosting options" in the notes that came with this build, or keep using http://localhost:5177.

### 3. What coworkers do

Open the link in Chrome, type the shared password, and click **Log in**. They can install it as a Chrome app from the button in the top bar. Click **Log out** when they are done on a shared computer.
