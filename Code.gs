/**
 * Fairman Family Budget Dashboard v23 <-> Google Sheets backend
 *
 * SETUP:
 * 1) Open your budget Google Sheet.
 * 2) Extensions > Apps Script.
 * 3) Paste this entire file into Code.gs.
 * 4) Deploy > New deployment > Web app.
 * 5) Execute as: Me. Who has access: Anyone with the link.
 * 6) Copy the Web App URL and paste it into the dashboard's Import tab.
 */

const SPREADSHEET_ID = '12DS_ocjW4O70RJeUSP3tO9YdBYnrFCPyr3K4c_5PKGE';

function doGet(e) {
  return jsonResponse({ ok: true, message: 'Budget backend v23 is running. Use POST actions: getAll, saveTransactions, saveAll.' });
}

function doPost(e) {
  var __payloadV26 = JSON.parse(e.postData.contents || '{}');
  if (__payloadV26.action === 'closeMonth') {
    return ContentService.createTextOutput(JSON.stringify(closeMonthV26_(__payloadV26))).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = payload.action || 'getAll';

    if (action === 'getAll') {
      return jsonResponse({ ok: true, app: buildAppFromSheet() });
    }

    if (action === 'saveTransactions') {
      const tx = payload.transactions || [];
      const count = saveTransactions(tx);
      updateReceivedPaychecks(tx);
      return jsonResponse({ ok: true, count });
    }

    if (action === 'saveAll') {
      const tx = (payload.app && payload.app.transactions) || [];
      const count = saveTransactions(tx);
      updateReceivedPaychecks(tx);
      return jsonResponse({ ok: true, count });
    }

    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  return ss().getSheetByName(name);
}

function getObjects(sheetName) {
  const sh = getSheet(sheetName);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function getValue(obj, names, fallback) {
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== '') return obj[name];
  }
  return fallback;
}

function isActive(row) {
  const v = getValue(row, ['Active', 'Enabled'], true);
  if (v === true) return true;
  const s = String(v).toLowerCase();
  return !['false', 'no', '0', 'inactive'].includes(s);
}

function asNum(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v || '').replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function asDateString(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return s;
}

function monthFromDate(v, fallbackMonth) {
  const d = asDateString(v);
  return d && d.length >= 7 ? d.slice(0, 7) : fallbackMonth;
}


function latestRunningSchwabBalance() {
  const tx = getObjects('Transactions');
  let best = null;
  tx.forEach((r, idx) => {
    const source = String(getValue(r, ['Source'], '') || getValue(r, ['Account'], '')).toLowerCase();
    const account = String(getValue(r, ['Account'], '')).toLowerCase();
    const desc = String(getValue(r, ['Description','Raw Description'], '')).toLowerCase();
    if (!(source.includes('schwab') || account.includes('schwab') || desc.includes('schwab'))) return;
    const rbRaw = getValue(r, ['Running Balance', 'Balance After', 'RunningBalance', 'Running balance'], '');
    if (rbRaw === '' || rbRaw === null || rbRaw === undefined) return;
    const rb = asNum(rbRaw);
    const date = asDateString(getValue(r, ['Date', 'Posted', 'Imported Date'], ''));
    const posted = asDateString(getValue(r, ['Posted', 'Imported Date'], ''));
    if (!date) return;
    const rowKey = date + '|' + posted + '|' + String(idx).padStart(6, '0');
    if (!best || rowKey > best.rowKey) best = { rowKey, balance: rb };
  });
  return best ? best.balance : null;
}

function buildSettings() {
  const settingsRows = getObjects('Settings');
  const settings = {};
  settingsRows.forEach(r => {
    const key = String(getValue(r, ['Key', 'Setting', 'Name'], '')).trim();
    if (key) settings[key] = getValue(r, ['Value'], '');
  });

  const month = settings['Current Month'] || settings['Month'] || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const latestSchwab = latestRunningSchwabBalance();
  const checking = latestSchwab !== null ? latestSchwab : asNum(settings['Latest Schwab Balance'] || settings['Opening Checking Balance'] || settings['Checking Balance'] || 0);

  return {
    month: String(month).slice(0, 7),
    today: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    latestSchwabBalance: checking,
    openingCheckingBalance: asNum(settings['Opening Checking Balance'] || settings['Checking Balance'] || settings['Carryover Balance'] || 0)
  };
}

