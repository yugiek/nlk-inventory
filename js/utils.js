const NLK = window.NLK || {};
window.NLK = NLK;

NLK.fmtRp = function(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
};

NLK.fmtDate = function(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

NLK.today = function() {
  return new Date().toISOString().slice(0, 10);
};

NLK.daysAgo = function(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

NLK.addDays = function(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

NLK.genId = function(prefix) {
  return prefix + '-' + Math.floor(10000 + Math.random() * 90000);
};

NLK.avgDailySales = function(sales, sku, days) {
  days = days || 30;
  var cutoff = NLK.daysAgo(days);
  var filtered = sales.filter(function(s) { return s.sku === sku && s.tanggal >= cutoff; });
  if (filtered.length === 0) return 0;
  var total = filtered.reduce(function(sum, s) { return sum + s.jumlah; }, 0);
  var uniqueDays = new Set(filtered.map(function(s) { return s.tanggal; })).size;
  return uniqueDays > 0 ? total / uniqueDays : 0;
};

NLK.stockStatus = function(item, avgDaily) {
  if (!avgDaily || avgDaily <= 0) {
    if (item.stok <= item.minStok) return 'critical';
    return 'ok';
  }
  if (item.stok <= item.minStok) return 'critical';
  var daysLeft = item.stok / avgDaily;
  var leadTime = item.leadTimeHari || 30;
  if (daysLeft <= leadTime + 7) return 'warn';
  return 'ok';
};

NLK.statusLabel = function(s) {
  return { ok: 'Aman', warn: 'Hampir Habis', critical: 'Stok Rendah' }[s] || '-';
};

NLK.statusColor = function(s) {
  return { ok: 'text-emerald-400', warn: 'text-yellow-400', critical: 'text-red-400' }[s] || 'text-gray-400';
};

NLK.statusBg = function(s) {
  return { ok: 'bg-emerald-500/10 border border-emerald-500/20', warn: 'bg-yellow-500/10 border border-yellow-500/20', critical: 'bg-red-500/10 border border-red-500/20' }[s] || '';
};

NLK.parseCSV = function(text) {
  var lines = text.split('\n');
  var result = [];
  var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/^["']|["']$/g, ''); });
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var currentline = lines[i].split(',');
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = (currentline[j] || '').trim().replace(/^["']|["']$/g, '');
      obj[headers[j]] = val;
    }
    result.push(obj);
  }
  return result;
};

// Generate 150 Dummy Inventory Items for NLK Sparepart
function generate150DummyParts() {
  var cats = ['Engine', 'Transmission', 'Suspension', 'Electrical', 'Filter', 'Brake', 'Bearing', 'Gasket', 'Belt', 'Body'];
  var parts = [];
  var racks = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2'];
  
  for (var i = 1; i <= 150; i++) {
    var cat = cats[i % cats.length];
    var id = 'NLK-' + String(1000 + i);
    var nama = cat + ' Part Model ' + (100 + i);
    var stok = Math.floor(Math.random() * 80) + 2;
    var minStok = Math.floor(Math.random() * 15) + 5;
    var cny = Math.floor(Math.random() * 200) + 10;
    var jual = cny * 16500 * 1.4;
    jual = Math.round(jual / 5000) * 5000;
    parts.push({
      id: id,
      nama: nama,
      kategori: cat,
      stok: stok,
      minStok: minStok,
      hargaBeliCNY: cny,
      hargaJual: jual,
      lokasiRak: racks[i % racks.length] + '-' + (i % 9 + 1),
      leadTimeHari: 25 + (i % 4) * 5,
      aktif: true
    });
  }
  return parts;
}

// Generate 90 days of dummy sales history
function generateDummySales(inventory) {
  var sales = [];
  var today = new Date();
  for (var d = 90; d >= 0; d--) {
    var dateObj = new Date();
    dateObj.setDate(today.getDate() - d);
    var dateStr = dateObj.toISOString().slice(0, 10);
    
    // 5-10 transactions per day
    var txCount = Math.floor(Math.random() * 6) + 3;
    for (var t = 0; t < txCount; t++) {
      var item = inventory[Math.floor(Math.random() * inventory.length)];
      var qty = Math.floor(Math.random() * 3) + 1;
      sales.push({
        id: 'SALE-' + Math.floor(100000 + Math.random() * 900000),
        tanggal: dateStr,
        sku: item.id,
        jumlah: qty,
        hargaJual: item.hargaJual
      });
    }
  }
  return sales;
}

// Generate 5 dummy POs
function generateDummyPOs(inventory) {
  return [
    {
      id: 'PO-2026-001',
      tanggalOrder: NLK.daysAgo(20),
      supplierId: 'SUP-001',
      supplierName: 'Guangzhou Auto Parts Co.',
      status: 'shipped',
      estimasiTiba: NLK.addDays(NLK.today(), 5),
      items: [
        { sku: inventory[0].id, qty: 50, hargaBeliCNY: inventory[0].hargaBeliCNY },
        { sku: inventory[1].id, qty: 100, hargaBeliCNY: inventory[1].hargaBeliCNY }
      ],
      catatan: 'Pengiriman via laut - Container #CN-8821'
    },
    {
      id: 'PO-2026-002',
      tanggalOrder: NLK.daysAgo(10),
      supplierId: 'SUP-002',
      supplierName: 'Shenzhen Precision Parts Ltd',
      status: 'in transit',
      estimasiTiba: NLK.addDays(NLK.today(), 12),
      items: [
        { sku: inventory[4].id, qty: 40, hargaBeliCNY: inventory[4].hargaBeliCNY }
      ],
      catatan: 'Express air shipping'
    }
  ];
}

NLK.SEED = {
  inventory: [],
  sales: [],
  purchaseOrders: [],
  suppliers: [
    { id: 'SUP-001', nama: 'Guangzhou Auto Parts Co.', negara: 'China', kontak: 'Mr. Chen - WeChat: chen_auto', leadTimeDefault: 30 },
    { id: 'SUP-002', nama: 'Shenzhen Precision Parts Ltd', negara: 'China', kontak: 'Ms. Wang - wang@szparts.cn', leadTimeDefault: 25 },
    { id: 'SUP-003', nama: 'Shanghai Heavy Machinery & Parts', negara: 'China', kontak: 'Mr. Liu - info@sh-parts.cn', leadTimeDefault: 35 }
  ],
  settings: {
    kursCNYtoIDR: 16500,
    safetyStockDays: 7,
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbwsikqVD516dY_QVIrwAbwOHIXgyuNFe_L4rhZzA6xrsUM97M-VAx8lgQVPd5uC7cSCpw/exec'
  }
};

// Initialize large dataset if empty
const tempInv = generate150DummyParts();
NLK.SEED.inventory = tempInv;
NLK.SEED.sales = generateDummySales(tempInv);
NLK.SEED.purchaseOrders = generateDummyPOs(tempInv);