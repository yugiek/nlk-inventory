if (typeof window.NLK === 'undefined') { window.NLK = {}; }
var NLK = window.NLK;

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

// Faster sales aggregation map
NLK.buildSalesMap = function(sales, days) {
  days = days || 30;
  var cutoff = NLK.daysAgo(days);
  var map = {};
  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    if (s.tanggal >= cutoff) {
      if (!map[s.sku]) map[s.sku] = { totalQty: 0, days: {} };
      map[s.sku].totalQty += (s.jumlah || 0);
      map[s.sku].days[s.tanggal] = true;
    }
  }
  var result = {};
  for (var sku in map) {
    var uniqueDays = Object.keys(map[sku].days).length;
    result[sku] = uniqueDays > 0 ? map[sku].totalQty / uniqueDays : 0;
  }
  return result;
};

NLK.avgDailySales = function(sales, sku, days) {
  days = days || 30;
  var cutoff = NLK.daysAgo(days);
  var total = 0;
  var uniqueDays = {};
  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    if (s.sku === sku && s.tanggal >= cutoff) {
      total += (s.jumlah || 0);
      uniqueDays[s.tanggal] = true;
    }
  }
  var count = Object.keys(uniqueDays).length;
  return count > 0 ? total / count : 0;
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
  return { ok: 'text-emerald-400', warn: 'text-yellow-400', critical: 'text-red-400' }[s] || 'text-slate-400';
};

NLK.statusBg = function(s) {
  return { ok: 'bg-emerald-500/10 border border-emerald-500/20', warn: 'bg-yellow-500/10 border border-yellow-500/20', critical: 'bg-red-500/10 border border-red-500/20' }[s] || '';
};

