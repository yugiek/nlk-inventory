// Google Apps Script Backend untuk NLK Inventory Management System
// Spreadsheet: https://docs.google.com/spreadsheets/d/1WtlpMyIs9URrJVf1SgRB5xWwCYIo6cW6xp4eFFF-mjc/

function doGet(e) {
  var action = e.parameter ? e.parameter.action : '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'getInventory') {
    return jsonResponse({ status: 'ok', data: getSheetData(ss, 'Inventory') });
  } else if (action === 'getSales') {
    return jsonResponse({ status: 'ok', data: getSheetData(ss, 'Sales') });
  } else if (action === 'getPurchaseOrders') {
    return jsonResponse({ status: 'ok', data: getSheetData(ss, 'PurchaseOrders') });
  } else if (action === 'getSuppliers') {
    return jsonResponse({ status: 'ok', data: getSheetData(ss, 'Suppliers') });
  } else if (action === 'getAll') {
    return jsonResponse({
      status: 'ok',
      inventory: getSheetData(ss, 'Inventory'),
      sales: getSheetData(ss, 'Sales'),
      purchaseOrders: getSheetData(ss, 'PurchaseOrders'),
      suppliers: getSheetData(ss, 'Suppliers')
    });
  }

  return jsonResponse({ status: 'ok', message: 'NLK Inventory API is running' });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'addPart') {
      appendRow(ss, 'Inventory', data.payload);
      return jsonResponse({ status: 'success' });
    } else if (action === 'updatePart') {
      updateRow(ss, 'Inventory', 'id', data.payload);
      return jsonResponse({ status: 'success' });
    } else if (action === 'deletePart') {
      deleteRow(ss, 'Inventory', 'id', data.payload.id);
      return jsonResponse({ status: 'success' });
    } else if (action === 'addSale') {
      appendRow(ss, 'Sales', data.payload);
      return jsonResponse({ status: 'success' });
    } else if (action === 'createPO') {
      appendRow(ss, 'PurchaseOrders', data.payload);
      return jsonResponse({ status: 'success' });
    } else if (action === 'updatePO') {
      updateRow(ss, 'PurchaseOrders', 'id', data.payload);
      return jsonResponse({ status: 'success' });
    } else if (action === 'seedData') {
      seedAllData(ss);
      return jsonResponse({ status: 'success', message: 'Data seeded successfully' });
    }

    return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// === Sheet Helpers ===

function getSheetData(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    var hasData = false;
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      row[headers[j]] = val;
      if (val !== '' && val !== null) hasData = true;
    }
    if (hasData) rows.push(row);
  }
  return rows;
}

function appendRow(ss, sheetName, rowObj) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var val = rowObj[headers[i]];
    row.push(val !== undefined && val !== null ? val : '');
  }
  sheet.appendRow(row);
}

function updateRow(ss, sheetName, keyCol, rowObj) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var keyIndex = headers.indexOf(keyCol);
  if (keyIndex === -1) return;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyIndex]) === String(rowObj[keyCol])) {
      for (var j = 0; j < headers.length; j++) {
        var val = rowObj[headers[j]];
        if (val !== undefined && val !== null) {
          sheet.getRange(i + 1, j + 1).setValue(val);
        }
      }
      return;
    }
  }
}

function deleteRow(ss, sheetName, keyCol, keyVal) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var keyIndex = headers.indexOf(keyCol);
  if (keyIndex === -1) return;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyIndex]) === String(keyVal)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// === SEED DATA: 150 Item, 90 Hari Sales, 2 PO ===

function seedAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Clear existing data
  var sheets = ['Inventory', 'Sales', 'PurchaseOrders', 'Suppliers'];
  sheets.forEach(function(name) {
    var s = ss.getSheetByName(name);
    if (s && s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
  });

  var inventory = generateInventory();
  seedInventory(ss, inventory);
  seedSales(ss, inventory);
  seedPO(ss, inventory);
  seedSuppliers(ss);
}

function generateInventory() {
  var cats = ['Engine', 'Transmission', 'Suspension', 'Electrical', 'Filter', 'Brake', 'Bearing', 'Gasket', 'Belt', 'Body'];
  var racks = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2'];
  var items = [];

  for (var i = 1; i <= 150; i++) {
    var cat = cats[i % cats.length];
    var stok = Math.floor(Math.random() * 80) + 2;
    var minStok = Math.floor(Math.random() * 15) + 5;
    var cny = Math.floor(Math.random() * 200) + 10;
    var jual = Math.round((cny * 16500 * 1.4) / 5000) * 5000;
    items.push([
      'NLK-' + (1000 + i),
      cat + ' Part Model ' + (100 + i),
      cat, stok, minStok,
      cny, jual,
      racks[i % racks.length] + '-' + (i % 9 + 1),
      25 + (i % 4) * 5,
      true
    ]);
  }
  return items;
}

