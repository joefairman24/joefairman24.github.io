# Joe's Backyard Plant Bible - GitHub Pages v2

## 1. Apps Script
Paste `Code.gs` into Extensions > Apps Script from your Google Sheet, then deploy as a Web App:
- Execute as: Me
- Who has access: Anyone with the link

Copy the Web App URL ending in `/exec`.

## 2. GitHub Pages
Open `app.js` and replace:

```js
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```

with your Apps Script Web App URL.

Upload `index.html`, `styles.css`, and `app.js` to your GitHub Pages repo.

## 3. Calendar fix
The calendar now parses full month names, 3-letter names, ranges like `June-July`, and seasons like spring/summer/fall/winter.