function buildAppFromSheet() {
  const base = buildSettings();
  const month = base.month;

  const accounts = getObjects('Accounts').filter(isActive);
  const paychecks = getObjects('Paychecks').filter(r => {
    return monthFromDate(getValue(r, ['Date'], ''), month) === month;
  }).map(r => {
    const receivedRaw = getValue(r, ['Received'], false);
    const received = receivedRaw === true || String(receivedRaw).toLowerCase() === 'true' || String(receivedRaw).toLowerCase() === 'yes';
    return {
      name: String(getValue(r, ['Description', 'Name', 'Person'], 'Paycheck')),
      date: asDateString(getValue(r, ['Date'], '')),
      amount: asNum(getValue(r, ['Amount'], 0)),
      received
    };
  }).filter(p => p.date && p.amount);

  const creditCards = accounts.filter(r => String(getValue(r, ['Type'], '')).toLowerCase() === 'credit card').map(r => ({
    name: String(getValue(r, ['Name'], 'Credit Card')),
    owed: asNum(getValue(r, ['Current Balance', 'Balance'], 0)),
    limit: asNum(getValue(r, ['Credit Limit', 'Limit'], 0)),
    min: asNum(getValue(r, ['Min Payment', 'Minimum Payment'], 0)),
    due: asNum(getValue(r, ['Due Day', 'Due'], 1)),
    apr: asNum(getValue(r, ['APR'], 0)),
    paymentKeywords: String(getValue(r, ['Payment Keywords', 'Keywords'], '')).split(',').map(s => s.trim()).filter(Boolean)
  }));

  const loans = accounts.filter(r => String(getValue(r, ['Type'], '')).toLowerCase() === 'loan').map(r => ({
    name: String(getValue(r, ['Name'], 'Loan')),
    owed: asNum(getValue(r, ['Current Balance', 'Balance'], 0)),
    min: asNum(getValue(r, ['Min Payment', 'Minimum Payment'], 0)),
    due: asNum(getValue(r, ['Due Day', 'Due'], 1)),
    apr: asNum(getValue(r, ['APR'], 0)),
    paymentKeywords: String(getValue(r, ['Payment Keywords', 'Keywords'], '')).split(',').map(s => s.trim()).filter(Boolean)
  }));

  const bills = getObjects('Bills').filter(isActive).map(r => ({
    name: String(getValue(r, ['Name'], 'Bill')),
    amount: asNum(getValue(r, ['Amount'], 0)),
    due: asNum(getValue(r, ['Due Day', 'Due'], 1)),
    category: String(getValue(r, ['Category'], 'Bills')),
    paymentKeywords: String(getValue(r, ['Payment Keywords', 'Keywords'], '')).split(',').map(s => s.trim()).filter(Boolean)
  }));

  const spendingBudgets = getObjects('Budget Categories').filter(isActive).map(r => ({
    name: String(getValue(r, ['Category', 'Name'], 'Category')),
    budget: asNum(getValue(r, ['Monthly Budget', 'Budget'], 0)),
    friendly: String(getValue(r, ['Friendly', 'Category', 'Name'], ''))
  }));

  const sinkingFunds = getObjects('Sinking Funds').filter(isActive).map(r => ({
    name: String(getValue(r, ['Fund Name', 'Name'], 'Fund')),
    budget: asNum(getValue(r, ['Monthly Contribution', 'Budgeted', 'Monthly Budget'], 0)),
    balance: asNum(getValue(r, ['Current Balance', 'Balance'], 0)),
    saved: asNum(getValue(r, ['Saved This Month', 'Saved'], 0))
  }));

  const transactions = getObjects('Transactions').map((r, idx) => {
    const date = asDateString(getValue(r, ['Date'], ''));
    const category = String(getValue(r, ['Category'], ''));
    const fund = String(getValue(r, ['Fund'], ''));
    return {
      id: String(getValue(r, ['Transaction ID', 'ID'], 'tx-' + idx + '-' + Date.now())),
      date,
      posted: asDateString(getValue(r, ['Posted', 'Imported Date', 'Post Date'], '')),
      source: String(getValue(r, ['Source'], 'Sheet')),
      account: String(getValue(r, ['Account'], '')),
      description: String(getValue(r, ['Description', 'Merchant'], '')),
      rawDescription: String(getValue(r, ['Raw Description', 'Description'], '')),
      amount: asNum(getValue(r, ['Amount'], 0)),
      owner: String(getValue(r, ['Owner'], '')),
      purchasedBy: String(getValue(r, ['Purchased By'], '')),
      category: fund || category || String(getValue(r, ['Type'], 'Needs Review')),
      treatment: String(getValue(r, ['Treatment'], 'Auto')),
      splits: parseSplitsV29_(getValue(r, ['Splits'], '')),
      splits: parseSplitsV29_(getValue(r, ['Splits'], '')),
      runningBalance: getValue(r, ['Running Balance', 'Balance After', 'RunningBalance'], '') === '' ? undefined : asNum(getValue(r, ['Running Balance', 'Balance After', 'RunningBalance'], ''))
    };
  }).filter(t => t.date || t.description || t.amount);

  const rules = getObjects('Transaction Rules').map(r => ({
    match: String(getValue(r, ['Match Text', 'Match', 'Text'], '')),
    category: String(getValue(r, ['Fund'], '')) || String(getValue(r, ['Category'], 'Needs Review')),
    owner: String(getValue(r, ['Owner'], '')),
    type: String(getValue(r, ['Type'], 'Expense'))
  })).filter(r => r.match);

  return {
    month,
    today: base.today,
    latestSchwabBalance: base.latestSchwabBalance,
    openingCheckingBalance: base.openingCheckingBalance,
    paychecks,
    creditCards,
    loans,
    bills,
    spendingBudgets,
    sinkingFunds,
    transactions,
    paidLoans: buildPaidMap(loans, transactions, 'Loan Payment'),
    paidCards: buildPaidMap(creditCards, transactions, 'Debt Payment'),
    paidBills: buildPaidBills(bills, transactions),
    rules
  };
}

