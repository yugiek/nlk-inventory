if (typeof window.NLK === 'undefined') { window.NLK = {}; }
var NLK = window.NLK;

NLK.analytics = {
  // Pre-aggregate sales by SKU for performance
  buildSalesMap(sales) {
    var map = {};
    (sales || []).forEach(function(s) {
      if (!map[s.sku]) map[s.sku] = [];
      map[s.sku].push(s);
    });
    return map;
  },
  salesForSku(salesMap, sku, days) {
    var cutoff = NLK.daysAgo(days || 90);
    return (salesMap[sku] || []).filter(function(s){ return s.tanggal >= cutoff; });
  },
  monthlyDemand(salesMap, sku, months) {
    months = months || 3;
    var cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
    var cutoffStr = cutoff.toISOString().slice(0,10);
    var total = (salesMap[sku] || []).filter(function(s){ return s.tanggal >= cutoffStr; })
      .reduce(function(sum,s){ return sum + Number(s.jumlah || 0); },0);
    return total / months;
  },
  avgDaily(salesMap, sku, days) {
    days = days || 30;
    var cutoff = NLK.daysAgo(days);
    var total = (salesMap[sku] || []).filter(function(s){ return s.tanggal >= cutoff; })
      .reduce(function(sum,s){ return sum + Number(s.jumlah || 0); },0);
    return total / days;
  },
  movement(salesMap, sku, monthlyDemandValue) {
    var demand = monthlyDemandValue;
    var all = (salesMap[sku] || []);
    if (!all.length || demand <= 0) return 'dead';
    var lastSale = all.reduce(function(latest, s) {
      return (!latest || s.tanggal > latest) ? s.tanggal : latest;
    }, null);
    if (lastSale && ((new Date() - new Date(lastSale)) / 86400000) >= 90) return 'dead';
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
