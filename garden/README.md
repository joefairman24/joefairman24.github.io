# Joe's Backyard Plant Bible v3

This version fixes the June problem:

- Freeze/winter tasks only appear in winter months.
- Bloom + harvest is powered by a built-in plant brain, so June actually shows bee balm, salvia, catmint, daylilies, lavender, allium, herbs, blueberries, etc.
- The calendar no longer depends on the sheet having a perfect "Bloom" column.
- Plant library is more visual with icons, seasonal chips, rabbit risk chips, and care summaries.
- Apps Script URL is hard-coded in `app.js`.

## Install

1. Upload/replace these files in your GitHub Pages repo root:
   - `index.html`
   - `styles.css`
   - `app.js`

2. In `app.js`, replace:

```js
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```

with your Apps Script `/exec` URL.

3. In Google Apps Script connected to the sheet, replace your `Code.gs` with the included `Code.gs`.

4. Deploy Apps Script as a Web App:
   - Execute as: Me
   - Access: Anyone with the link or Only myself if your browser account works for your setup

5. Push to GitHub and wait for Pages deployment.

## Optional: add real plant photos

Add a `Photo` or `Photo URL` column to the Plant Guide tab. Paste image URLs there. The app will use them instead of icons.
