const NLK = window.NLK || {};
window.NLK = NLK;

document.addEventListener('alpine:init', function() {
  Alpine.data('nlkApp', function() {
    return {
      // State
      page: 'dashboard',
      data: NLK.api.load(),
      searchQuery: '',
      selectedCategory: 'all',
      showModal: { inventory: false, sales: false, po: false, partDetail: false, importCSV: false },
      form: {
        inventory: {},
        sales: {},
        po: {},
        poItems: []
      },
      poDraft: { supplierId: '', items: [] },
      poNewItem: { sku: '', qty: 1 },
      selectedPart: null,
      csvText: '',
      importProgress: '',

      // Lifecycle
      init() {
        NLK.api.init();
        this.data = NLK.api.load();
        window.addEventListener('nlk-data-changed', () => {
          this.data = NLK.api.load();
        });
      },

      // Getters
      get inventory() { return this.data.inventory || []; },
      get sales() { return this.data.sales || []; },
      get pos() { return this.data.purchaseOrders || []; },
      get suppliers() { return this.data.suppliers || []; },
      get settings() { return this.data.settings || {}; },

      get categories() {
        return ['all'].concat([...new Set(this.inventory.map(i => i.kategori))].sort());
      },

      get filteredInventory() {
        const q = this.searchQuery.toLowerCase();
        return this.inventory.filter(i => {
          const matchQ = !q || i.nama.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || (i.lokasiRak || '').toLowerCase().includes(q);
          const matchC = this.selectedCategory === 'all' || i.kategori === this.selectedCategory;
          return matchQ && matchC;
        });
      },

      get criticalItems() {
        return this.inventory
          .filter(i => this.itemStatus(i) === 'critical')
          .map(i => Object.assign({}, i, {
            _avgDaily: this.itemAvg(i),
            _daysLeft: this.itemDaysLeft(i),
            _reorderQty: this.itemReorderQty(i),
            _reorderPoint: this.itemReorderPoint(i)
          }));
      },

      get warnItems() {
        return this.inventory.filter(i => this.itemStatus(i) === 'warn');
      },

      get activePOs() {
        return this.pos.filter(p => p.status !== 'arrived' && p.status !== 'cancelled');
      },

      get stats() {
        const inv = this.inventory;
        const sales = this.sales;
        const invValue = inv.reduce((sum, i) => sum + (i.stok * (i.hargaBeliIDR || i.hargaBeliCNY * (this.settings.kursCNYtoIDR || 16500))), 0);
        const totalSold = sales.reduce((sum, s) => sum + s.jumlah, 0);
        const revenue = sales.reduce((sum, s) => sum + (s.jumlah * s.hargaJual), 0);
        const lowStock = this.criticalItems.length;
        const inTransit = this.pos.filter(p => p.status === 'in transit' || p.status === 'shipped').length;
        const stockoutValue = inv
          .filter(i => this.itemStatus(i) === 'critical')
          .reduce((sum, i) => sum + (i.stok * (i.hargaBeliIDR || i.hargaBeliCNY * (this.settings.kursCNYtoIDR || 16500))), 0);
        return { invValue, totalSold, revenue, lowStock, inTransit, stockoutValue };
      },

      get recentSales() {
        return this.sales.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 8);
      },

      get topMoving() {
        const counts = {};
        this.sales.forEach(s => {
          if (!counts[s.sku]) counts[s.sku] = 0;
          counts[s.sku] += s.jumlah;
        });
        return Object.keys(counts)
          .map(sku => {
            const item = this.inventory.find(i => i.id === sku);
            return { sku, nama: item ? item.nama : sku, qty: counts[sku] };
          })
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5);
      },

      // Analysis helpers
      itemAvg(item) {
        return NLK.avgDailySales(this.sales, item.id, 30);
      },
      itemStatus(item) {
        return NLK.stockStatus(item, this.itemAvg(item));
      },
      itemDaysLeft(item) {
        const avg = this.itemAvg(item);
        return avg > 0 ? Math.floor(item.stok / avg) : Infinity;
      },
      itemReorderPoint(item) {
        const avg = this.itemAvg(item);
        return Math.ceil(avg * (item.leadTimeHari || 30) + avg * (this.settings.safetyStockDays || 7));
      },
      itemReorderQty(item) {
        const avg = this.itemAvg(item);
        if (avg <= 0) return 0;
        const inTransit = this.pos
          .filter(p => p.status !== 'arrived' && p.status !== 'cancelled')
          .reduce((sum, p) => sum + (p.items || []).filter(i => i.sku === item.id).reduce((s2, i) => s2 + i.qty, 0), 0);
        const qty = avg * ((item.leadTimeHari || 30) + (this.settings.safetyStockDays || 7)) - item.stok - inTransit;
        return qty > 0 ? Math.ceil(qty) : 0;
      },

      // Navigation
      setPage(p) { this.page = p; },

      // Modals
      openModal(type, item) {
        if (type === 'inventory') {
          this.form.inventory = item ? JSON.parse(JSON.stringify(item)) : {
            nama: '', kategori: '', stok: 0, minStok: 0,
            hargaBeliCNY: 0, hargaJual: 0, lokasiRak: '', leadTimeHari: 30
          };
        } else if (type === 'sales') {
          this.form.sales = { sku: item ? item.id : '', jumlah: 1, tanggal: NLK.today() };
        } else if (type === 'po') {
          this.poDraft = { supplierId: '', items: [], tanggal: NLK.today(), estimasiTiba: '', catatan: '' };
          this.poNewItem = { sku: '', qty: 1 };
        } else if (type === 'partDetail') {
          this.selectedPart = item;
        } else if (type === 'importCSV') {
          this.csvText = 'id,nama,kategori,stok,minStok,hargaBeliCNY,hargaJual,lokasiRak,leadTimeHari\nNLK-9001,Air Brake Valve,Brake,25,10,45,650000,C3-01,30\nNLK-9002,Piston Ring Set,Engine,40,15,30,420000,E1-04,25';
          this.importProgress = '';
        }
        this.showModal[type] = true;
      },
      closeModal(type) { this.showModal[type] = false; },

      // Inventory actions
      saveInventory() {
        const f = this.form.inventory;
        if (!f.nama || !f.kategori) { alert('Nama dan kategori wajib diisi'); return; }
        f.stok = Number(f.stok) || 0;
        f.minStok = Number(f.minStok) || 0;
        f.hargaBeliCNY = Number(f.hargaBeliCNY) || 0;
        f.hargaJual = Number(f.hargaJual) || 0;
        f.leadTimeHari = Number(f.leadTimeHari) || 30;
        if (f.id) {
          NLK.api.updatePart(f);
        } else {
          NLK.api.addPart(f);
        }
        this.data = NLK.api.load();
        this.closeModal('inventory');
      },
      deletePart(item) {
        if (confirm('Hapus ' + item.nama + '?')) {
          NLK.api.deletePart(item.id);
          this.data = NLK.api.load();
        }
      },

      // Mass Import CSV/Excel
      processCSVImport() {
        if (!this.csvText.trim()) { alert('Data CSV kosong'); return; }
        const items = NLK.parseCSV(this.csvText);
        if (items.length === 0) { alert('Format CSV tidak valid'); return; }
        
        var count = 0;
        var self = this;
        items.forEach(function(row) {
          if (row.nama && row.kategori) {
            var item = {
              id: row.id || NLK.genId('NLK'),
              nama: row.nama,
              kategori: row.kategori,
              stok: Number(row.stok) || 0,
              minStok: Number(row.minStok) || 5,
              hargaBeliCNY: Number(row.hargaBeliCNY) || 10,
              hargaJual: Number(row.hargaJual) || 150000,
              lokasiRak: row.lokasiRak || 'A1-01',
              leadTimeHari: Number(row.leadTimeHari) || 30,
              aktif: true
            };
            NLK.api.addPart(item);
            count++;
          }
        });
        
        this.data = NLK.api.load();
        this.importProgress = 'Berhasil mengimpor ' + count + ' item baru!';
        setTimeout(function() {
          self.closeModal('importCSV');
        }, 1200);
      },

      handleFileUpload(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        var self = this;
        reader.onload = function(evt) {
          self.csvText = evt.target.result;
        };
        reader.readAsText(file);
      },

      // Sales actions
      saveSale() {
        const f = this.form.sales;
        if (!f.sku || !f.jumlah || !f.tanggal) { alert('Lengkapi data penjualan'); return; }
        const part = this.inventory.find(i => i.id === f.sku);
        if (!part) { alert('SKU tidak ditemukan'); return; }
        f.jumlah = Number(f.jumlah);
        if (f.jumlah <= 0) { alert('Jumlah harus > 0'); return; }
        if (part.stok < f.jumlah) { alert('Stok tidak cukup (tersisa ' + part.stok + ')'); return; }
        f.hargaJual = part.hargaJual;
        NLK.api.addSale(f);
        part.stok -= f.jumlah;
        NLK.api.updatePart(part);
        this.data = NLK.api.load();
        this.closeModal('sales');
      },

      // PO actions
      addPOItem() {
        const it = this.poNewItem;
        if (!it.sku || it.qty <= 0) { alert('Pilih SKU dan jumlah'); return; }
        const existing = this.poDraft.items.find(i => i.sku === it.sku);
        if (existing) existing.qty += it.qty;
        else this.poDraft.items.push({ sku: it.sku, qty: it.qty, hargaBeliCNY: this.inventory.find(x => x.id === it.sku).hargaBeliCNY });
        this.poNewItem = { sku: '', qty: 1 };
      },
      removePOItem(index) {
        this.poDraft.items.splice(index, 1);
      },
      poTotal() {
        return this.poDraft.items.reduce((sum, i) => sum + (i.qty * (i.hargaBeliCNY || 0)), 0);
      },
      savePO() {
        if (!this.poDraft.supplierId || this.poDraft.items.length === 0) {
          alert('Pilih supplier dan minimal 1 item');
          return;
        }
        const supplier = this.suppliers.find(s => s.id === this.poDraft.supplierId);
        const leadTime = supplier ? supplier.leadTimeDefault : 30;
        const po = {
          id: NLK.genId('PO'),
          tanggalOrder: this.poDraft.tanggal,
          supplierId: this.poDraft.supplierId,
          supplierName: supplier ? supplier.nama : '',
          items: this.poDraft.items,
          estimasiTiba: this.poDraft.estimasiTiba || NLK.addDays(this.poDraft.tanggal, leadTime),
          status: 'ordered',
          catatan: this.poDraft.catatan
        };
        NLK.api.createPO(po);
        this.data = NLK.api.load();
        this.closeModal('po');
      },
      updatePO(poId, status) {
        NLK.api.updatePOStatus(poId, status);
        if (status === 'arrived') {
          const po = this.pos.find(p => p.id === poId);
          if (po) {
            (po.items || []).forEach(i => {
              const part = this.inventory.find(x => x.id === i.sku);
              if (part) {
                part.stok += i.qty;
                NLK.api.updatePart(part);
              }
            });
          }
        }
        this.data = NLK.api.load();
      },

      // Quick PO
      savePOQuick(item) {
        const supplier = this.suppliers[0];
        const qty = item._reorderQty || 50;
        const po = {
          id: NLK.genId('PO'),
          tanggalOrder: NLK.today(),
          supplierId: supplier.id,
          supplierName: supplier.nama,
          items: [{ sku: item.id, qty: qty, hargaBeliCNY: item.hargaBeliCNY }],
          estimasiTiba: NLK.addDays(NLK.today(), item.leadTimeHari || 30),
          status: 'ordered',
          catatan: 'Auto Reorder untuk SKU ' + item.id
        };
        NLK.api.createPO(po);
        this.data = NLK.api.load();
        alert('PO Otomatis berhasil dibuat untuk ' + item.nama + ' (' + qty + ' pcs)');
      },

      poStatusLabel(status) {
        return { ordered: 'Ordered', shipped: 'Shipped', 'in transit': 'In Transit', arrived: 'Arrived', cancelled: 'Cancelled' }[status] || status;
      },
      poStatusColor(status) {
        return { ordered: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', shipped: 'bg-purple-500/10 text-purple-400 border border-purple-500/20', 'in transit': 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20', arrived: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', cancelled: 'bg-red-500/10 text-red-400 border border-red-500/20' }[status] || 'bg-gray-500/10 text-gray-400';
      },
      poInTransitQty(item) {
        return this.pos
          .filter(p => p.status !== 'arrived' && p.status !== 'cancelled')
          .reduce((sum, p) => sum + (p.items || []).filter(i => i.sku === item.id).reduce((s2, i) => s2 + i.qty, 0), 0);
      },

      // Sales table helpers
      salesWithName() {
        return this.sales.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).map(s => {
          const part = this.inventory.find(i => i.id === s.sku);
          return Object.assign({}, s, { nama: part ? part.nama : s.sku });
        });
      },

      // Settings
      saveSettings() {
        NLK.api.updateSettings(this.settings);
        alert('Pengaturan disimpan');
      },
      resetDemo() {
        if (confirm('Reset semua data ke contoh 150 item awal?')) {
          NLK.api.save(NLK.SEED);
          this.data = NLK.api.load();
        }
      },

      // Formatting
      fmtRp: NLK.fmtRp,
      fmtDate: NLK.fmtDate,
      stockStatusBg: NLK.statusBg,
      stockStatusColor: NLK.statusColor,
      stockStatusLabel: NLK.statusLabel
    };
  });
});