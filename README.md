# NLK Sparepart Inventory Management System

Sistem manajemen inventory berbasis HTML statis untuk brand NLK Sparepart.
Fitur utama: pemantauan stok sparepart import China, analisis tren penjualan, prediksi reorder berdasarkan lead time pengiriman.

## Fitur
- **Dashboard**: Ringkasan stok, nilai inventory, alert stok rendah
- **Inventory**: CRUD sparepart, status stok (aman/warning/critical)
- **Penjualan**: Log penjualan harian, update stok otomatis
- **Purchase Order**: Tracking status pesanan (ordered/shipped/in transit/arrived)
- **Analytics**: Forecasting berdasarkan tren penjualan
- **Settings**: Konfigurasi mata uang, backup data

## Setup

### 1. Google Sheets (Database)
1. Buat Google Spreadsheet baru
2. Buat sheet dengan nama: `Inventory`, `Sales`, `PurchaseOrders`, `Suppliers`
3. Buat header kolom yang sesuai dengan data model

### 2. Google Apps Script
1. Di Google Sheets, buka Extensions > Apps Script
2. Paste isi dari `setup/apps-script.gs`
3. Deploy sebagai Web App (Execute as: Me, Who has access: Anyone)
4. Copy URL deployment

### 3. Deploy ke GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/[username]/nlk-inventory.git
git push -u origin main
```
4. Buka repo Settings > Pages > Source: main branch
5. Akses: `https://[username].github.io/nlk-inventory/`

## Teknologi
- **Frontend**: HTML, Tailwind CSS, Alpine.js
- **Backend**: Google Apps Script (proxy ke Sheets API)
- **Database**: Google Sheets
- **Hosting**: GitHub Pages

## Format Mata Uang
Default: Rp 16.500 / CNY 1 (bisa diubah di Settings)