function buildPaidMap(items, transactions, typeName) {
  const out = {};
  items.forEach(item => out[item.name] = 0);

  transactions.forEach(t => {
    const cat = String(t.category || '');
    const treatment = String(t.treatment || '');
    if (cat !== typeName && treatment !== typeName) return;
    const desc = String(t.rawDescription || t.description || '').toUpperCase();
    const amount = Math.abs(asNum(t.amount));
    if (!amount) return;

    const matches = items.filter(item => {
      const name = String(item.name || '').toUpperCase();
      let keywords = item.paymentKeywords && item.paymentKeywords.length ? item.paymentKeywords.slice() : [];
      if (name.includes('APPLE CARD')) keywords = keywords.concat(['APPLECARD GSBANK', 'APPLE CARD PAYMENT', 'APPLECARD']);
      else if (name.includes('BEST BUY')) keywords = keywords.concat(['BEST BUY']);
      else if (name.includes('LOWES')) keywords = keywords.concat(['LOWES', 'LOWE']);
      else if (name.includes('U.S. BANK') || name.includes('US BANK')) keywords = keywords.concat(['U.S. BANK', 'US BANK']);
      else if (name.includes('CHASE') || name.includes('AMAZON PRIME')) keywords = keywords.concat(['AMAZON PRIME VISA', 'CHASE CARD', 'CHASE CREDIT']);
      else if (!keywords.length) keywords = [item.name];
      const safeKeywords = keywords.map(k => String(k).toUpperCase().trim()).filter(k => k.length >= 4 && !['APPLE','CARD','BANK','PAYMENT','PYMT'].includes(k));
      return safeKeywords.some(k => desc.includes(k));
    });

    if (!matches.length) return;
    let winner = matches[0];
    let bestDiff = Math.abs(amount - asNum(winner.expected || winner.min || winner.amount || 0));
    matches.forEach(item => {
      const expected = asNum(item.expected || item.min || item.amount || 0);
      const diff = Math.abs(amount - expected);
      if (diff < bestDiff) {
        winner = item;
        bestDiff = diff;
      }
    });
    out[winner.name] += amount;
  });
  return out;
}

