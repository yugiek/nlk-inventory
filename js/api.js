if (typeof window.NLK === 'undefined') { window.NLK = {}; }
var NLK = window.NLK;

const API = {
  STORAGE_KEY: 'nlk_inventory_data',

  init() {
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      this.save(NLK.SEED);
    } else {
      // Guard: jangan biarkan dashboard kosong jika data tersimpan tidak lengkap
      var existing = this.load();
      var needsSeed = !existing.inventory || !existing.inventory.length || !existing.sales || !existing.sales.length;
      if (needsSeed) {
        var merged = Object.assign({}, existing, NLK.SEED);
        this.save(merged);
      }
    }
    // Force update URL Apps Script jika masih pakai URL lama
    var data = this.load();
    var newUrl = 'https://script.google.com/macros/s/AKfycbwsikqVD516dY_QVIrwAbwOHIXgyuNFe_L4rhZzA6xrsUM97M-VAx8lgQVPd5uC7cSCpw/exec';
    if (!data.settings) data.settings = {};
    data.settings.appsScriptUrl = newUrl;
    if (!data.settings.kursCNYtoIDR) data.settings.kursCNYtoIDR = 16500;
    if (!data.settings.safetyStockDays) data.settings.safetyStockDays = 7;
    this.save(data);
    // Sync dari Sheets
    this.syncFromRemote();
  },

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || JSON.parse(JSON.stringify(NLK.SEED));
    } catch (e) {
      return JSON.parse(JSON.stringify(NLK.SEED));
    }
  },

  save(data) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  remoteUrl() {
    var data = this.load();
    var url = data.settings && data.settings.appsScriptUrl;
    return (url && url.indexOf('script.google.com') !== -1) ? url : null;
  },

  async request(action, payload) {
    var url = this.remoteUrl();
    if (!url) return null;
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, payload: payload || {} })
      });
      return await res.json();
    } catch (e) {
      console.warn('Remote POST gagal:', e);
      return null;
    }
  },

  async syncFromRemote() {
    var url = this.remoteUrl();
    if (!url) {
      console.warn('Tidak ada URL Apps Script, pakai data lokal.');
      return;
    }
    try {
      var res = await fetch(url + '?action=getAll');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      if (json && json.status === 'ok') {
        var data = this.load();
        var remoteInv = normalizeRows(json.inventory || []);
        var remoteSales = normalizeSales(normalizeRows(json.sales || []), remoteInv);
        if (remoteInv.length) data.inventory = remoteInv;
        if (remoteSales.length) data.sales = remoteSales;
        if ((json.purchaseOrders || []).length) data.purchaseOrders = normalizePOs(json.purchaseOrders, data.inventory);
        if ((json.suppliers || []).length) data.suppliers = normalizeRows(json.suppliers);
        this.save(data);
        window.dispatchEvent(new CustomEvent('nlk-data-changed'));
        console.log('Sync dari Sheets OK:', remoteInv.length, 'item,', remoteSales.length, 'sales');
      } else {
        console.warn('Sheets response:', json);
      }
    } catch (e) {
      console.warn('Sync dari Sheets gagal:', e.message, '— pakai data lokal.');
    }
  },

  addPart(part) {
    var item = Object.assign({}, part, {
      id: part.id || NLK.genId('NLK'),
      aktif: (part.aktif === undefined) ? true : part.aktif
    });
    var data = this.load();
    data.inventory = data.inventory || [];
    data.inventory.push(item);
    this.save(data);
    this.request('addPart', item);
    return item;
  },

  updatePart(part) {
    var data = this.load();
    data.inventory = (data.inventory || []).map(function(i) {
      return i.id === part.id ? Object.assign({}, i, part) : i;
    });
    this.save(data);
    this.request('updatePart', part);
  },

  deletePart(id) {
    var data = this.load();
    data.inventory = (data.inventory || []).filter(function(i) { return i.id !== id; });
    this.save(data);
    this.request('deletePart', { id: id });
  },

  addSale(sale) {
    var s = Object.assign({}, sale, { id: sale.id || NLK.genId('SALE') });
    var data = this.load();
    data.sales = data.sales || [];
    data.sales.push(s);
    this.save(data);
    this.request('addSale', s);
    return s;
  },

  createPO(po) {
    var p = Object.assign({}, po, {
      id: po.id || NLK.genId('PO'),
      status: po.status || 'ordered'
    });
    var data = this.load();
    data.purchaseOrders = data.purchaseOrders || [];
    data.purchaseOrders.push(p);
    this.save(data);
    this.request('createPO', p);
    return p;
  },

  updatePOStatus(id, status) {
    var data = this.load();
    data.purchaseOrders = (data.purchaseOrders || []).map(function(po) {
      if (po.id !== id) return po;
      var updated = Object.assign({}, po, { status: status });
      if (status === 'arrived') updated.receivedAt = new Date().toISOString();
      return updated;
    });
    this.save(data);
    this.request('updatePO', { id: id, status: status });
  },

  updateSettings(newSettings) {
    var data = this.load();
    data.settings = Object.assign({}, data.settings, newSettings);
    this.save(data);
  },

  exportData() {
    var data = this.load();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nlk-inventory-backup-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importData(file) {
    var self = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var imported = JSON.parse(e.target.result);
        var current = self.load();
        var merged = Object.assign({}, current, imported);
        self.save(merged);
        window.dispatchEvent(new CustomEvent('nlk-data-changed'));
        alert('Data berhasil di-import');
      } catch (err) {
        alert('Gagal mengimpor: format tidak valid');
      }
    };
    reader.readAsText(file);
  }
};

