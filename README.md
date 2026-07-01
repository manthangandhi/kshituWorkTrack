# WorkTrack

Premium task ledger for Google Sheets + GitHub Pages.

## What is here

- `index.html`, `styles.css`, `app.js`: multi-view dashboard, tasks, reports, history, and settings
- `config.js`: local fallback for `apiUrl` and `sheetUrl` if you want to test before deploying
- `google-apps-script/Code.gs`: Google Sheets backend with task and audit history support
- `.github/workflows/pages.yml`: GitHub Pages deployment that injects the Google Sheet and Apps Script URLs

## Current behavior

- Dashboard view with KPI cards, analytics, and recent activity
- Tasks view for create/edit/delete and filtering
- Reports view for summary cards and chart ranges
- History view for audit trail entries
- Settings view for showing the backend-managed connection status

## Where to put the URLs

Do **not** type URLs on the phone.

Set them once in GitHub Actions secrets:

- `APPS_SCRIPT_URL`: the deployed Google Apps Script web app URL
- `SHEET_URL`: the Google Sheet URL for the Open Sheet shortcut

During the Pages build, GitHub Actions writes those values into `apps-script-url.txt` and `sheet-url.txt` in the published site. The browser reads them from the same origin, so your wife never has to enter anything. If you are testing locally, `config.js` can also provide the same URLs.

## Google Sheets setup

1. Create a Google Sheet.
2. Open `Extensions > Apps Script` from that sheet so the script is bound to the spreadsheet.
3. Paste the contents of `google-apps-script/Code.gs`.
4. Run `setupWorkTrack()` once from the Apps Script editor. Approve the permissions. This creates the `Tasks` and `History` sheets with headers.
5. Deploy as web app: **Execute as: Me**, **Who has access: Anyone**.
6. Copy the `/exec` URL into GitHub secret `APPS_SCRIPT_URL`.
7. Copy the spreadsheet URL into the GitHub secret `SHEET_URL`.
8. Push to `main` or run the Pages workflow manually.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml`:

- builds a clean `site/` folder
- injects `apps-script-url.txt`
- injects `sheet-url.txt`
- deploys only the frontend to GitHub Pages

## What the script does

- `bootstrap` reads tasks, history, and summary data
- `save` creates or updates a task row
- `delete` removes a task row
- `setupWorkTrack()` creates the sheets and headers
- `onOpen()` adds a simple spreadsheet menu for manual initialization

## Notes

- Task data stays in Google Sheets, not in the browser.
- Connection settings are not stored in localStorage.
- If you change the Apps Script deployment URL, update the GitHub secret and redeploy the Pages workflow.
