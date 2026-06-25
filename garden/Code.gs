const SHEET_ID = '1JGwfNQDGFonrpYj5drQ3YZLHrox7By278MWfhZq4mQ0';
const MAIN_SHEET_NAMES = ['Plant Guide','Plants','Plant Bible','Backyard Plant Bible'];

function doGet(e) {
  const action = (e.parameter.action || 'plants').toLowerCase();
  let output;
  if (action === 'plants') output = { plants: getPlants_() };
  else output = { ok: true, message: 'Unknown action', action };
  return respond_(output, e.parameter.callback);
}

function doPost(e) {
  const action = (e.parameter.action || '').toLowerCase();
  const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
  if (action === 'upsert') return respond_({ ok: true, rowNumber: upsertPlant_(body) });
  return respond_({ ok: false, error: 'Unknown POST action' });
}

function respond_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) return ContentService.createTextOutput(`${callback}(${json});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function ss_(){ return SpreadsheetApp.openById(SHEET_ID); }
function mainSheet_(){
  const ss = ss_();
  for (const name of MAIN_SHEET_NAMES) { const sh = ss.getSheetByName(name); if (sh) return sh; }
  return ss.getSheets()[0];
}
function getPlants_(){
  const sh = mainSheet_();
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h || '').trim());
  return values.slice(1).filter(r => r.join('').trim()).map((row, i) => {
    const obj = { rowNumber: i + 2 };
    headers.forEach((h, c) => obj[h || `Column ${c+1}`] = row[c]);
    return obj;
  });
}
function upsertPlant_(data){
  const sh = mainSheet_();
  let headers = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),1)).getDisplayValues()[0].map(h=>String(h||'').trim());
  const wanted = ['Plant','Quantity','Type','Zone','Sun','Water','Bloom','Rabbit Risk','Prune','Fertilize','Fruit','Winter','Notes'];
  if (!headers.join('').trim()) { headers = wanted; sh.getRange(1,1,1,headers.length).setValues([headers]); }
  wanted.forEach(h => { if (!headers.includes(h)) { headers.push(h); sh.getRange(1,headers.length).setValue(h); } });
  const rowNumber = Number(data.rowNumber) || sh.getLastRow()+1;
  const row = headers.map(h => data[h] ?? data[alias_(h)] ?? '');
  sh.getRange(rowNumber,1,1,headers.length).setValues([row]);
  log_('upsert', data.Plant || data.Name || '', rowNumber);
  return rowNumber;
}
function alias_(h){
  const m = {'Plant':'Name','Rabbit Risk':'Rabbits','Bloom':'Bloom Time','Prune':'When to Prune','Fertilize':'Fertilizer','Winter':'Winter / Freeze Notes','Fruit':'Fruit / Harvest / Protection'};
  return m[h] || h;
}
function log_(action, plant, row){
  const ss = ss_();
  const sh = ss.getSheetByName('Activity Log') || ss.insertSheet('Activity Log');
  if (sh.getLastRow() === 0) sh.appendRow(['Timestamp','Action','Plant','Row']);
  sh.appendRow([new Date(), action, plant, row]);
}
