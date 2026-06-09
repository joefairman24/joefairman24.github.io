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
  const sheetName = 'Transactions';
  let sh = getSheet(sheetName);
  if (!sh) sh = ss().insertSheet(sheetName);

  const headers = [
    'Transaction ID', 'Date', 'Imported Date', 'Account', 'Description', 'Merchant',
    'Amount', 'Type', 'Treatment', 'Category', 'Fund', 'Month', 'Reviewed', 'Notes', 'Splits',
    'Owner', 'Source', 'Posted', 'Purchased By', 'Raw Description', 'Running Balance', 'Import Batch ID'
  ];

  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  transactions = transactions || [];
  const rows = transactions.map(t => {
    const category = String(t.category || '');
    const type = ['Debt Payment','Loan Payment','Payment / Transfer','Income'].includes(category) ? category : 'Expense';
    const month = monthFromDate(t.date, '');
    return [
      t.id || t.transactionId || Utilities.getUuid(),
      t.date || '',
      t.importedDate || t.posted || '',
      t.account || '',
      t.description || '',
      t.merchant || '',
      asNum(t.amount),
      t.type || type,
      t.treatment || 'Auto',
      category || 'Needs Review',
      t.fund || '',
      t.month || month,
      t.reviewed === false ? false : true,
      t.notes || '',
      stringifySplitsV29_(t.splits),
      t.owner || '',
      t.source || '',
      t.posted || '',
      t.purchasedBy || '',
      t.rawDescription || t.description || '',
      t.runningBalance === undefined || t.runningBalance === null || t.runningBalance === '' ? '' : asNum(t.runningBalance),
      t.importBatchId || ''
    ];
  });

  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.autoResizeColumns(1, Math.min(headers.length, 12));

  updateReceivedPaychecks(transactions);
  updateSettingsLatestBalanceV36_(transactions);
  updatePaidStatusSheetsV36_(transactions);
  return rows.length;
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

function parseSplitsV29_(value) {
  if (value === null || value === undefined || value === '') return [];
  try { var parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed : []; } catch (err) { return []; }
}
function stringifySplitsV29_(splits) {
  if (!splits || !Array.isArray(splits) || splits.length === 0) return '';
  return JSON.stringify(splits);
}