function buildPaidBills(bills, transactions) {
  const out = {};
  bills.forEach(bill => out[bill.name] = 0);
  const generic = ['SERVICES','GROCERIES','BASIC HEALTH & PERSONAL CARE','DOG FOOD','AUTO FUEL & MAINTENANCE'];
  transactions.forEach(t => {
    const desc = String(t.rawDescription || t.description || '').toUpperCase();
    bills.forEach(bill => {
      let keywords = bill.paymentKeywords && bill.paymentKeywords.length ? bill.paymentKeywords.slice() : [];
      const billName = String(bill.name || '').toUpperCase();
      if (!keywords.length && generic.includes(billName)) return;
      if (!keywords.length) keywords = [bill.name];
      const safeKeywords = keywords.map(k => String(k).toUpperCase().trim()).filter(k => k.length >= 4);
      if (safeKeywords.some(k => desc.includes(k))) out[bill.name] += Math.abs(asNum(t.amount));
    });
  });
  return out;
}


function transactionLooksLikePaycheck(t, paycheckAmount) {
  const amount = asNum(t.amount);
  if (amount <= 0) return false;
  if (Math.abs(Math.abs(amount) - Math.abs(paycheckAmount)) > 1.00) return false;
  const desc = String(t.description || t.rawDescription || '').toLowerCase();
  const source = String(t.source || t.account || '').toLowerCase();
  return source.includes('schwab') || desc.includes('payroll') || desc.includes('direct dep') || desc.includes('deposit');
}

function updateReceivedPaychecks(transactions) {
  const sh = getSheet('Paychecks');
  if (!sh) return;
  const range = sh.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return;
  let headers = values[0].map(h => String(h).trim());
  let receivedCol = headers.indexOf('Received');
  if (receivedCol < 0) {
    receivedCol = headers.length;
    sh.getRange(1, receivedCol + 1).setValue('Received');
    headers.push('Received');
  }
  const dateCol = headers.indexOf('Date');
  const amountCol = headers.indexOf('Amount');
  if (dateCol < 0 || amountCol < 0) return;

  const tx = (transactions || []).map(t => ({
    date: asDateString(t.date || ''),
    amount: asNum(t.amount),
    description: t.description || '',
    rawDescription: t.rawDescription || '',
    source: t.source || t.account || ''
  }));

  for (let r = 1; r < values.length; r++) {
    const pDate = asDateString(values[r][dateCol]);
    const pAmount = asNum(values[r][amountCol]);
    const matched = tx.some(t => transactionLooksLikePaycheck(t, pAmount) && monthFromDate(t.date, '') === monthFromDate(pDate, ''));
    if (matched) sh.getRange(r + 1, receivedCol + 1).setValue(true);
  }
}



function saveTransactions(transactions) {
  var ss = SpreadsheetApp.openById(typeof SPREADSHEET_ID !== 'undefined' ? SPREADSHEET_ID : '12DS_ocjW4O70RJeUSP3tO9YdBYnrFCPyr3K4c_5PKGE');
  var sheet = ss.getSheetByName('Transactions') || ss.insertSheet('Transactions');

  var headers = [
    'Transaction ID','Date','Posted','Imported Date','Source','Account','Description','Raw Description',
    'Merchant','Amount','Owner','Purchased By','Type','Treatment','Category','Fund','Month',
    'Reviewed','Notes','Running Balance','Splits','Import Batch ID'
  ];

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
  }

  transactions = transactions || [];
  var rows = transactions.map(function(t) {
    return [
      t.id || t.transactionId || '',
      t.date || '',
      t.posted || '',
      t.importedDate || new Date(),
      t.source || '',
      t.account || '',
      t.description || '',
      t.rawDescription || '',
      t.merchant || '',
      Number(t.amount) || 0,
      t.owner || '',
      t.purchasedBy || '',
      t.type || '',
      t.treatment || 'Auto',
      t.category || 'Needs Review',
      t.fund || '',
      t.month || (String(t.date || '').substring(0, 7)),
      t.reviewed === true || t.reviewed === 'TRUE',
      t.notes || '',
      t.runningBalance === undefined || t.runningBalance === null || t.runningBalance === '' ? '' : Number(t.runningBalance),
      stringifySplitsV29_(t.splits),
      t.importBatchId || ''
    ];
  });

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  return { ok: true, count: rows.length };
}




