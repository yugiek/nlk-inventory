/* NLK Inventory Intelligence Engine
 * Pure calculation layer: no DOM, no Alpine dependency.
 */
if (typeof window.NLK === 'undefined') window.NLK = {};
var NLK = window.NLK;
NLK.analytics = {
  daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); },
  num(v) { var n = Number(v); return isFinite(n) ? n : 0; },
  salesInWindow(sales, days, filters) {
    var cutoff = this.daysAgo(days), f = filters || {};
    return (sales || []).filter(function(s) {
      if (!s.tanggal || s.tanggal < cutoff) return false;
      if (f.brand && f.brand !== 'ALL' && s.brand !== f.brand) return false;
      if (f.warehouse && f.warehouse !== 'ALL' && s.warehouse !== f.warehouse) return false;
      if (f.sku && s.sku !== f.sku) return false;
      return true;
    });
  },
  totalQty(sales) { return (sales || []).reduce((a,s)=>a+this.num(s.jumlah),0); },
  revenue(sales) { return (sales || []).reduce((a,s)=>a+this.num(s.jumlah)*this.num(s.hargaJual),0); },
  avgDailySales(sales, sku, days, filters) {
    days = days || 30;
    var f = Object.assign({}, filters || {}, {sku: sku});
    // Divide by the full window, not only days with sales. This avoids overstating demand.
    return this.totalQty(this.salesInWindow(sales, days, f)) / days;
  },
  incomingQty(pos, sku) {
    return (pos || []).filter(p=>p.status !== 'arrived' && p.status !== 'cancelled')
      .reduce((sum,p)=>(p.items||[]).reduce((s,i)=>s+(i.sku===sku?this.num(i.qty):0),sum),0);
  },
  safetyStock(avg, safetyDays) { return Math.ceil(this.num(avg) * Math.max(0,this.num(safetyDays || 7))); },
  reorderPoint(avg, leadTime, safetyDays) {
    return Math.ceil(this.num(avg) * Math.max(0,this.num(leadTime || 30)) + this.safetyStock(avg,safetyDays));
  },
  coverageDays(stock, avg) { return avg > 0 ? stock / avg : Infinity; },
  projectedStockoutDate(stock, avg) {
    if (!(avg > 0) || stock <= 0) return stock <= 0 ? new Date().toISOString().slice(0,10) : null;
    var d = new Date(); d.setDate(d.getDate() + Math.ceil(stock / avg));
    return d.toISOString().slice(0,10);
  },
  recommendedOrder(stock, avg, leadTime, safetyDays, incoming, maxDays) {
    if (!(avg > 0)) return 0;
    var targetDays = Math.max(this.num(leadTime || 30)+this.num(safetyDays || 7), this.num(maxDays || 0));
    var target = Math.ceil(avg * targetDays);
    return Math.max(0, target - this.num(stock) - this.num(incoming));
  },
  status(stock, avg, minStock, leadTime, safetyDays) {
    if (stock <= 0) return 'critical';
    var rp = this.reorderPoint(avg,leadTime,safetyDays);
    var coverage = this.coverageDays(stock,avg);
    if (stock <= this.num(minStock) || (avg > 0 && stock <= rp)) return 'critical';
    if (avg > 0 && coverage <= this.num(leadTime || 30)+this.num(safetyDays || 7)) return 'warn';
    return 'ok';
  },
  grossProfit(sales, inventory, kurs) {
    var map = {};
    (inventory||[]).forEach(i=>map[i.id]=this.num(i.hargaBeliCNY)*this.num(kurs||16500));
    return (sales||[]).reduce((a,s)=>a+this.num(s.jumlah)*(this.num(s.hargaJual)-this.num(map[s.sku])),0);
  },
  inventoryValue(inventory,kurs) {
    return (inventory||[]).reduce((a,i)=>a+this.num(i.stok)*this.num(i.hargaBeliCNY)*this.num(kurs||16500),0);
  },
  deadStock(inventory,sales,days,filters) {
    var self=this;
    return (inventory||[]).filter(i=>{
      var avg=self.avgDailySales(sales,i.id,days||90,filters);
      return avg===0 && (!filters || filters.brand==='ALL' || !filters.brand || i.brand===filters.brand) &&
        (!filters || filters.warehouse==='ALL' || !filters.warehouse || i.warehouse===filters.warehouse) && self.num(i.stok)>0;
    });
  },
  turnover(sales, inventory, days, kurs) {
    var cogs = 0;
    var map={}; (inventory||[]).forEach(i=>map[i.id]=this.num(i.hargaBeliCNY)*this.num(kurs||16500));
    (sales||[]).filter(s=>s.tanggal>=this.daysAgo(days||365)).forEach(s=>cogs+=this.num(s.jumlah)*this.num(map[s.sku]));
    var inv=this.inventoryValue(inventory,kurs);
    return inv>0 ? cogs/inv : 0;
  },
  abc(inventory,sales,days,filters) {
    var rows=(inventory||[]).map(i=>{
      var ss=this.salesInWindow(sales,days||365,Object.assign({},filters||{},{sku:i.id}));
      return {item:i, revenue:this.revenue(ss)};
    }).sort((a,b)=>b.revenue-a.revenue);
    var total=rows.reduce((a,r)=>a+r.revenue,0), cum=0;
    return rows.map(r=>{cum+=r.revenue; var pct=total?cum/total:0; return Object.assign(r.item,{abc:pct<=.70?'A':pct<=.90?'B':'C',abcRevenue:r.revenue,abcCumulative:pct});});
  },
  health(inventory,sales,pos,settings,filters) {
    var list=(inventory||[]).filter(i=>(!filters||!filters.brand||filters.brand==='ALL'||i.brand===filters.brand)&&(!filters||!filters.warehouse||filters.warehouse==='ALL'||i.warehouse===filters.warehouse));
    if(!list.length) return {score:100,availability:100,coverage:100,deadStock:100,reorder:100};
    var avg=function(i){return this.avgDailySales(sales,i.id,30,filters)}.bind(this);
    var critical=list.filter(i=>this.status(i.stok,avg(i),i.minStok,i.leadTimeHari,settings.safetyStockDays)==='critical').length;
    var warn=list.filter(i=>this.status(i.stok,avg(i),i.minStok,i.leadTimeHari,settings.safetyStockDays)==='warn').length;
    var dead=this.deadStock(list,sales,90,filters).length;
    var availability=Math.max(0,100-(critical/list.length*100));
    var coverage=Math.max(0,100-(warn/list.length*35)-(critical/list.length*65));
    var deadScore=Math.max(0,100-(dead/list.length*100));
    var reorder=Math.max(0,100-(critical/list.length*80)-(warn/list.length*20));
    return {score:Math.round(availability*.35+coverage*.25+deadScore*.15+reorder*.25),availability:Math.round(availability),coverage:Math.round(coverage),deadStock:Math.round(deadScore),reorder:Math.round(reorder)};
  },
  growth(current, previous) { return previous ? ((current-previous)/previous)*100 : null; },
  periodSummary(sales,days,filters) {
    var cur=this.salesInWindow(sales,days,filters), prev=this.salesInWindow(sales,days+days,filters).filter(s=>s.tanggal<this.daysAgo(days));
    var revenue=this.revenue(cur), qty=this.totalQty(cur), prevRevenue=this.revenue(prev), prevQty=this.totalQty(prev);
    return {qty:qty,revenue:revenue,prevQty:prevQty,prevRevenue:prevRevenue,revenueGrowth:this.growth(revenue,prevRevenue),qtyGrowth:this.growth(qty,prevQty)};
  }
};
