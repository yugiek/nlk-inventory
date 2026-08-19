if (typeof window.NLK === 'undefined') { window.NLK = {}; }
var NLK = window.NLK;

NLK.analytics = {
  salesForSku(sales, sku, days) {
    var cutoff = NLK.daysAgo(days || 90);
    return (sales || []).filter(function(s){ return s.sku === sku && s.tanggal >= cutoff; });
  },
  monthlyDemand(sales, sku, months) {
    months = months || 3;
    var cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
    var cutoffStr = cutoff.toISOString().slice(0,10);
    var total = (sales || []).filter(function(s){ return s.sku === sku && s.tanggal >= cutoffStr; })
      .reduce(function(sum,s){ return sum + Number(s.jumlah || 0); },0);
    return total / months;
  },
  avgDaily(sales, sku, days) {
    days = days || 30;
    var cutoff = NLK.daysAgo(days);
    var total = (sales || []).filter(function(s){ return s.sku === sku && s.tanggal >= cutoff; })
      .reduce(function(sum,s){ return sum + Number(s.jumlah || 0); },0);
    return total / days;
  },
  movement(sales, sku, months) {
    var demand = this.monthlyDemand(sales, sku, months || 3);
    var all = (sales || []).filter(function(s){ return s.sku === sku; });
    if (!all.length || demand <= 0) return 'dead';
    var values = {};
    all.forEach(function(s){ values[s.tanggal] = (values[s.tanggal] || 0) + Number(s.jumlah || 0); });
    var lastSale = Object.keys(values).sort().pop();
    if (lastSale && ((new Date() - new Date(lastSale)) / 86400000) >= 90) return 'dead';
    // Relative thresholds: suitable for mixed SKU portfolios and avoids one hard-coded qty.
    var demands = {};
    var skuSet = {};
    all.forEach(function(s){ skuSet[s.sku] = true; });
    return demand >= 100 ? 'fast' : demand >= 30 ? 'medium' : 'slow';
  },
  incomingQty(pos, sku) {
    return (pos || []).filter(function(p){ return p.status !== 'arrived' && p.status !== 'cancelled'; })
      .reduce(function(sum,p){ return sum + (p.items || []).filter(function(i){ return i.sku === sku; })
        .reduce(function(s,i){ return s + Number(i.qty || 0); },0); },0);
  },
  safetyStock(item, settings, monthlyDemand) {
    if (item && Number(item.safetyStock) > 0) return Number(item.safetyStock);
    var days = Number((item && item.safetyStockDays) || (settings && settings.safetyStockDays) || 7);
    return Math.ceil((Number(monthlyDemand || 0) / 30) * days);
  },
  reorderPoint(item, settings, monthlyDemand) {
    var daily = Number(monthlyDemand || 0) / 30;
    var lead = Number((item && item.leadTimeHari) || 30);
    return Math.ceil(daily * lead + this.safetyStock(item, settings, monthlyDemand));
  },
  targetStock(item, settings, monthlyDemand) {
    var months = Number((item && item.targetStockMonths) || (settings && settings.targetStockMonths) || 1);
    return Math.ceil(Number(monthlyDemand || 0) * months + this.safetyStock(item, settings, monthlyDemand));
  },
  recommendedOrder(item, settings, monthlyDemand, incoming) {
    var target = this.targetStock(item, settings, monthlyDemand);
    var available = Math.max(0, Number(item.stok || 0) - Number(item.badStock || 0)) + Number(incoming || 0);
    return Math.max(0, Math.ceil(target - available));
  }
};
