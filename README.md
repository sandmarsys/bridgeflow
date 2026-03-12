# 🌉 BridgeFlow CRM — Deployment Guide

Your personal CRM, hosted for free, with Google Sheets auto-sync.

---

## What You Need
- A free [Netlify](https://netlify.com) account (takes 2 min to sign up)
- [Node.js](https://nodejs.org) installed on your computer (download the "LTS" version)
- The BridgeFlow files (this folder)

---

## Step 1 — Install & Build

Open **Terminal** (Mac) or **Command Prompt** (Windows), navigate to this folder, then run:

```bash
npm install
npm run build
```

This creates a `dist/` folder — that's your finished app, ready to deploy.

---

## Step 2 — Deploy to Netlify (free)

### Option A — Drag & Drop (easiest, no account linking needed)

1. Go to [app.netlify.com](https://app.netlify.com) and sign up / log in
2. From your dashboard, scroll down to the **"Deploy manually"** section
3. Drag and drop the **`dist`** folder onto the page
4. Netlify gives you a live URL instantly (e.g. `https://amazing-name-123.netlify.app`)
5. **Done!** Bookmark that URL — it's your BridgeFlow forever

### Option B — GitHub (best for updates)

1. Push this folder to a GitHub repository
2. In Netlify: **Add new site → Import from Git → GitHub**
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Click Deploy — Netlify auto-rebuilds whenever you push changes

---

## Step 3 — Connect Google Sheets (optional but recommended)

Once your site is live:

### 3a. Get a Google API Key
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project** → give it any name → Create
3. In the search bar, type **"Google Sheets API"** → click it → click **Enable**
4. Go to **APIs & Services → Credentials → + Create Credentials → API Key**
5. Copy the key that appears

### 3b. Create your Google Sheet
1. Go to [sheets.google.com](https://sheets.google.com) → create a blank sheet
2. Name it **"BridgeFlow"** (or anything you like)
3. Copy the **Spreadsheet ID** from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
   - Copy the bold part
4. Click **Share → Anyone with the link → Editor** → Done

### 3c. Connect in BridgeFlow
1. Open your live BridgeFlow URL
2. Click **⚙ Settings** in the top right
3. Paste your **API Key** and **Spreadsheet ID**
4. Click **Connect & Test**
5. You'll see a green **"Sheets connected"** dot in the nav bar

From this point on, every change you make syncs to your Google Sheet automatically within a few seconds. You can view all your contacts live at any time in Google Sheets.

---

## Updating BridgeFlow Later

When you come back to Claude and make UI changes:
1. Download the new `App.jsx` file Claude provides
2. Replace `src/App.jsx` in this folder with the new file
3. Run `npm run build` again
4. Re-drag the new `dist/` folder to Netlify (Option A), or just push to GitHub (Option B)

Your data in Google Sheets is never affected by updates.

---

## Your Data is Always Safe

| Scenario | What happens |
|---|---|
| Different browser or device | Open your Netlify URL — data loads from Google Sheets |
| Computer lost or broken | Open your Netlify URL on any device — everything is there |
| Want a manual backup | Settings → Export Backup → save the file to Google Drive |
| Netlify goes down (rare) | Your data is still safe in Google Sheets |

---

## Need Help?

Come back to this Claude conversation and ask — I can walk you through any step.
