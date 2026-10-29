const crypto = require('node:crypto');
const e = {
  url: (process.env.SUPABASE_URL || 'https://qnlrsgvmwgpwqgfoabcz.supabase.co').replace(/\/$/, ''),
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  midtrans: process.env.MIDTRANS_SERVER_KEY
};
const send = (res, status, body) => res.status(status).json(body);
async function rest(path, options = {}) {
  const response = await fetch(e.url + '/rest/v1/' + path, {
    ...options,
    headers: { apikey: e.service, authorization: 'Bearer ' + e.service, 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error('Supabase ' + response.status + ': ' + text.slice(0, 250));
  return text ? JSON.parse(text) : null;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method tidak diizinkan.' });
  if (!e.service || !e.midtrans) return send(res, 503, { error: 'Webhook belum dikonfigurasi.' });
  const n = req.body || {};
  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status, transaction_id, currency } = n;
  if (![order_id, status_code, gross_amount, signature_key, transaction_status].every(v => typeof v === 'string')) return send(res, 400, { error: 'Notifikasi tidak lengkap.' });
  const expected = crypto.createHash('sha512').update(order_id + status_code + gross_amount + e.midtrans).digest('hex');
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(signature_key, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, { error: 'Signature Midtrans tidak valid.' });
  try {
    const rows = await rest('twidypos_payment_orders?order_id=eq.' + encodeURIComponent(order_id) + '&select=order_id,user_id,plan_code,amount,status,expires_at');
    const order = rows && rows[0];
    if (!order) return send(res, 404, { error: 'Pesanan tidak dikenal.' });
    if (currency && currency !== 'IDR') return send(res, 400, { error: 'Mata uang pesanan tidak cocok.' });
    if (Number(gross_amount) !== Number(order.amount) || Number(status_code) !== 200) return send(res, 400, { error: 'Nominal atau status kode tidak cocok.' });
    if (transaction_status === 'settlement' || (transaction_status === 'capture' && fraud_status === 'accept')) {
      const result = await rest('rpc/twidypos_activate_paid_order', { method: 'POST', body: JSON.stringify({ p_order_id: order_id, p_midtrans_transaction_id: String(transaction_id || '') }) });
      if (result !== true) return send(res, 409, { error: 'Pesanan tidak dapat diaktifkan; periksa status atau masa berlaku.' });
      return send(res, 200, { ok: true });
    }
    if (['deny', 'cancel', 'expire', 'failure'].includes(transaction_status) && order.status === 'pending') {
      const next = transaction_status === 'expire' ? 'expired' : transaction_status === 'cancel' ? 'cancelled' : 'failed';
      await rest('twidypos_payment_orders?order_id=eq.' + encodeURIComponent(order_id) + '&status=eq.pending', { method: 'PATCH', body: JSON.stringify({ status: next }) });
    }
    return send(res, 200, { ok: true, ignored: true });
  } catch (error) {
    console.error('Midtrans webhook error:', error.message);
    return send(res, 500, { error: 'Webhook belum dapat diproses.' });
  }
};