# TwidyPOS

Aplikasi kasir (Point of Sale) responsif dengan identitas Twidy. Deploy static ke Vercel atau hosting statis.

## Fitur
- Dashboard penjualan hari ini, transaksi, produk aktif, stok menipis, grafik 7 hari.
- POS dengan pencarian, kategori, pengurutan, keranjang, jumlah, diskon, pajak, validasi stok.
- Checkout tunai/QRIS/transfer; validasi uang diterima dan hitung kembalian tunai.
- Pengelolaan produk: tambah, edit, hapus, SKU unik, harga, kategori, dan stok.
- Riwayat transaksi, filter tanggal, pencarian, struk, cetak ulang, ekspor CSV.
- Laporan omzet, jumlah transaksi, rata-rata transaksi, unit terjual, produk terlaris, metode pembayaran.
- Pengaturan toko/kasir, pajak, ekspor cadangan JSON, pemulihan cadangan.
- Penyimpanan otomatis melalui localStorage browser.

## Deploy ke Vercel
Import repository ke Vercel. Framework preset: Other. Tidak perlu build command; output berupa file statis.

## Catatan penting
Ini versi client-side tanpa backend. Data hanya tersimpan di browser/perangkat yang sama; gunakan cadangan JSON secara berkala. Metode QRIS/transfer hanya mencatat pilihan kasir dan tidak memverifikasi uang masuk otomatis. Untuk multi-kasir, login, database terpusat, audit, dan pembayaran terverifikasi dibutuhkan backend/database dan integrasi penyedia pembayaran.
