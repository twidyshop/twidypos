# Konfigurasi paket dan Midtrans TWIDYPOS

## Paket
- Free: maksimal 50 transaksi per hari dan 50 produk.
- Premium: Rp15.000 sekali bayar untuk akses lifetime, maksimal 500 transaksi per hari dan 200 produk.
- Full Unlimited: Rp25.000 sekali bayar untuk akses lifetime, tanpa batas produk/transaksi.
- Tidak ada masa kedaluwarsa paket berbayar dan tidak ada perpanjangan otomatis. Pembelian satu kali memberi akses lifetime.
- Akun yang dibuat sebelum waktu rollout yang dicatat di `private.twidypos_plan_rollout` tetap unlimited.

## Environment Variables di Vercel
Buka **Vercel → Project TWIDYPOS → Settings → Environment Variables**. Tambahkan semua variabel berikut untuk Production (dan Preview jika ingin menguji di preview):

| Variable | Isi |
|---|---|
| `SUPABASE_URL` | `https://qnlrsgvmwgpwqgfoabcz.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | **Service role/secret key Supabase. Rahasia, jangan pernah pakai prefix `NEXT_PUBLIC_` dan jangan commit ke GitHub.** |
| `MIDTRANS_SERVER_KEY` | Server Key Midtrans. Rahasia, hanya di environment server Vercel. |
| `MIDTRANS_CLIENT_KEY` | Client Key Midtrans untuk Snap di browser (bukan Server Key). |
| `MIDTRANS_IS_PRODUCTION` | `false` saat Sandbox; ubah ke `true` hanya setelah siap live. |
| `APP_BASE_URL` | URL publik aplikasi, misalnya `https://twidypos.vercel.app`. |

Setelah menyimpan environment variables, **redeploy** project Vercel agar fungsi API membaca nilai terbaru.

## Pengaturan Midtrans
1. Uji terlebih dahulu dengan Server Key dan Client Key Sandbox.
2. Atur notifikasi pembayaran Midtrans ke `https://twidypos.vercel.app/api/midtrans-webhook` (atau domain publik yang disetel di `APP_BASE_URL`).
3. Pastikan notifikasi mengirim `order_id`, `status_code`, `gross_amount`, `signature_key`, `transaction_status`, dan `transaction_id` standar Midtrans.
4. Tes pembayaran berhasil, pending, gagal, dibatalkan, kedaluwarsa, nominal salah, dan notifikasi berulang sebelum beralih ke Production.
5. Saat beralih ke Production, pasang Server Key dan Client Key Production, ubah `MIDTRANS_IS_PRODUCTION=true`, lalu redeploy.

## Perlindungan pembayaran
- Harga paket hanya ditentukan server: Premium Rp15.000 dan Unlimited Rp25.000.
- Browser tidak dapat mengubah status paket melalui tabel karena akses tulis tabel langganan/pesanan dicabut dari `anon` dan `authenticated`.
- Server memverifikasi sesi pengguna saat membuat pesanan.
- Webhook memvalidasi signature SHA-512 Midtrans, ID pesanan yang dibuat server, nominal, status kode, dan mata uang.
- Callback sukses di browser tidak mengaktifkan paket. Aktivasi hanya melalui webhook server yang valid.
- Pesanan pembayaran berlaku 30 menit. Setelah pembayaran terverifikasi, Premium atau Full Unlimited aktif secara lifetime (`current_period_end = null`).
- Simpan Server Key dan Supabase Service Role Key sebagai secret. Jika keduanya pernah masuk GitHub atau chat publik, rotasi segera.

## Catatan verifikasi
Kode dan migrasi sudah ditambahkan ke repo/database. Pembayaran **belum bisa aktif** sampai semua environment variables di atas diisi dan endpoint notifikasi dikonfigurasi. Sebelum menerima uang sungguhan, lakukan transaksi Sandbox end-to-end dan verifikasi dashboard Midtrans.