NLK.parseCSV = function(text) {
  // CSV parser sederhana yang tetap menangani koma di dalam tanda kutip.
  var rows = [], row = [], field = '', quoted = false;
  for (var i=0;i<text.length;i++) {
    var ch=text[i], next=text[i+1];
    if (ch === '"' && quoted && next === '"') { field += '"'; i++; continue; }
    if (ch === '"') { quoted=!quoted; continue; }
    if (ch === ',' && !quoted) { row.push(field.trim()); field=''; continue; }
    if ((ch === '\\n' || ch === '\\r') && !quoted) {
      if (ch === '\\r' && next === '\\n') i++;
      row.push(field.trim()); field='';
      if (row.some(function(v){return v!=='';})) rows.push(row);
      row=[]; continue;
    }
    field += ch;
  }
  row.push(field.trim());
  if (row.some(function(v){return v!=='';})) rows.push(row);
  if (!rows.length) return [];
  var headers=rows[0].map(function(h){return h.replace(/^['"]|['"]$/g,'').trim();});
  return rows.slice(1).map(function(cols){
    var obj={};
    headers.forEach(function(h,j){obj[h]=(cols[j]||'').replace(/^['"]|['"]$/g,'').trim();});
    return obj;
  });
};

// Generate 150 Dummy Inventory Items
function generate150DummyParts() {
  var cats = ['Engine', 'Transmission', 'Suspension', 'Electrical', 'Filter', 'Brake', 'Bearing', 'Gasket', 'Belt', 'Body'];
  var parts = [];
  var racks = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2', 'F1', 'F2'];
  var warehouses = ['Surabaya', 'Balikpapan', 'Banjarmasin', 'Makassar'];
  var brands = ['NLK', 'FCC'];
  
  for (var i = 1; i <= 150; i++) {
    var cat = cats[i % cats.length];
    var brand = brands[i % brands.length];
    var wh = warehouses[i % warehouses.length];
    var id = brand + '-' + String(1000 + i);
    var nama = '[' + brand + '] ' + cat + ' Part Model ' + (100 + i);
    // Bikin beberapa item stok kritis/rendah untuk testing alert reorder
    var stok = (i % 7 === 0) ? Math.floor(Math.random() * 5) + 1 : Math.floor(Math.random() * 80) + 10;
    var minStok = Math.floor(Math.random() * 15) + 8;
    var cny = Math.floor(Math.random() * 200) + 15;
    var jual = cny * 16500 * 1.4;
    jual = Math.round(jual / 5000) * 5000;
    parts.push({
      id: id,
      sku: id,
      brand: brand,
      warehouse: wh,
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

// Generate 365 Hari Dummy Sales History (untuk evaluasi mingguan/bulanan/kuartal/semester/tahunan)
function generateDummySales(inventory) {
  var sales = [];
  var today = new Date();
  // Faktor musiman per bulan (index 0=Jan) dan tren pertumbuhan bisnis
  var season = [0.75, 0.85, 1.15, 1.0, 0.95, 1.05, 0.9, 1.0, 1.1, 1.2, 1.15, 1.3];
  
  for (var d = 365; d >= 0; d--) {
    var dateObj = new Date();
    dateObj.setDate(today.getDate() - d);
    var dateStr = dateObj.toISOString().slice(0, 10);
    var ageRatio = (365 - d) / 365;
    var growth = 0.6 + 0.4 * ageRatio;
    var month = dateObj.getMonth();
    var seasonal = season[month];
    var dow = dateObj.getDay();
    var weekend = (dow === 0 || dow === 6) ? 1.25 : 1.0;
    var base = 2 + Math.floor(Math.random() * 4);
    var txCount = Math.max(1, Math.round(base * growth * seasonal * weekend));
    for (var t = 0; t < txCount; t++) {
      var item = inventory[Math.floor(Math.random() * inventory.length)];
      var qty = Math.floor(Math.random() * 4) + 1;
      sales.push({
        id: 'SALE-' + Math.floor(100000 + Math.random() * 900000),
        tanggal: dateStr,
        sku: item.sku,
        brand: item.brand,
        warehouse: item.warehouse,
        jumlah: qty,
        hargaJual: item.hargaJual
      });
    }
  }
  return sales;
}

// Generate 5 Dummy Purchase Orders dengan status beragam
function generateDummyPOs(inventory) {
  return [
    {
      id: 'PO-2026-001',
      tanggalOrder: NLK.daysAgo(25),
      supplierId: 'SUP-001',
      supplierName: 'Guangzhou Auto Parts Co.',
      status: 'shipped',
      estimasiTiba: NLK.addDays(NLK.today(), 5),
      items: [
        { sku: inventory[0].id, qty: 100, hargaBeliCNY: inventory[0].hargaBeliCNY },
        { sku: inventory[1].id, qty: 150, hargaBeliCNY: inventory[1].hargaBeliCNY }
      ],
      catatan: 'Pengiriman Laut - Container #CN-8821'
    },
    {
      id: 'PO-2026-002',
      tanggalOrder: NLK.daysAgo(12),
      supplierId: 'SUP-002',
      supplierName: 'Shenzhen Precision Parts Ltd',
      status: 'in transit',
      estimasiTiba: NLK.addDays(NLK.today(), 10),
      items: [
        { sku: inventory[6].id, qty: 60, hargaBeliCNY: inventory[6].hargaBeliCNY },
        { sku: inventory[7].id, qty: 80, hargaBeliCNY: inventory[7].hargaBeliCNY }
      ],
      catatan: 'Express Air Freight'
    },
    {
      id: 'PO-2026-003',
      tanggalOrder: NLK.daysAgo(3),
      supplierId: 'SUP-003',
      supplierName: 'Shanghai Heavy Machinery & Parts',
      status: 'ordered',
      estimasiTiba: NLK.addDays(NLK.today(), 28),
      items: [
        { sku: inventory[13].id, qty: 200, hargaBeliCNY: inventory[13].hargaBeliCNY }
      ],
      catatan: 'Order baru - Menunggu konfirmasi kapal'
    },
    {
      id: 'PO-2026-004',
      tanggalOrder: NLK.daysAgo(45),
      supplierId: 'SUP-001',
      supplierName: 'Guangzhou Auto Parts Co.',
      status: 'arrived',
      estimasiTiba: NLK.daysAgo(15),
      items: [
        { sku: inventory[2].id, qty: 120, hargaBeliCNY: inventory[2].hargaBeliCNY }
      ],
      catatan: 'Barang sudah masuk gudang'
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
    maxStockDays: 60,
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbwsikqVD516dY_QVIrwAbwOHIXgyuNFe_L4rhZzA6xrsUM97M-VAx8lgQVPd5uC7cSCpw/exec'
  }
};

const tempInv = generate150DummyParts();
NLK.SEED.inventory = tempInv;
NLK.SEED.sales = generateDummySales(tempInv);
NLK.SEED.purchaseOrders = generateDummyPOs(tempInv);