function seedInventory(ss, inventory) {
  var sheet = ss.getSheetByName('Inventory');
  inventory.forEach(function(item) { sheet.appendRow(item); });
}

function seedSales(ss, inventory) {
  var sheet = ss.getSheetByName('Sales');
  var today = new Date();
  for (var d = 90; d >= 0; d--) {
    var dateObj = new Date(today);
    dateObj.setDate(today.getDate() - d);
    var dateStr = Utilities.formatDate(dateObj, 'Asia/Jakarta', 'yyyy-MM-dd');
    var txCount = Math.floor(Math.random() * 6) + 3;
    for (var t = 0; t < txCount; t++) {
      var item = inventory[Math.floor(Math.random() * inventory.length)];
      var qty = Math.floor(Math.random() * 3) + 1;
      sheet.appendRow([
        'SALE-' + Math.floor(100000 + Math.random() * 900000),
        dateStr, item[0], qty, item[5]
      ]);
    }
  }
}

function seedPO(ss, inventory) {
  var sheet = ss.getSheetByName('PurchaseOrders');
  var today = new Date();
  var eta1 = new Date(today); eta1.setDate(today.getDate() + 5);
  var eta2 = new Date(today); eta2.setDate(today.getDate() + 12);
  var order1 = new Date(today); order1.setDate(today.getDate() - 20);
  var order2 = new Date(today); order2.setDate(today.getDate() - 10);

  sheet.appendRow([
    'PO-2026-001',
    Utilities.formatDate(order1, 'Asia/Jakarta', 'yyyy-MM-dd'),
    'SUP-001', 'Guangzhou Auto Parts Co.',
    'shipped',
    Utilities.formatDate(eta1, 'Asia/Jakarta', 'yyyy-MM-dd'),
    inventory[0][0] + ':' + 50 + ',' + inventory[1][0] + ':' + 100,
    'Pengiriman via laut - Container #CN-8821'
  ]);
  sheet.appendRow([
    'PO-2026-002',
    Utilities.formatDate(order2, 'Asia/Jakarta', 'yyyy-MM-dd'),
    'SUP-002', 'Shenzhen Precision Parts Ltd',
    'in transit',
    Utilities.formatDate(eta2, 'Asia/Jakarta', 'yyyy-MM-dd'),
    inventory[4][0] + ':' + 40,
    'Express air shipping'
  ]);
}

function seedSuppliers(ss) {
  var sheet = ss.getSheetByName('Suppliers');
  sheet.appendRow(['SUP-001', 'Guangzhou Auto Parts Co.', 'China', 'Mr. Chen - WeChat: chen_auto', 30]);
  sheet.appendRow(['SUP-002', 'Shenzhen Precision Parts Ltd', 'China', 'Ms. Wang - wang@szparts.cn', 25]);
  sheet.appendRow(['SUP-003', 'Shanghai Heavy Machinery & Parts', 'China', 'Mr. Liu - info@sh-parts.cn', 35]);
}

// === Setup: Jalankan ini pertama kali untuk membuat sheet & headers ===

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Inventory
  var inv = ss.getSheetByName('Inventory') || ss.insertSheet('Inventory');
  inv.getRange(1, 1, 1, 10).setValues([['id', 'nama', 'kategori', 'stok', 'minStok', 'hargaBeliCNY', 'hargaJual', 'lokasiRak', 'leadTimeHari', 'aktif']]);

  // Sales
  var sales = ss.getSheetByName('Sales') || ss.insertSheet('Sales');
  sales.getRange(1, 1, 1, 5).setValues([['id', 'tanggal', 'sku', 'jumlah', 'hargaJual']]);

  // PurchaseOrders
  var po = ss.getSheetByName('PurchaseOrders') || ss.insertSheet('PurchaseOrders');
  po.getRange(1, 1, 1, 8).setValues([['id', 'tanggalOrder', 'supplierId', 'supplierName', 'status', 'estimasiTiba', 'items', 'catatan']]);

  // Suppliers
  var sup = ss.getSheetByName('Suppliers') || ss.insertSheet('Suppliers');
  sup.getRange(1, 1, 1, 5).setValues([['id', 'nama', 'negara', 'kontak', 'leadTimeDefault']]);

  Logger.log('Sheets setup complete!');
}