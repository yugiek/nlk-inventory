// Google Apps Script Proxy Backend untuk NLK Inventory Management System
// Paste kode ini ke Google Apps Script Editor (Extensions > Apps Script di Google Sheets)

function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'getInventory') {
    return jsonResponse(getSheetData(ss, 'Inventory'));
  } else if (action === 'getSales') {
    return jsonResponse(getSheetData(ss, 'Sales'));
  } else if (action === 'getPO') {
    return jsonResponse(getSheetData(ss, 'PurchaseOrders'));
  } else if (action === 'getSuppliers') {
    return jsonResponse(getSheetData(ss, 'Suppliers'));
  }
  
  return jsonResponse({ status: 'ok', message: 'NLK Inventory API is running' });
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'addPart') {
    appendRow(ss, 'Inventory', data.payload);
    return jsonResponse({ status: 'success' });
  } else if (action === 'addSale') {
    appendRow(ss, 'Sales', data.payload);
    return jsonResponse({ status: 'success' });
  } else if (action === 'createPO') {
    appendRow(ss, 'PurchaseOrders', data.payload);
    return jsonResponse({ status: 'success' });
  }
  
  return jsonResponse({ status: 'error', message: 'Unknown action' });
}

function getSheetData(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return rows;
}

function appendRow(ss, sheetName, rowObj) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(rowObj[headers[i]] || '');
  }
  sheet.appendRow(row);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}