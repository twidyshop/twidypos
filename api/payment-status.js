module.exports = async (req, res) => {
  const e = {
    url: (process.env.SUPABASE_URL || 'https://qnlrsgvmwgpwqgfoabcz.supabase.co').replace(/\/$/, ''),
    anon: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    midtrans: process.env.MIDTRANS_SERVER_KEY,
    production: process.env.MIDTRANS_IS_PRODUCTION === 'true'
  };
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  if (!e.anon || !e.service) return res.status(503).json({ error: 'API belum dikonfigurasi.' });
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Login diperlukan.' });

  try {
    const u = await fetch(e.url + '/auth/v1/user', { headers: { apikey: e.anon, authorization: auth } });
    if (!u.ok) return res.status(401).json({ error: 'Sesi login tidak valid.' });
    const user = await u.json();
    const id = String(req.query.order_id || '');
    if (!/^TWP-[0-9]+-[a-f0-9]+$/.test(id)) return res.status(400).json({ error: 'ID pesanan tidak valid.' });

    const headers = { apikey: e.service, authorization: 'Bearer ' + e.service, 'content-type': 'application/json' };
    const path = 'twidypos_payment_orders?order_id=eq.' + encodeURIComponent(id) +
      '&user_id=eq.' + encodeURIComponent(user.id) +
      '&select=order_id,user_id,plan_code,amount,status,created_at,expires_at,paid_at,midtrans_transaction_id';
    const readOrder = async () => {
      const r = await fetch(e.url + '/rest/v1/' + path, { headers });
      if (!r.ok) throw new Error('Status pesanan belum tersedia.');
      const rows = await r.json();
      if (!rows.length) return null;
      return rows[0];
    };

    let order = await readOrder();
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    // Reconcile a pending order against Midtrans itself. This does not create
    // another charge and never trusts the browser's success callback.
    if (order.status === 'pending' && e.midtrans) {
      try {
        const apiBase = e.production ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
        const mr = await fetch(apiBase + '/v2/' + encodeURIComponent(id) + '/status', {
          headers: {
            authorization: 'Basic ' + Buffer.from(e.midtrans + ':').toString('base64'),
            accept: 'application/json'
          }
        });
        if (mr.ok) {
          const m = await mr.json();
          const validAmount = Number(m.gross_amount) === Number(order.amount);
          const validCurrency = !m.currency || m.currency === 'IDR';
          const paid = m.status_code === '200' &&
            (m.transaction_status === 'settlement' ||
              (m.transaction_status === 'capture' && m.fraud_status === 'accept'));
          if (validAmount && validCurrency && paid && m.transaction_id) {
            const paidAt = m.settlement_time || m.transaction_time || null;
            // Existing DB RPC performs the final order/expiry checks and
            // atomically records the payment and lifetime entitlement.
            await fetch(e.url + '/rest/v1/rpc/twidypos_activate_paid_order', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                p_order_id: id,
                p_midtrans_transaction_id: String(m.transaction_id)
              })
            });
            order = await readOrder() || order;
          }
        }
      } catch (reconcileError) {
        // Keep the recorded order status visible; a later retry can reconcile.
        console.error('Midtrans status reconciliation failed:', reconcileError.message);
      }
    }

    const { user_id, ...safeOrder } = order;
    return res.status(200).json(safeOrder);
  } catch (error) {
    console.error('payment-status failed:', error.message);
    return res.status(502).json({ error: 'Status pesanan belum tersedia.' });
  }
};