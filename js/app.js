if (typeof window.NLK === 'undefined') { window.NLK = {}; }
var NLK = window.NLK;

document.addEventListener('alpine:init', function() {
  Alpine.data('nlkApp', function() {
    return {
      page: 'analytics',
      evalPeriod: 'bulanan',
      sidebarCollapsed: false,
      data: NLK.api.load(),
      searchQuery: '',
      selectedCategory: 'all',
      showModal: { inventory: false, sales: false, po: false, partDetail: false, importCSV: false },
      form: { inventory: {}, sales: {}, po: {}, poItems: [] },
      poDraft: { supplierId: '', items: [] },
      poNewItem: { sku: '', qty: 1 },
      selectedPart: null,
      csvText: '',
      importProgress: '',
      syncStatus: '',

      sortInv: { col: 'id', dir: 'asc' },
      sortSales: { col: 'tanggal', dir: 'desc' },
      sortPO: { col: 'tanggalOrder', dir: 'desc' },

      chartInstances: {},

      // Cached map for ultra-fast itemAvg calculations
      salesAvgMap: {},

      init() {
        NLK.api.init();
        this.data = NLK.api.load();
        this.rebuildAvgMap();
        
        var self = this;
        window.addEventListener('nlk-data-changed', function() {
          self.data = NLK.api.load();
          self.rebuildAvgMap();
          if (self.page === 'analytics') setTimeout(function() { self.renderEvalCharts(); }, 50);
        });
        
        this.$watch('page', function(val) {
          if (val === 'analytics') setTimeout(function() { self.renderEvalCharts(); }, 100);
        });
        this.$watch('evalPeriod', function() {
          setTimeout(function() { self.renderEvalCharts(); }, 50);
        });

        setTimeout(function() { self.renderEvalCharts(); }, 200);
      },

      rebuildAvgMap() {
        this.salesAvgMap = NLK.buildSalesMap(this.sales, 30);
      },

      toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
      },

      async syncNow() {
        this.syncStatus = 'Sync...';
        if (NLK.api.remoteUrl()) {
          await NLK.api.syncFromRemote();
          this.data = NLK.api.load();
          this.rebuildAvgMap();
          this.syncStatus = 'Sinkronisasi berhasil: ' + (this.data.inventory || []).length + ' item';
          var self = this;
          setTimeout(function() { self.syncStatus = ''; }, 3000);
        } else {
          this.syncStatus = 'URL Apps Script belum diisi di Settings';
        }
      },

      get inventory() { return this.data.inventory || []; },
      get sales() { return this.data.sales || []; },
      get pos() { return this.data.purchaseOrders || []; },
      get suppliers() { return this.data.suppliers || []; },
      get settings() { return this.data.settings || {}; },

      get currentMonthName() {
        return new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      },

      get categories() {
        return ['all'].concat([...new Set(this.inventory.map(i => i.kategori))].sort());
      },

      sortBy(type, col) {
        var sortObj = type === 'inv' ? this.sortInv : (type === 'sales' ? this.sortSales : this.sortPO);
        if (sortObj.col === col) {
          sortObj.dir = sortObj.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sortObj.col = col;
          sortObj.dir = 'asc';
        }
      },

      sortIcon(type, col) {
        var sortObj = type === 'inv' ? this.sortInv : (type === 'sales' ? this.sortSales : this.sortPO);
        if (sortObj.col !== col) return 'fa-sort text-slate-600';
        return sortObj.dir === 'asc' ? 'fa-sort-up text-indigo-400' : 'fa-sort-down text-indigo-400';
      },

      get filteredInventory() {
        const q = this.searchQuery.toLowerCase();
        var self = this;
        var list = this.inventory.filter(i => {
          const matchQ = !q || i.nama.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || (i.lokasiRak || '').toLowerCase().includes(q);
          const matchC = this.selectedCategory === 'all' || i.kategori === this.selectedCategory;
          return matchQ && matchC;
        });

        var col = this.sortInv.col;
        var dir = this.sortInv.dir === 'asc' ? 1 : -1;

        return list.sort(function(a, b) {
          var valA = a[col], valB = b[col];
          if (col === 'avgDaily') { valA = self.itemAvg(a); valB = self.itemAvg(b); }
          if (col === 'daysLeft') { valA = self.itemDaysLeft(a); valB = self.itemDaysLeft(b); }
          if (col === 'status') { valA = self.itemStatus(a); valB = self.itemStatus(b); }

          if (valA === Infinity) valA = 999999;
          if (valB === Infinity) valB = 999999;

          if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
          return ((valA || 0) - (valB || 0)) * dir;
        });
      },

      get sortedSales() {
        var col = this.sortSales.col;
        var dir = this.sortSales.dir === 'asc' ? 1 : -1;

        var list = this.salesWithName();
        return list.sort(function(a, b) {
          var valA = a[col], valB = b[col];
          if (col === 'total') { valA = a.jumlah * a.hargaJual; valB = b.jumlah * b.hargaJual; }
          if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
          return ((valA || 0) - (valB || 0)) * dir;
        });
      },

      get sortedPOs() {
        var col = this.sortPO.col;
        var dir = this.sortPO.dir === 'asc' ? 1 : -1;

        return this.pos.slice().sort(function(a, b) {
          var valA = a[col], valB = b[col];
          if (col === 'totalQty') {
            valA = (a.items || []).reduce((s, i) => s + i.qty, 0);
            valB = (b.items || []).reduce((s, i) => s + i.qty, 0);
          }
          if (col === 'totalCost') {
            valA = (a.items || []).reduce((s, i) => s + i.qty * i.hargaBeliCNY, 0);
            valB = (b.items || []).reduce((s, i) => s + i.qty * i.hargaBeliCNY, 0);
          }
          if (typeof valA === 'string') return (valA || '').localeCompare(valB || '') * dir;
          return ((valA || 0) - (valB || 0)) * dir;
        });
      },

      get criticalItems() {
        var self = this;
        return this.inventory
          .filter(function(i) { return self.itemStatus(i) === 'critical'; })
          .map(function(i) { return Object.assign({}, i, {
            _avgDaily: self.itemAvg(i),
            _daysLeft: self.itemDaysLeft(i),
            _reorderQty: self.itemReorderQty(i),
            _reorderPoint: self.itemReorderPoint(i)
          }); });
      },

      get warnItems() {
        var self = this;
        return this.inventory.filter(function(i) { return self.itemStatus(i) === 'warn'; });
      },

      get activePOs() {
        return this.pos.filter(p => p.status !== 'arrived' && p.status !== 'cancelled');
      },

      get stats() {
        const inv = this.inventory;
        const sales = this.sales;
        const kurs = this.settings.kursCNYtoIDR || 16500;
        const invValue = inv.reduce((sum, i) => sum + (i.stok * (i.hargaBeliIDR || i.hargaBeliCNY * kurs)), 0);
        const totalSold = sales.reduce((sum, s) => sum + s.jumlah, 0);
        const revenue = sales.reduce((sum, s) => sum + (s.jumlah * s.hargaJual), 0);
        const lowStock = this.criticalItems.length;
        const inTransit = this.pos.filter(p => p.status === 'in transit' || p.status === 'shipped').length;
        return { invValue, totalSold, revenue, lowStock, inTransit };
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

      // Fast cached avg
      itemAvg(item) {
        if (!item || !item.id) return 0;
        return this.salesAvgMap[item.id] || 0;
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

      setPage(p) { this.page = p; },

      evalRanges() {
        return {
          mingguan: { label: 'Mingguan', buckets: 7, daysPerBucket: 1 },
          bulanan: { label: 'Bulanan', buckets: 4, daysPerBucket: 7 },
          kuartal: { label: 'Kuartal', buckets: 3, daysPerBucket: 30 },
          semester: { label: 'Semester', buckets: 6, daysPerBucket: 30 },
          tahunan: { label: 'Tahunan', buckets: 12, daysPerBucket: 30 }
        };
      },

      evalPeriodData() {
        var ranges = this.evalRanges();
        var cfg = ranges[this.evalPeriod] || ranges.bulanan;
        var labels = [];
        var salesQty = [];
        var salesRevenue = [];
        var today = new Date();

        for (var b = 0; b < cfg.buckets; b++) {
          var endDate = new Date(today);
          endDate.setDate(today.getDate() - (b * cfg.daysPerBucket));
          var startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - cfg.daysPerBucket + 1);

          if (cfg.buckets === 7) {
            labels.push(endDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }));
          } else if (cfg.buckets === 4) {
            labels.push('M' + (cfg.buckets - b));
          } else if (cfg.buckets === 3) {
            labels.push('Bln ' + (cfg.buckets - b));
          } else if (cfg.buckets === 6) {
            labels.push('Bln ' + (cfg.buckets - b));
          } else {
            labels.push('Bln ' + (cfg.buckets - b));
          }

          var startStr = startDate.toISOString().slice(0, 10);
          var endStr = endDate.toISOString().slice(0, 10);

          var periodSales = this.sales.filter(function(s) {
            return s.tanggal >= startStr && s.tanggal <= endStr;
          });

          var qty = periodSales.reduce(function(sum, s) { return sum + (s.jumlah || 0); }, 0);
          var rev = periodSales.reduce(function(sum, s) { return sum + (s.jumlah * s.hargaJual); }, 0);
          salesQty.push(qty);
          salesRevenue.push(rev);
        }

        salesQty.reverse();
        salesRevenue.reverse();
        labels.reverse();

        return { labels: labels, salesQty: salesQty, salesRevenue: salesRevenue, cfg: cfg };
      },

      renderEvalCharts() {
        var data = this.evalPeriodData();
        var self = this;
        var periods = ['salesQty', 'salesRevenue'];

        var colors = {
          salesQty: { border: '#818cf8', bg: 'rgba(99, 102, 241, 0.4)', label: 'Qty Terjual (pcs)' },
          salesRevenue: { border: '#22d3ee', bg: 'rgba(34, 211, 238, 0.4)', label: 'Omset Penjualan (Rp)' }
        };

        periods.forEach(function(key) {
          var el = document.getElementById('evalChart_' + key);
          if (!el) return;
          
          if (self.chartInstances[key]) {
            self.chartInstances[key].destroy();
            delete self.chartInstances[key];
          }

          var col = colors[key];
          self.chartInstances[key] = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
              labels: data.labels,
              datasets: [{
                label: col.label,
                data: data[key],
                backgroundColor: col.bg,
                borderColor: col.border,
                borderWidth: 2,
                borderRadius: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: { color: '#f1f5f9', font: { size: 12, weight: '600' }, boxWidth: 12 }
                }
              },
              scales: {
                x: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
                y: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' }, beginAtZero: true }
              }
            }
          });
        });
      },

      evalPeriodsList() {
        return [
          { id: 'mingguan', label: 'Mingguan', days: 7 },
          { id: 'bulanan', label: 'Bulanan', days: 30 },
          { id: 'kuartal', label: 'Kuartal', days: 90 },
          { id: 'semester', label: 'Semester', days: 180 },
          { id: 'tahunan', label: 'Tahunan', days: 365 }
        ];
      },

      periodSummary(periodDays) {
        var cutoff = NLK.daysAgo(periodDays);
        var periodSales = this.sales.filter(function(s) { return s.tanggal >= cutoff; });
        var qty = periodSales.reduce(function(sum, s) { return sum + (s.jumlah || 0); }, 0);
        var revenue = periodSales.reduce(function(sum, s) { return sum + (s.jumlah * s.hargaJual); }, 0);
        var uniqueDays = new Set(periodSales.map(function(s) { return s.tanggal; })).size;
        var avgPerDay = uniqueDays > 0 ? qty / uniqueDays : 0;
        var topItems = {};
        periodSales.forEach(function(s) {
          if (!topItems[s.sku]) topItems[s.sku] = 0;
          topItems[s.sku] += s.jumlah;
        });
        var bestSku = Object.keys(topItems).sort(function(a, b) { return topItems[b] - topItems[a]; })[0];
        var bestNama = this.inventory.find(function(i) { return i.id === bestSku; });
        return {
          qty: qty,
          revenue: revenue,
          avgPerDay: avgPerDay,
          bestSku: bestSku,
          bestNama: bestNama ? bestNama.nama : (bestSku || '-')
        };
      },

      evalSummary() {
        var self = this;
        return this.evalPeriodsList().map(function(p) {
          var s = self.periodSummary(p.days);
          return {
            id: p.id,
            label: p.label,
            days: p.days,
            qty: s.qty,
            revenue: s.revenue,
            avgPerDay: s.avgPerDay,
            bestNama: s.bestNama
          };
        });
      },

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
        this.rebuildAvgMap();
        this.closeModal('inventory');
      },
      deletePart(item) {
        if (confirm('Hapus ' + item.nama + '?')) {
          NLK.api.deletePart(item.id);
          this.data = NLK.api.load();
          this.rebuildAvgMap();
        }
      },

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
        this.rebuildAvgMap();
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
        this.rebuildAvgMap();
        this.closeModal('sales');
      },

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

      salesWithName() {
        return this.sales.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).map(s => {
          const part = this.inventory.find(i => i.id === s.sku);
          return Object.assign({}, s, { nama: part ? part.nama : s.sku });
        });
      },

      saveSettings() {
        NLK.api.updateSettings(this.settings);
        alert('Pengaturan disimpan');
      },
      resetDemo() {
        if (confirm('Reset semua data ke contoh 150 item awal?')) {
          NLK.api.save(NLK.SEED);
          this.data = NLK.api.load();
          this.rebuildAvgMap();
        }
      },

      fmtRp: NLK.fmtRp,
      fmtDate: NLK.fmtDate,
      stockStatusBg: NLK.statusBg,
      stockStatusColor: NLK.statusColor,
      stockStatusLabel: NLK.statusLabel
    };
  });
});