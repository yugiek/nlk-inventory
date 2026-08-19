# NLK Sparepart Inventory Management System

Sistem manajemen inventory berbasis HTML statis untuk brand NLK Sparepart.
Pantau stok sparepart import China, analisis tren penjualan, prediksi reorder.

## Deploy langsung dari GitHub
App sudah di-deploy di: `https://yugiek.github.io/nlk-inventory/`

## Google Sheets Setup (Database)

### 1. Buka spreadsheet
https://docs.google.com/spreadsheets/d/1WtlpMyIs9URrJVf1SgRB5xWwCYIo6cW6xp4eFFF-mjc/

### 2. Setup sheet otomatis (jalan sekali)
1. Buka **Extensions > Apps Script**
2. Hapus kode yang ada, paste seluruh isi `setup/apps-script.gs`
3. Di editor Apps Script, pilih fungsi `setupSheets` dan klik **Run**
4. Beri permission yang diminta
5. Semua sheet (Inventory, Sales, PurchaseOrders, Suppliers) akan dibuat dengan header

### 3. Seed data dummy 1 tahun
1. Di editor Apps Script, pilih fungsi `seedAllData` dan klik **Run**
150 item sparepart + 365 hari riwayat penjualan + 4 PO akan terisi otomatis sebagai bahan simulasi analisa.

### 4. Deploy sebagai Web App
1. Klik **Deploy > New deployment**
2. **Execute as**: Me
3. **Who has access**: Anyone (atau Anyone with Google account)
4. Klik **Deploy** → Copy URL-nya
5. Buka aplikasi, masuk ke **Settings > Google Sheets Apps Script URL**, paste URL itu
6. Klik **Simpan Pengaturan** → **Sync**

Setelah ini, semua data di browser akan otomatis sinkron ke spreadsheet.

## Fitur
- **Dashboard**: Ringkasan stok, nilai inventory, alert stok rendah, PO aktif
- **Inventory**: CRUD sparepart, status stok otomatis (Aman/Critical)
- **Penjualan**: Log penjualan harian, update stok otomatis
- **Purchase Order**: Tracking status (ordered → shipped → in transit → arrived), auto-tambah stok saat arrived
- **Analitik**: Forecasting reorder point & qty berdasarkan tren jual 30 hari
- **Import CSV**: Upload file CSV untuk import massal inventory
- **Backup**: Export/Import JSON

## Teknologi
- Frontend: HTML, Tailwind CSS, Alpine.js
- Backend: Google Apps Script (proxy ke Sheets API)
- Database: Google Sheets
- Hosting: GitHub Pages

## Format CSV (Import)
```
id,nama,kategori,stok,minStok,hargaBeliCNY,hargaJual,lokasiRak,leadTimeHari
NLK-9001,Air Brake Valve,Brake,25,10,45,650000,C3-01,30
```

## Rumus Reorder
```
Reorder Point = (Avg penjualan/hari × Lead Time) + (Avg × Safety Stock Days)
Recommended Qty = [Avg × (Lead Time + Safety)] - Stok - PO_in_transit
```
Default safety stock: 7 hari

## Upgrade — Inventory Intelligence

Versi ini menambahkan engine analitik terpisah di `js/analytics.js`:
- Average Daily Sales menggunakan full 30-day window (tidak hanya hari yang memiliki transaksi)
- Stock Coverage / Days of Stock
- Safety Stock
- Reorder Point
- Incoming PO quantity
- Projected Stock-out date
- Recommended Order Quantity
- Inventory Health Score
- Dead Stock 90 hari
- Gross Profit & Gross Margin estimasi
- MoM / period growth
- Dashboard Action Center untuk Stock-out Risk dan Dead Stock
- Target Stock Coverage configurable dari Settings

### Catatan
Gross Profit pada versi ini adalah estimasi berdasarkan HPP/harga beli CNY yang tersimpan pada master inventory saat ini. Untuk accounting-grade historical margin, langkah berikutnya adalah menyimpan `hargaBeli` sebagai snapshot pada setiap transaksi penjualan.
