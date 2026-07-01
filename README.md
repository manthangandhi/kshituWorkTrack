# WorkTrack

Premium task ledger for Google Sheets + GitHub Pages.

## What is here

- `index.html`, `styles.css`, `app.js`: multi-view dashboard, tasks, reports, history, and settings
- `config.js`: single place to set your Apps Script web app URL and Google Sheet URL
- `google-apps-script/Code.gs`: Google Sheets backend with task and audit history support

## Current behavior

- Dashboard view with KPI cards, analytics, and recent activity
- Tasks view for create/edit/delete and filtering
- Reports view for summary cards and chart ranges
- History view for audit trail entries
- Settings view for showing the backend-managed connection status

## Where To Put The URLs

Put both URLs in [`config.js`](/Users/manthangandhi/Documents/agents/kshituWorkTrack/config.js):

- `apiUrl`: your deployed Google Apps Script web app URL
- `sheetUrl`: your Google Sheet URL for the Open Sheet shortcut

That means your wife never has to type a URL on her phone. You set it once in the repo, then redeploy GitHub Pages.

## Google Sheets Setup

1. Create a Google Sheet.
2. Open `Extensions > Apps Script` from that sheet so the script is bound to the spreadsheet.
3. Paste the contents of [`google-apps-script/Code.gs`](/Users/manthangandhi/Documents/agents/kshituWorkTrack/google-apps-script/Code.gs).
4. Run `setupWorkTrack()` once from the Apps Script editor. Approve the permissions. This creates the `Tasks` and `History` sheets with headers.
5. Deploy the project as a web app.
6. Copy the deployed web app URL into `config.js` as `apiUrl`.
7. Copy the spreadsheet URL into `config.js` as `sheetUrl`.
8. Deploy the frontend to GitHub Pages.

## What The Script Does

- `bootstrap` reads tasks, history, and summary data
- `save` creates or updates a task row
- `delete` removes a task row
- `setupWorkTrack()` creates the sheets and headers
- `onOpen()` adds a simple spreadsheet menu for manual initialization

## Notes

- Task data stays in Google Sheets, not in the browser.
- Connection settings are not stored in localStorage.
- If you change the Apps Script deployment URL, update `config.js` and redeploy the frontend.
