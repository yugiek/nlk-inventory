if (typeof window.NLK === 'undefined') { window.NLK = {}; }
var NLK = window.NLK;

document.addEventListener('alpine:init', function() {
  Alpine.data('nlkApp', function() {
    return {
      // ==== STATE ====
      page: 'dashboard',
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

      // Sorting states
      sortInv: { col: 'id', dir: 'asc' },
      sortSales: { col: 'tanggal', dir: 'desc' },
      sortPO: { col: 'tanggalOrder', dir: 'desc' },
      sortReorder: { col: 'reorderQty', dir: 'desc' },

      chartInstances: {},
      salesAvgMap: {},

      // ==== LIFECYCLE ====
      init() {
        NLK.api.init();
        this.data = NLK.api.load();
        this.rebuildAvgMap();
        
        var self = this;
        window.addEventListener('nlk-data-changed', function() {
          self.data = NLK.api.load();
          self.rebuildAvgMap();
          if (self.page === 'dashboard') setTimeout(function() { self.renderEvalCharts(); }, 50);
          if (self.page === 'laporan') setTimeout(function() { self.renderReportCharts(); }, 50);
        });
        
        this.$watch('page', function(val) {
          if (val === 'dashboard') setTimeout(function() { self.renderEvalCharts(); }, 100);
          if (val === 'laporan') setTimeout(function() { self.renderReportCharts(); }, 100);
        });
        this.$watch('evalPeriod', function() {
          if (self.page === 'dashboard') setTimeout(function() { self.renderEvalCharts(); }, 50);
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

      // ==== GETTERS ====
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

      // ==== SORTING ====
      sortBy(type, col) {
        var sortObj = this['sort' + type.charAt(0).toUpperCase() + type.slice(1)];
        if (!sortObj) {
          if (type === 'inv') sortObj = this.sortInv;
          else if (type === 'sales') sortObj = this.sortSales;
          else if (type === 'po') sortObj = this.sortPO;
          else if (type === 'reorder') sortObj = this.sortReorder;
        }
        if (sortObj.col === col) {
          sortObj.dir = sortObj.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sortObj.col = col;
          sortObj.dir = 'asc';
        }
      },

      sortIcon(type, col) {
        var sortObj = type === 'inv' ? this.sortInv : (type === 'sales' ? this.sortSales : (type === 'po' ? this.sortPO : this.sortReorder));
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
          if (valA === Infinity) valA = 999999; if (valB === Infinity) valB = 999999;
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
          if (col === 'totalQty') { valA = (a.items || []).reduce((s, i) => s + i.qty, 0); valB = (b.items || []).reduce((s, i) => s + i.qty, 0); }
          if (col === 'totalCost') { valA = (a.items || []).reduce((s, i) => s + i.qty * i.hargaBeliCNY, 0); valB = (b.items || []).reduce((s, i) => s + i.qty * i.hargaBeliCNY, 0); }
          if (typeof valA === 'string') return (valA || '').localeCompare(valB || '') * dir;
          return ((valA || 0) - (valB || 0)) * dir;
        });
      },

      get reorderList() {
        var self = this;
        var list = this.inventory.map(function(i) {
          return Object.assign({}, i, {
            avg: self.itemAvg(i),
            days: self.itemDaysLeft(i),
            rp: self.itemReorderPoint(i),
            rq: self.itemReorderQty(i),
            stat: self.itemStatus(i)
          });
        });
        var col = this.sortReorder.col;
        var dir = this.sortReorder.dir === 'asc' ? 1 : -1;
        return list.sort(function(a, b) {
          var valA = a[col], valB = b[col];
          if (valA === Infinity) valA = 999999; if (valB === Infinity) valB = 999999;
          if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
          return ((valA || 0) - (valB || 0)) * dir;
        });
      },

      // ==== ANALYSIS HELPERS ====
      itemAvg(item) { return item && item.id ? (this.salesAvgMap[item.id] || 0) : 0; },
      itemStatus(item) { return NLK.stockStatus(item, this.itemAvg(item)); },
      itemDaysLeft(item) { var avg = this.itemAvg(item); return avg > 0 ? Math.floor(item.stok / avg) : Infinity; },
      itemReorderPoint(item) { var avg = this.itemAvg(item); return Math.ceil(avg * (item.leadTimeHari || 30) + avg * (this.settings.safetyStockDays || 7)); },
      itemReorderQty(item) {
        var avg = this.itemAvg(item); if (avg <= 0) return 0;
        var inTransit = this.pos.filter(p => p.status !== 'arrived' && p.status !== 'cancelled').reduce((sum, p) => sum + (p.items || []).filter(i => i.sku === item.id).reduce((s2, i) => s2 + i.qty, 0), 0);
        var qty = avg * ((item.leadTimeHari || 30) + (this.settings.safetyStockDays || 7)) - item.stok - inTransit;
        return qty > 0 ? Math.ceil(qty) : 0;
      },

      get stats() {
        const inv = this.inventory, sales = this.sales, kurs = this.settings.kursCNYtoIDR || 16500;
        const invValue = inv.reduce((sum, i) => sum + (i.stok * (i.hargaBeliCNY || 0) * kurs), 0);
        const totalSold = sales.reduce((sum, s) => sum + s.jumlah, 0);
        const revenue = sales.reduce((sum, s) => sum + (s.jumlah * s.hargaJual), 0);
        const lowStock = inv.filter(i => this.itemStatus(i) === 'critical').length;
        const inTransit = this.pos.filter(p => p.status === 'in transit' || p.status === 'shipped').length;
        return { invValue, totalSold, revenue, lowStock, inTransit };
      },

      get topMoving() {
        const counts = {}; this.sales.forEach(s => { if (!counts[s.sku]) counts[s.sku] = 0; counts[s.sku] += s.jumlah; });
        return Object.keys(counts).map(sku => { var item = this.inventory.find(i => i.id === sku); return { sku, nama: item ? item.nama : sku, qty: counts[sku] }; }).sort((a, b) => b.qty - a.qty).slice(0, 5);
      },

      get activePOs() { return this.pos.filter(p => p.status !== 'arrived' && p.status !== 'cancelled'); },

      // ==== CHART LOGIC ====
      evalRanges() { return { mingguan: { buckets: 7, days: 1 }, bulanan: { buckets: 4, days: 7 }, kuartal: { buckets: 3, days: 30 }, semester: { buckets: 6, days: 30 }, tahunan: { buckets: 12, days: 30 } }; },
      evalPeriodData() {
        var cfg = this.evalRanges()[this.evalPeriod] || this.evalRanges().bulanan, labels = [], q = [], r = [], today = new Date();
        for (var b = 0; b < cfg.buckets; b++) {
          var end = new Date(today); end.setDate(today.getDate() - (b * cfg.days));
          var start = new Date(end); start.setDate(end.getDate() - cfg.days + 1);
          labels.push(this.evalPeriod === 'mingguan' ? end.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : 'P' + (cfg.buckets - b));
          var pSales = this.sales.filter(s => s.tanggal >= start.toISOString().slice(0,10) && s.tanggal <= end.toISOString().slice(0,10));
          q.push(pSales.reduce((s, x) => s + (x.jumlah || 0), 0));
          r.push(pSales.reduce((s, x) => s + (x.jumlah * x.hargaJual), 0));
        }
        return { labels: labels.reverse(), salesQty: q.reverse(), salesRevenue: r.reverse() };
      },
      renderEvalCharts() {
        var data = this.evalPeriodData(), self = this;
        [['salesQty', '#818cf8', 'rgba(99,102,241,0.3)', 'Qty'], ['salesRevenue', '#22d3ee', 'rgba(34,211,238,0.3)', 'Rp']].forEach(c => {
          var el = document.getElementById('evalChart_' + c[0]); if (!el) return;
          if (self.chartInstances[c[0]]) self.chartInstances[c[0]].destroy();
          self.chartInstances[c[0]] = new Chart(el.getContext('2d'), {
            type: 'bar', data: { labels: data.labels, datasets: [{ label: c[3], data: data[c[0]], backgroundColor: c[2], borderColor: c[1], borderWidth: 2, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: '#f1f5f9' } } }, scales: { x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(51,65,85,0.3)' } }, y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(51,65,85,0.3)' }, beginAtZero: true } } }
          });
        });
      },

      evalSummary() {
        var self = this;
        return [{l:'Mingguan', d:7},{l:'Bulanan', d:30},{l:'Kuartal', d:90},{l:'Semester', d:180},{l:'Tahunan', d:365}].map(p => {
          var cutoff = NLK.daysAgo(p.d), pSales = this.sales.filter(s => s.tanggal >= cutoff), qty = pSales.reduce((s,x)=>s+(x.jumlah||0),0), rev = pSales.reduce((s,x)=>s+(x.jumlah*x.hargaJual),0);
          return { label: p.l, qty: qty, revenue: rev };
        });
      },

      // ==== REPORT LOGIC ====
      reportPeriod: 'bulanan',
      reportData() {
        var days = { mingguan: 7, bulanan: 30, kuartal: 90, semester: 180, tahunan: 365 }[this.reportPeriod] || 30;
        var cutoff = NLK.daysAgo(days), pSales = this.sales.filter(s => s.tanggal >= cutoff), inv = this.inventory, kurs = this.settings.kursCNYtoIDR || 16500;
        var skuCounts = {}; pSales.forEach(s => { if (!skuCounts[s.sku]) skuCounts[s.sku] = { q: 0, r: 0 }; skuCounts[s.sku].q += s.jumlah; skuCounts[s.sku].r += s.jumlah * s.hargaJual; });
        var sorted = Object.keys(skuCounts).sort((a,b) => skuCounts[b].q - skuCounts[a].q);
        return {
          periodLabel: this.reportPeriod.toUpperCase(),
          totalSold: pSales.reduce((s,x)=>s+(x.jumlah||0),0),
          totalRevenue: pSales.reduce((s,x)=>s+(x.jumlah*x.hargaJual),0),
          invValue: inv.reduce((s,i)=>s+(i.stok*(i.hargaBeliCNY||0)*kurs),0),
          critical: inv.filter(i => this.itemStatus(i) === 'critical').length,
          warn: inv.filter(i => this.itemStatus(i) === 'warn').length,
          ok: inv.filter(i => this.itemStatus(i) === 'ok').length,
          top5: sorted.slice(0,5).map(sku => { var it = inv.find(i=>i.id===sku); return {sku, nama:it?it.nama:sku, q:skuCounts[sku].q, r:skuCounts[sku].r}; }),
          reorder: inv.filter(i => this.itemReorderQty(i) > 0).map(i => ({id:i.id, n:i.nama, s:i.stok, rp:this.itemReorderPoint(i), rq:this.itemReorderQty(i)})).sort((a,b)=>b.rq-a.rq).slice(0,10),
          date: new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
        };
      },
      renderReportCharts() {
        var rd = this.reportData(), self = this;
        var donutEl = document.getElementById('reportDonut');
        if (donutEl) {
          if (self.chartInstances['reportDonut']) self.chartInstances['reportDonut'].destroy();
          self.chartInstances['reportDonut'] = new Chart(donutEl.getContext('2d'), {
            type: 'doughnut', data: { labels: ['Aman', 'Warn', 'Crit'], datasets: [{ data: [rd.ok, rd.warn, rd.critical], backgroundColor: ['#10b981', '#eab308', '#ef4444'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } } }
          });
        }
      },
      exportPDF() { window.print(); },
      exportCSV() {
        var rd = this.reportData(), rows = [['LAPORAN INVENTORY NLK'],['Periode',rd.periodLabel],['Tanggal',rd.date],[],['RINGKASAN'],['Omset',rd.totalRevenue],['Terjual',rd.totalSold],['Nilai Inv',rd.invValue],[],['TOP 5'],['SKU','Nama','Qty','Omset']];
        rd.top5.forEach(r => rows.push([r.sku, r.nama, r.q, r.r]));
        var csv = rows.map(r => r.join(',')).join('\n'), blob = new Blob(['\ufeff'+csv], {type:'text/csv'}), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'Laporan-NLK-'+rd.periodLabel+'.csv'; a.click();
      },

      // ==== MODAL ACTIONS ====
      setPage(p) { this.page = p; },
      saveInventory() {
        var f = this.form.inventory; if (!f.nama) return;
        f.stok = Number(f.stok)||0; f.minStok = Number(f.minStok)||0; f.hargaBeliCNY = Number(f.hargaBeliCNY)||0; f.hargaJual = Number(f.hargaJual)||0; f.leadTimeHari = Number(f.leadTimeHari)||30;
        if (f.id) NLK.api.updatePart(f); else NLK.api.addPart(f);
        this.data = NLK.api.load(); this.rebuildAvgMap(); this.closeModal('inventory');
      },
      deletePart(item) { if (confirm('Hapus '+item.nama+'?')) { NLK.api.deletePart(item.id); this.data = NLK.api.load(); this.rebuildAvgMap(); } },
      saveSale() {
        var f = this.form.sales; var part = this.inventory.find(i=>i.id===f.sku); if (!part || part.stok < f.jumlah) return;
        f.hargaJual = part.hargaJual; NLK.api.addSale(f); part.stok -= f.jumlah; NLK.api.updatePart(part);
        this.data = NLK.api.load(); this.rebuildAvgMap(); this.closeModal('sales');
      },
      savePO() {
        if (!this.poDraft.supplierId || !this.poDraft.items.length) return;
        var sup = this.suppliers.find(s=>s.id===this.poDraft.supplierId);
        var po = { id: NLK.genId('PO'), tanggalOrder: this.poDraft.tanggal, supplierId: this.poDraft.supplierId, supplierName: sup?sup.nama:'', items: this.poDraft.items, estimasiTiba: this.poDraft.estimasiTiba, status: 'ordered', catatan: this.poDraft.catatan, createdAt: new Date().toISOString() };
        NLK.api.createPO(po); this.data = NLK.api.load(); this.closeModal('po');
      },
      updatePO(poId, status) {
        NLK.api.updatePOStatus(poId, status);
        if (status === 'arrived') {
          var po = this.pos.find(p=>p.id===poId);
          if (po) po.items.forEach(i => { var pt = this.inventory.find(x=>x.id===i.sku); if (pt) { pt.stok += i.qty; NLK.api.updatePart(pt); } });
        }
        this.data = NLK.api.load();
      },
      savePOQuick(item) {
        var po = { id: NLK.genId('PO'), tanggalOrder: NLK.today(), supplierId: 'SUP-001', supplierName: 'Guangzhou Auto Parts', items: [{sku:item.id, qty:item._reorderQty||50, hargaBeliCNY:item.hargaBeliCNY}], estimasiTiba: NLK.addDays(NLK.today(), 30), status: 'ordered', createdAt: new Date().toISOString() };
        NLK.api.createPO(po); this.data = NLK.api.load(); alert('PO dibuat!');
      },
      addPOItem() {
        var it = this.poNewItem; if (!it.sku) return;
        var ex = this.poDraft.items.find(i=>i.sku===it.sku);
        if (ex) ex.qty += it.qty; else this.poDraft.items.push({sku:it.sku, qty:it.qty, hargaBeliCNY: this.inventory.find(x=>x.id===it.sku).hargaBeliCNY});
        this.poNewItem = {sku:'', qty:1};
      },
      removePOItem(idx) { this.poDraft.items.splice(idx, 1); },
      poTotal() { return this.poDraft.items.reduce((s,i)=>s+(i.qty*i.hargaBeliCNY),0); },
      processCSVImport() {
        var items = NLK.parseCSV(this.csvText); if (!items.length) return;
        items.forEach(r => { if (r.nama) NLK.api.addPart({id:r.id||NLK.genId('NLK'), nama:r.nama, kategori:r.kategori, stok:Number(r.stok)||0, minStok:Number(r.minStok)||5, hargaBeliCNY:Number(r.hargaBeliCNY)||10, hargaJual:Number(r.hargaJual)||150000, lokasiRak:r.lokasiRak, leadTimeHari:Number(r.leadTimeHari)||30, aktif:true}); });
        this.data = NLK.api.load(); this.rebuildAvgMap(); this.importProgress = 'Import Berhasil!'; setTimeout(() => this.closeModal('importCSV'), 1000);
      },
      handleFileUpload(e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = (evt) => this.csvText = evt.target.result; r.readAsText(f); },
      saveSettings() { NLK.api.updateSettings(this.settings); alert('Disimpan'); },
      resetDemo() { if (confirm('Reset?')) { NLK.api.save(NLK.SEED); this.data = NLK.api.load(); this.rebuildAvgMap(); } },

      // ==== FORMATTING ====
      fmtRp: NLK.fmtRp,
      fmtDate: NLK.fmtDate,
      poStatusLabel: s => ({ordered:'Ordered', shipped:'Shipped', 'in transit':'In Transit', arrived:'Arrived', cancelled:'Cancelled'}[s]||s),
      poStatusColor: s => ({ordered:'bg-blue-500/10 text-blue-400', shipped:'bg-purple-500/10 text-purple-400', 'in transit':'bg-yellow-500/10 text-yellow-400', arrived:'bg-emerald-500/10 text-emerald-400', cancelled:'bg-red-500/10 text-red-400'}[s]||''),
      stockStatusBg: NLK.statusBg,
      stockStatusColor: NLK.statusColor,
      stockStatusLabel: NLK.statusLabel,
      salesWithName() { return this.sales.slice().sort((a,b)=>b.tanggal.localeCompare(a.tanggal)).map(s => { var p = this.inventory.find(i=>i.id===s.sku); return Object.assign({}, s, {nama:p?p.nama:s.sku}); }); }
    };
  });
});