function normalizeTextV36_(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function isCurrentMonthTxV36_(t, month) {
  return String(t.date || '').substring(0, 7) === month;
}
function latestSchwabBalanceV36_(transactions) {
  const month = getSettingMonthV36_();
  const tx = (transactions || []).map((t, i) => ({t, i})).filter(x => {
    const src = String((x.t.source || '') + ' ' + (x.t.account || '')).toLowerCase();
    return isCurrentMonthTxV36_(x.t, month) && src.includes('schwab');
  });
  const withRb = tx.filter(x => x.t.runningBalance !== undefined && x.t.runningBalance !== null && x.t.runningBalance !== '' && !isNaN(Number(x.t.runningBalance)));
  if (!withRb.length) return null;
  withRb.sort((a,b) => {
    const d = String(b.t.date || '').localeCompare(String(a.t.date || '')); if (d) return d;
    const p = String(b.t.posted || '').localeCompare(String(a.t.posted || '')); if (p) return p;
    return a.i - b.i;
  });
  const base = withRb[0];
  let balance = asNum(base.t.runningBalance);
  tx.forEach(x => {
    const hasRb = x.t.runningBalance !== undefined && x.t.runningBalance !== null && x.t.runningBalance !== '' && !isNaN(Number(x.t.runningBalance));
    if (hasRb) return;
    const newerDate = String(x.t.date || '') > String(base.t.date || '');
    const sameDateNewer = String(x.t.date || '') === String(base.t.date || '') && x.i < base.i;
    if (newerDate || sameDateNewer) balance += asNum(x.t.amount);
  });
  return balance;
}
function getSettingMonthV36_() {
  const settings = getSheet('Settings');
  if (!settings) return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const values = settings.getDataRange().getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === 'current month') return String(values[i][1]).trim();
  }
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
}
function setKeyValueV36_(sheetName, key, value) {
  const sh = getSheet(sheetName); if (!sh) return;
  const values = sh.getDataRange().getValues();
  for (let r = 0; r < values.length; r++) {
    if (String(values[r][0]).trim().toLowerCase() === String(key).trim().toLowerCase()) {
      sh.getRange(r + 1, 2).setValue(value); return;
    }
  }
  sh.appendRow([key, value]);
}
function updateSettingsLatestBalanceV36_(transactions) {
  const bal = latestSchwabBalanceV36_(transactions);
  if (bal === null) return;
  setKeyValueV36_('Settings', 'Latest Schwab Balance', bal);
  const accounts = getSheet('Accounts');
  if (!accounts) return;
  const values = accounts.getDataRange().getValues(); if (values.length < 2) return;
  const headers = values[0].map(h => String(h).trim());
  const nameCol = headers.indexOf('Name'); const balCol = headers.indexOf('Current Balance');
  if (nameCol < 0 || balCol < 0) return;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][nameCol]).toLowerCase().includes('schwab checking')) accounts.getRange(r + 1, balCol + 1).setValue(bal);
  }
}
function paymentKeywordsV36_(item) {
  let keys = (item.paymentKeywords || []).slice();
  const name = String(item.name || '').toUpperCase();
  if (name.includes('APPLE CARD')) keys = keys.concat(['APPLECARD GSBANK','APPLECARD','APPLE CARD']);
  if (name.includes('BEST BUY')) keys = keys.concat(['BEST BUY']);
  if (name.includes('LOWES')) keys = keys.concat(['LOWES','LOWE']);
  if (name.includes('CHASE') || name.includes('AMAZON PRIME')) keys = keys.concat(['CHASE CREDIT CRD','CHASE CREDIT','CHASE','AMAZON PRIME VISA']);
  if (name.includes('U.S. BANK') || name.includes('US BANK')) keys = keys.concat(['US BANK','U S BANK','U.S. BANK']);
  if (name.includes('MORTGAGE') || name.includes('NAVY FEDERAL')) keys = keys.concat(['NFCU MORT DEBIT','NAVY FEDERAL']);
  if (name.includes('HELOC')) keys = keys.concat(['NFCU MORT DEBIT','HELOC']);
  if (name.includes('BRIDGECREST')) keys = keys.concat(['BRIDGECREST']);
  if (name.includes('WELLS FARGO')) keys = keys.concat(['WELLS FARGO']);
  return Array.from(new Set(keys.map(k => normalizeTextV36_(k)).filter(k => k.length >= 4)));
}
function paidMapV36_(items, transactions, typeName) {
  const out = {}; items.forEach(i => out[i.name] = 0);
  const month = getSettingMonthV36_();
  (transactions || []).forEach(t => {
    if (!isCurrentMonthTxV36_(t, month)) return;
    const d = normalizeTextV36_((t.rawDescription || '') + ' ' + (t.description || ''));
    const cat = String(t.category || ''); const tr = String(t.treatment || '');
    if (typeName === 'Debt Payment' && !(cat === 'Debt Payment' || tr === 'Debt Payment' || /APPLECARD|BEST BUY|LOWES|CHASE CREDIT CRD|US BANK/.test(d))) return;
    if (typeName === 'Loan Payment' && !(cat === 'Loan Payment' || tr === 'Loan Payment' || /NFCU MORT|BRIDGECREST|WELLS FARGO|APPLE WATCH/.test(d))) return;
    const amt = Math.abs(asNum(t.amount)); if (!amt) return;
    const matches = items.filter(item => paymentKeywordsV36_(item).some(k => d.includes(k)));
    if (!matches.length) return;
    let winner = matches[0], best = Math.abs(amt - asNum(matches[0].expected || matches[0].min || matches[0].amount));
    matches.forEach(item => { const diff = Math.abs(amt - asNum(item.expected || item.min || item.amount)); if (diff < best) { winner = item; best = diff; } });
    out[winner.name] += amt;
  });
  return out;
}
function updatePaidStatusSheetsV36_(transactions) {
  // Build current account/bill objects from sheet using existing builder pieces.
  const app = buildAppFromSheet();
  const cardPaid = paidMapV36_(app.creditCards || [], transactions, 'Debt Payment');
  const loanPaid = paidMapV36_(app.loans || [], transactions, 'Loan Payment');
  // Mark paycheck Received based on transactions.
  updateReceivedPaychecks(transactions);
  // Optional: if Accounts has Amount Paid / Confirmed Paid columns, update them.
  const accounts = getSheet('Accounts');
  if (accounts) {
    const vals = accounts.getDataRange().getValues();
    if (vals.length > 1) {
      const h = vals[0].map(x => String(x).trim());
      const nameCol = h.indexOf('Name');
      let paidCol = h.indexOf('Amount Paid'); if (paidCol < 0) paidCol = h.indexOf('Confirmed Paid');
      if (nameCol >= 0 && paidCol >= 0) {
        for (let r = 1; r < vals.length; r++) {
          const name = String(vals[r][nameCol]);
          if (cardPaid[name] !== undefined) accounts.getRange(r + 1, paidCol + 1).setValue(cardPaid[name] || 0);
          if (loanPaid[name] !== undefined) accounts.getRange(r + 1, paidCol + 1).setValue(loanPaid[name] || 0);
        }
      }
    }
  }
}


