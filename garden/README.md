# Joe's Backyard Plant Bible — GitHub Pages + Google Sheets

## 1) Create the Apps Script API
1. Open the Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Replace the default code with `Code.gs` from this package.
4. Confirm this line has your Sheet ID:
   `const SHEET_ID = '1JGwfNQDGFonrpYj5drQ3YZLHrox7By278MWfhZq4mQ0';`
5. Click **Deploy → New deployment → Web app**.
6. Set **Execute as: Me** and **Who has access: Anyone with the link**.
7. Deploy and copy the Web App URL ending in `/exec`.

## 2) Publish on GitHub Pages
Upload these files to your repo:
- `index.html`
- `styles.css`
- `app.js`

Open the GitHub Pages URL. Paste the Apps Script `/exec` URL into the box and click **Save + Load**.

## Notes
- Reads use JSONP so GitHub Pages can load the Google Sheet without CORS drama.
- Saves use a simple no-CORS POST; the app reloads after saving.
- The app is flexible with column names like Plant/Name, Rabbit Risk/Rabbits, Bloom/Bloom Time, etc.