/**
 * v26 month close endpoint.
 * Expected payload:
 * { action:'closeMonth', nextMonth:'YYYY-MM', snapshot:{...} }
 */
function closeMonthV26_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nextMonth = String(payload.nextMonth || '').trim();
  var snapshot = payload.snapshot || {};
  if (!nextMonth) throw new Error('Missing nextMonth');

  var settings = ss.getSheetByName('Settings');
  if (settings) {
    var values = settings.getDataRange().getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === 'current month') {
        settings.getRange(i + 1, 2).setValue(nextMonth);
      }
    }
  }

  var snapSheet = ss.getSheetByName('Monthly Snapshots') || ss.insertSheet('Monthly Snapshots');
  if (snapSheet.getLastRow() === 0) {
    snapSheet.appendRow([
      'Month','Closed At','Income','Bills','General Spending','Sinking Funds',
      'Debt Payments','Net Cash Flow','Credit Card Debt','Loan Debt','Checking Balance','Snapshot JSON'
    ]);
  }

  snapSheet.appendRow([
    snapshot.month || '',
    snapshot.closedAt || new Date(),
    snapshot.totalIncome || 0,
    snapshot.bills || 0,
    snapshot.monthlyBudgetSpent || 0,
    snapshot.sinkingFundSpent || 0,
    snapshot.debtPayments || 0,
    snapshot.netCashFlow || 0,
    snapshot.creditCardDebt || 0,
    snapshot.loanDebt || 0,
    snapshot.checkingBalance || 0,
    JSON.stringify(snapshot)
  ]);

  // Carry sinking fund positions into Current Balance and reset Saved to 0 where columns exist.
  var funds = ss.getSheetByName('Sinking Funds');
  if (funds && snapshot.sinkingFundPositions) {
    var data = funds.getDataRange().getValues();
    if (data.length > 1) {
      var headers = data[0].map(function(h){ return String(h).trim().toLowerCase(); });
      var nameCol = headers.indexOf('fund name');
      if (nameCol < 0) nameCol = headers.indexOf('category');
      if (nameCol < 0) nameCol = headers.indexOf('fund');
      var balCol = headers.indexOf('current balance');
      if (balCol < 0) balCol = headers.indexOf('balance');
      var savedCol = headers.indexOf('saved');
      var positions = {};
      snapshot.sinkingFundPositions.forEach(function(p){ positions[String(p.name)] = Number(p.position) || 0; });
      for (var r = 1; r < data.length; r++) {
        var nm = String(data[r][nameCol]);
        if (positions.hasOwnProperty(nm) && balCol >= 0) {
          funds.getRange(r + 1, balCol + 1).setValue(positions[nm]);
        }
        if (savedCol >= 0) {
          funds.getRange(r + 1, savedCol + 1).setValue(0);
        }
      }
    }
  }

  return { ok:true, nextMonth:nextMonth };
}


/**
 * v30 split helpers
 * Safely parses the Transactions.Splits JSON column.
 */
function parseSplitsV29_(value) {
  if (value === null || value === undefined || value === '') return [];
  try {
    var parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

/**
 * Safely serializes transaction splits for the Transactions.Splits column.
 */
function stringifySplitsV29_(splits) {
  if (!splits || !Array.isArray(splits) || splits.length === 0) return '';
  return JSON.stringify(splits);
}
