const { createHash, randomBytes } = require('node:crypto');

const PLANS = {
  premium: { amount: 15000, name: 'TWIDYPOS Premium' },
  unlimited: { amount: 25000, name: 'TWIDYPOS Full Unlimited' }
};
const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const env = () => ({
  url: (process.env.SUPABASE_URL || 'https://qnlrsgvmwgpwqgfoabcz.supabase.co').replace(/\/$/, ''),
  anon: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  midtrans: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
  production: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  base: (process.env.APP_BASE_URL || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://twidypos.vercel.app')).replace(/\/$/, '')
});
async function rest(e, path, options = {}) {
  const response = await fetch(e.url + '/rest/v1/' + path, {
    ...options,
    headers: { apikey: e.service, authorization: 'Bearer ' + e.service, 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Supabase request failed (' + response.status + '): ' + body.slice(0, 300));
  return body ? JSON.parse(body) : null;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const e = env();
  if (!e.anon || !e.service || !e.midtrans || !e.clientKey) return res.status(503).json({ error: 'Pembayaran belum dikonfigurasi. Pemilik perlu mengisi SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, dan MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY di environment Vercel.' });
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Silakan masuk ke akun TWIDYPOS terlebih dahulu.' });
  let userResponse;
  try {
    userResponse = await fetch(e.url + '/auth/v1/user', { headers: { apikey: e.anon, authorization: auth } });
  } catch { return res.status(502).json({ error: 'Tidak dapat memverifikasi sesi akun.' }); }
  if (!userResponse.ok) return res.status(401).json({ error: 'Sesi login tidak valid atau sudah kedaluwarsa.' });
  const user = await userResponse.json();
  const plan = PLANS[req.body && req.body.plan_code];
  if (!plan || !user.id || !user.email) return res.status(400).json({ error: 'Paket atau akun tidak valid.' });
  const orderId = 'TWP-' + Date.now() + '-' + randomBytes(6).toString('hex');
  const apiBase = e.production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
  const notificationUrl = e.base + '/api/midtrans-webhook';
  try {
    await rest(e, 'twidypos_payment_orders', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify([{ order_id: orderId, user_id: user.id, plan_code: req.body.plan_code, amount: plan.amount, status: 'pending' }])
    });
    const response = await fetch(apiBase + '/snap/v1/transactions', {
      method: 'POST',
      headers: { authorization: 'Basic ' + Buffer.from(e.midtrans + ':').toString('base64'), 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: plan.amount },
        item_details: [{ id: req.body.plan_code, price: plan.amount, quantity: 1, name: plan.name }],
        customer_details: { email: user.email },
        callbacks: { finish: e.base + '/paket?order_id=' + encodeURIComponent(orderId) },
        notification_url: notificationUrl,
        expiry: { unit: 'minutes', duration: 30 }
      })
    });
    const mid = await response.json();
    if (!response.ok || !mid.token) {
      await rest(e, 'twidypos_payment_orders?order_id=eq.' + encodeURIComponent(orderId), { method: 'PATCH', body: JSON.stringify({ status: 'failed' }) });
      return res.status(502).json({ error: 'Midtrans gagal membuat pembayaran. Tidak ada paket yang diaktifkan.' });
    }
    await rest(e, 'twidypos_payment_orders?order_id=eq.' + encodeURIComponent(orderId) + '&user_id=eq.' + encodeURIComponent(user.id), { method: 'PATCH', body: JSON.stringify({ snap_token: mid.token }) });
    return res.status(200).json({ order_id: orderId, token: mid.token, redirect_url: mid.redirect_url, snap_script: e.production ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js', production: e.production, client_key: e.clientKey });
  } catch (error) {
    console.error('create-payment failed:', error.message);
    return res.status(502).json({ error: 'Pembayaran belum berhasil dibuat. Coba lagi beberapa saat.' });
  }
};