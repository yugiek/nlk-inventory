const NLK = window.NLK || {};
window.NLK = NLK;

const API = {
  STORAGE_KEY: 'nlk_inventory_data',

  init() {
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      this.save(NLK.SEED);
    }
    // Coba sinkron dari Google Sheets jika URL sudah dikonfigurasi
    this.syncFromRemote();
  },

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || NLK.SEED;
    } catch (e) {
      return NLK.SEED;
    }
  },

  save(data) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  // === Remote (Google Sheets via Apps Script) ===

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
      var json = await res.json();
      if (json && json.status === 'error') {
        console.warn('Apps Script error:', json.message);
        return null;
      }
      return json;
    } catch (e) {
      console.warn('Remote sync gagal, pakai data lokal.', e);
      return null;
    }
  },

  // Pull semua data dari spreadsheet ke localStorage
  async syncFromRemote() {
    var url = this.remoteUrl();
    if (!url) return;
    try {
      var res = await fetch(url + '?action=getAll', { method: 'GET' });
      var json = await res.json();
      if (json && json.status === 'ok' && json.inventory) {
        var data = this.load();
        data.inventory = normalizeRows(json.inventory);
        data.sales = normalizeRows(json.sales);
        data.purchaseOrders = normalizePOs(json.purchaseOrders);
        data.suppliers = normalizeRows(json.suppliers);
        this.save(data);
        window.dispatchEvent(new CustomEvent('nlk-data-changed'));
        console.log('Data berhasil di-sync dari Google Sheets:', data.inventory.length, 'item');
      }
    } catch (e) {
      console.warn('Sync awal gagal, gunakan data lokal.', e);
    }
  },

  // Push full dataset ke spreadsheet (untuk seed/sync satu arah)
  async pushAll() {
    var url = this.remoteUrl();
    if (!url) return false;
    var data = this.load();
    var ok = true;
    for (var i = 0; i < (data.inventory || []).length; i++) {
      var r = await this.request('addPart', data.inventory[i]);
      if (!r) ok = false;
    }
    return ok;
  },

  // === Inventory ===
  addPart(part) {
    var item = Object.assign({}, part, {
      id: part.id || NLK.genId('NLK'),
      aktif: (part.aktif === undefined) ? true : part.aktif,
      createdAt: new Date().toISOString()
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

  // === Sales ===
  addSale(sale) {
    var s = Object.assign({}, sale, { id: sale.id || NLK.genId('SALE'), createdAt: new Date().toISOString() });
    var data = this.load();
    data.sales = data.sales || [];
    data.sales.push(s);
    this.save(data);
    this.request('addSale', s);
    return s;
  },

  // === Purchase Orders ===
  createPO(po) {
    var p = Object.assign({}, po, {
      id: po.id || NLK.genId('PO'),
      createdAt: new Date().toISOString(),
      status: po.status || 'ordered',
      inTransit: po.status === 'shipped' || po.status === 'in transit'
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
      if (status === 'shipped') updated.inTransit = true;
      if (status === 'arrived') { updated.inTransit = false; updated.receivedAt = new Date().toISOString(); }
      return updated;
    });
    this.save(data);
    this.request('updatePO', { id: id, status: status });
  },

  // === Settings ===
  updateSettings(newSettings) {
    var data = this.load();
    data.settings = Object.assign({}, data.settings, newSettings);
    this.save(data);
  },

  // === Backup ===
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
        alert('Data berhasil di-import');
        window.dispatchEvent(new CustomEvent('nlk-data-changed'));
      } catch (err) {
        alert('Gagal mengimpor: format tidak valid');
      }
    };
    reader.readAsText(file);
  }
};

NLK.api = API;

// === Normalization helpers ===

function normalizeRows(rows) {
  if (!rows || !rows.length) return [];
  return rows.map(function(r) {
    var out = {};
    for (var k in r) {
      var v = r[k];
      if (v === 'TRUE') v = true;
      else if (v === 'FALSE') v = false;
      else if (typeof v === 'string' && v !== '' && !isNaN(v) && !/^[0-9]{4}-[0-9]{2}/.test(v)) v = Number(v);
      out[k] = v;
    }
    return out;
  });
}

// PO items di spreadsheet disimpan sebagai string "SKU:qty,SKU:qty" -> ubah ke array objek
function normalizePOs(rows) {
  var list = normalizeRows(rows);
  return list.map(function(po) {
    var items = [];
    if (typeof po.items === 'string' && po.items) {
      po.items.split(',').forEach(function(part) {
        var parts = part.split(':');
        if (parts.length === 2) {
          var inv = NLK.api.load().inventory || [];
          var found = inv.find(function(i) { return i.id === parts[0].trim(); });
          items.push({
            sku: parts[0].trim(),
            qty: Number(parts[1]) || 1,
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