/* ===== v38 split-aware backend helpers ===== */
function v38Abs_(v) {
  var n = Number(String(v == null ? '' : v).replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : Math.abs(n);
}
function v38Norm_(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function v38SplitPaid_(t, itemName, paymentTreatment) {
  var total = 0;
  var splits = Array.isArray(t.splits) ? t.splits : parseSplitsV29_(t.splits);
  splits.forEach(function(s) {
    if (String(s.category || '') === String(itemName || '') && String(s.treatment || '') === paymentTreatment) {
      total += v38Abs_(s.amount);
    }
  });
  return total;
}

/**
 * Override prior buildPaidMap so split payments do not count the entire parent transaction.
 * Example: $2,000 Apple payment split into $310.58 Debt Payment and $1,689.42 Debt Payoff Extra
 * makes Apple Card confirmed paid = $310.58, not $2,000.
 */
function buildPaidMap(items, transactions, typeName) {
  var out = {};
  (items || []).forEach(function(item) { out[item.name] = 0; });

  (transactions || []).forEach(function(t) {
    var splits = Array.isArray(t.splits) ? t.splits : parseSplitsV29_(t.splits);
    if (splits.length) {
      (items || []).forEach(function(item) {
        out[item.name] = (out[item.name] || 0) + v38SplitPaid_(t, item.name, typeName);
      });
      return;
    }

    var cat = String(t.category || '');
    var treatment = String(t.treatment || '');
    if (cat !== typeName && treatment !== typeName) return;

    var desc = v38Norm_((t.rawDescription || '') + ' ' + (t.description || ''));
    var amount = v38Abs_(t.amount);
    if (!amount) return;

    (items || []).forEach(function(item) {
      var keys = [];
      (item.paymentKeywords || []).forEach(function(k) { if (k) keys.push(k); });
      keys.push(item.name || '');
      var name = String(item.name || '').toUpperCase();
      if (name.indexOf('APPLE CARD') >= 0) keys = keys.concat(['APPLECARD GSBANK','APPLECARD','APPLE CARD']);
      if (name.indexOf('BEST BUY') >= 0) keys.push('BEST BUY');
      if (name.indexOf('LOWES') >= 0) keys = keys.concat(['LOWES','LOWE']);
      if (name.indexOf('CHASE') >= 0 || name.indexOf('AMAZON PRIME') >= 0) keys = keys.concat(['CHASE','AMAZON PRIME VISA']);
      if (name.indexOf('U.S. BANK') >= 0 || name.indexOf('US BANK') >= 0) keys = keys.concat(['US BANK','U S BANK','U.S. BANK']);
      if (keys.map(v38Norm_).some(function(k) { return k && desc.indexOf(k) >= 0; })) {
        out[item.name] = (out[item.name] || 0) + amount;
      }
    });
  });

  return out;
}

/* ===== v48 backend repair: date-aware paychecks + split/closest-match paid maps ===== */
function v48DateString_(v) { return asDateString(v || ''); }
function v48DateDiffDays_(a, b) {
  var da = new Date(v48DateString_(a) + 'T00:00:00');
  var db = new Date(v48DateString_(b) + 'T00:00:00');
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 9999;
  return Math.abs((da.getTime() - db.getTime()) / 86400000);
}
function updateReceivedPaychecks(transactions) {
  var sh = getSheet('Paychecks');
  if (!sh) return;
  var range = sh.getDataRange();
  var values = range.getValues();
  if (values.length < 2) return;
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var receivedCol = headers.indexOf('Received');
  if (receivedCol < 0) {
    receivedCol = headers.length;
    sh.getRange(1, receivedCol + 1).setValue('Received');
    headers.push('Received');
  }
  var dateCol = headers.indexOf('Date');
  var amountCol = headers.indexOf('Amount');
  if (dateCol < 0 || amountCol < 0) return;
  var tx = (transactions || []).map(function(t) {
    return {
      date: asDateString(t.date || t.posted || ''),
      amount: asNum(t.amount),
      description: t.description || '',
      rawDescription: t.rawDescription || '',
      source: String((t.source || '') + ' ' + (t.account || '')).toLowerCase()
    };
  });
  for (var r = 1; r < values.length; r++) {
    var pDate = asDateString(values[r][dateCol]);
    var pAmount = asNum(values[r][amountCol]);
    var matched = tx.some(function(t) {
      if (t.amount <= 0) return false;
      if (Math.abs(Math.abs(t.amount) - Math.abs(pAmount)) > 1.00) return false;
      if (v48DateDiffDays_(t.date, pDate) > 3) return false;
      var desc = String((t.description || '') + ' ' + (t.rawDescription || '')).toLowerCase();
      return t.source.indexOf('schwab') >= 0 || desc.indexOf('payroll') >= 0 || desc.indexOf('direct dep') >= 0 || desc.indexOf('deposit') >= 0;
    });
    sh.getRange(r + 1, receivedCol + 1).setValue(!!matched);
  }
}

function v48PaymentKeywords_(item) {
  var keys = [];
  (item.paymentKeywords || []).forEach(function(k) { if (k) keys.push(k); });
  keys.push(item.name || '');
  var name = String(item.name || '').toUpperCase();
  if (name.indexOf('APPLE CARD') >= 0) keys = keys.concat(['APPLECARD GSBANK','APPLECARD','APPLE CARD']);
  if (name.indexOf('BEST BUY') >= 0) keys.push('BEST BUY');
  if (name.indexOf('LOWES') >= 0) keys = keys.concat(['LOWES','LOWE']);
  if (name.indexOf('CHASE') >= 0 || name.indexOf('AMAZON PRIME') >= 0) keys = keys.concat(['CHASE CREDIT CARD','CHASE CREDIT','CHASE','AMAZON PRIME VISA']);
  if (name.indexOf('U.S. BANK') >= 0 || name.indexOf('US BANK') >= 0) keys = keys.concat(['US BANK','U S BANK','U.S. BANK']);
  if (name.indexOf('MORTGAGE') >= 0 || name.indexOf('NAVY FEDERAL') >= 0 || name.indexOf('HELOC') >= 0) keys.push('NFCU MORT DEBIT');
  if (name.indexOf('BRIDGECREST') >= 0) keys.push('BRIDGECREST');
  if (name.indexOf('WELLS FARGO') >= 0) keys.push('WELLS FARGO');
  if (name.indexOf('APPLE WATCH') >= 0) keys.push('APPLE WATCH');
  return Array.from(new Set(keys.map(v38Norm_).filter(function(k) { return k.length >= 4; })));
}
function v48LooksLikePayment_(t, typeName) {
  var d = v38Norm_((t.rawDescription || '') + ' ' + (t.description || ''));
  var cat = String(t.category || '');
  var tr = String(t.treatment || '');
  if (cat === typeName || tr === typeName) return true;
  if (typeName === 'Debt Payment') return /PAYMENT|PYMT|APPLECARD|CHASE|LOWES|LOWE|BEST BUY|US BANK|U S BANK/.test(d);
  if (typeName === 'Loan Payment') return /NFCU MORT|BRIDGECREST|WELLS FARGO|APPLE WATCH/.test(d);
  return false;
}
function buildPaidMap(items, transactions, typeName) {
  var out = {};
  (items || []).forEach(function(item) { out[item.name] = 0; });
  (transactions || []).forEach(function(t) {
    var splits = Array.isArray(t.splits) ? t.splits : parseSplitsV29_(t.splits);
    if (splits.length) {
      splits.forEach(function(s) {
        if (out.hasOwnProperty(String(s.category || '')) && String(s.treatment || '') === typeName) {
          out[String(s.category || '')] += v38Abs_(s.amount);
        }
      });
      return;
    }
    if (!v48LooksLikePayment_(t, typeName)) return;
    var amount = v38Abs_(t.amount);
    if (!amount) return;
    var d = v38Norm_((t.rawDescription || '') + ' ' + (t.description || ''));
    var matches = (items || []).filter(function(item) {
      return v48PaymentKeywords_(item).some(function(k) { return d.indexOf(k) >= 0; });
    });
    if (!matches.length) return;
    var winner = matches[0];
    var best = Math.abs(amount - asNum(matches[0].expected || matches[0].min || matches[0].amount));
    matches.forEach(function(item) {
      var diff = Math.abs(amount - asNum(item.expected || item.min || item.amount));
      if (diff < best) { winner = item; best = diff; }
    });
    out[winner.name] += amount;
  });
  Object.keys(out).forEach(function(k) { out[k] = Math.round(out[k] * 100) / 100; });
  return out;
}

function paidMapV36_(items, transactions, typeName) {
  return buildPaidMap(items, transactions, typeName);
}
