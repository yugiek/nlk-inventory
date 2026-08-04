const NLK = window.NLK || {};
window.NLK = NLK;

const API = {
  STORAGE_KEY: 'nlk_inventory_data',
  REMOTE: null, // URL Apps Script, diisi dari Settings

  init() {
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      this.save(NLK.SEED);
    }
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

  // === Remote (Google Sheets) ===
  async request(action, method, body) {
    if (!this.REMOTE_SERVER) return null;
    try {
      const res = await fetch(this.REMOTE_SERVER, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, method, payload: body })
      });
      return await res.json();
    } catch (e) {
      console.warn('Remote failed, fallback local', e);
      return null;
    }
  },

  async syncRemote() {
    const data = await this.request('getAll', 'GET');
    if (data && data.inventory) {
      this.save(data);
      return data;
    }
    return this.load();
  },

  // === Inventory ===
  addPart(part) {
    const item = Object.assign({}, part, {
      id: part.id || NLK.genId('NLK'),
      aktif: true,
      createdAt: new Date().toISOString()
    });
    const data = this.load();
    data.inventory = data.inventory || [];
    data.inventory.push(item);
    this.save(data);
    this.request('addPart', 'POST', item);
    return item;
  },

  updatePart(part) {
    const data = this.load();
    data.inventory = (data.inventory || []).map(function(i) {
      return i.id === part.id ? Object.assign({}, i, part) : i;
    });
    this.save(data);
    this.request('updatePart', 'PUT', part);
  },

  deletePart(id) {
    const data = this.load();
    data.inventory = (data.inventory || []).filter(function(i) { return i.id !== id; });
    this.save(data);
    this.request('deletePart', 'DELETE', { id: id });
  },

  // === Sales ===
  addSale(sale) {
    const s = Object.assign({}, sale, { id: sale.id || NLK.genId('SALE'), createdAt: new Date().toISOString() });
    const data = this.load();
    data.sales = data.sales || [];
    data.sales.push(s);
    this.save(data);
    this.request('addSale', 'POST', s);
    return s;
  },

  // === Purchase Orders ===
  createPO(po) {
    const p = Object.assign({}, po, {
      id: po.id || NLK.genId('PO'),
      createdAt: new Date().toISOString(),
      status: 'ordered',
      inTransit: false
    });
    const data = this.load();
    data.purchaseOrders = data.purchaseOrders || [];
    data.purchaseOrders.push(p);
    this.save(data);
    this.request('createPO', 'POST', p);
    return p;
  },

  updatePOStatus(id, status, trackingNo) {
    const data = this.load();
    data.purchaseOrders = (data.purchaseOrders || []).map(function(po) {
      if (po.id !== id) return po;
      const updated = Object.assign({}, po, { status: status });
      if (status === 'shipped') { updated.inTransit = true; }
      if (status === 'arrived') { updated.inTransit = false; updated.receivedAt = new Date().toISOString(); }
      if (trackingNo) updated.trackingNo = trackingNo;
      return updated;
    });
    this.save(data);
    this.request('updatePO', 'PUT', { id: id, status: status, trackingNo: trackingNo });
  },

  // === Settings ===
  updateSettings(newSettings) {
    const data = this.load();
    data.settings = Object.assign({}, data.settings, newSettings);
    this.save(data);
  },

  // === Backup ===
  exportData() {
    const data = this.load();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nlk-inventory-backup-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        const current = this.load();
        const merged = Object.assign({}, current, imported);
        this.save(merged);
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