NLK.api = API;

// === Normalization ===

function normalizeRows(rows) {
  if (!rows || !rows.length) return [];
  return rows.map(function(r) {
    var out = {};
    for (var k in r) {
      var v = r[k];
      if (v === 'TRUE' || v === true) v = true;
      else if (v === 'FALSE' || v === false) v = false;
      else if (typeof v === 'string' && v !== '' && !isNaN(v) && v.indexOf('.') === -1 && v.indexOf('-') === -1) {
        v = Number(v);
      } else if (typeof v === 'string' && v.indexOf('.') !== -1 && v.indexOf('-') === -1 && !isNaN(v)) {
        v = parseFloat(v);
      }
      out[k] = v;
    }
    return out;
  });
}

function normalizeSales(rows, inventory) {
  return (rows || []).map(function(s, idx) {
    var item = (inventory || []).find(function(i){ return i.id === s.sku || i.sku === s.sku; });
    if (!s.soNumber) s.soNumber = s.noSalesOrder || s.no_so || s.salesOrder || ('SO-' + String(s.tanggal || NLK.today()).replace(/-/g,'') + '-' + String(idx+1).padStart(3,'0'));
    if (!s.customer) s.customer = s.customerName || s.pelanggan || '-';
    if (!s.destination) s.destination = s.tujuan || (item ? item.warehouse : '-');
    if (!s.brand && item) s.brand = item.brand;
    if (!s.warehouse && item) s.warehouse = item.warehouse;
    return s;
  });
}

function normalizePOs(rows, inventory) {
  var list = normalizeRows(rows);
  return list.map(function(po) {
    var items = [];
    if (typeof po.items === 'string' && po.items) {
      po.items.split(',').forEach(function(part) {
        var p = part.split(':');
        if (p.length === 2) {
          var sku = p[0].trim();
          var found = (inventory || []).find(function(i) { return i.id === sku; });
          items.push({
            sku: sku,
            qty: Number(p[1]) || 1,
            hargaBeliCNY: found ? found.hargaBeliCNY : 0
          });
        }
      });
    } else if (Array.isArray(po.items)) {
      items = po.items;
    }
    po.items = items;
    return po;
  });
}