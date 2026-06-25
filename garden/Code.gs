const SHEET_ID = '1JGwfNQDGFonrpYj5drQ3YZLHrox7By278MWfhZq4mQ0';
const PLANT_SHEET_NAME = 'Plant Guide';
const FRUIT_SHEET_NAME = 'Fruit & Harvest';
const SEASONAL_SHEET_NAME = 'Seasonal Calendar';

function doGet(e) {
  e = e || { parameter: {} };
  const action = e.parameter.action || 'all';
  let payload;
  if (action === 'plants') payload = { plants: readSheet_(PLANT_SHEET_NAME) };
  else if (action === 'fruit') payload = { fruit: readSheet_(FRUIT_SHEET_NAME) };
  else if (action === 'seasonal') payload = { seasonal: readSheet_(SEASONAL_SHEET_NAME) };
  else payload = { plants: readSheet_(PLANT_SHEET_NAME), fruit: readSheet_(FRUIT_SHEET_NAME), seasonal: readSheet_(SEASONAL_SHEET_NAME) };
  return output_(payload, e);
}

function doPost(e) {
  const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  upsertPlant_(body);
  return output_({ ok: true, saved: body }, e || { parameter: {} });
}

function readSheet_(sheetName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = {};
    let empty = true;
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      row[headers[c]] = values[r][c];
      if (values[r][c] !== '' && values[r][c] !== null) empty = false;
    }
    if (!empty) { row.rowNumber = r + 1; rows.push(row); }
  }
  return rows;
}

function upsertPlant_(plant) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(PLANT_SHEET_NAME);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const rowNumber = Number(plant.rowNumber || 0);
  const row = headers.map(h => plant[h] !== undefined ? plant[h] : '');
  if (rowNumber && rowNumber > 1) sh.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  else sh.appendRow(row);
}

function output_(payload, e) {
  const json = JSON.stringify(payload);
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
