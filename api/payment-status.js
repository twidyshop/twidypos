module.exports = async (req, res) => {
  const e = { url: (process.env.SUPABASE_URL || 'https://qnlrsgvmwgpwqgfoabcz.supabase.co').replace(/\/$/, ''), anon: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  if (!e.anon || !e.service) return res.status(503).json({ error: 'API belum dikonfigurasi.' });
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Login diperlukan.' });
  const u = await fetch(e.url + '/auth/v1/user', { headers: { apikey: e.anon, authorization: auth } });
  if (!u.ok) return res.status(401).json({ error: 'Sesi login tidak valid.' });
  const user = await u.json();
  const id = String(req.query.order_id || '');
  if (!/^TWP-[0-9]+-[a-f0-9]+$/.test(id)) return res.status(400).json({ error: 'ID pesanan tidak valid.' });
  const r = await fetch(e.url + '/rest/v1/twidypos_payment_orders?order_id=eq.' + encodeURIComponent(id) + '&user_id=eq.' + encodeURIComponent(user.id) + '&select=order_id,plan_code,amount,status,created_at,expires_at,paid_at', { headers: { apikey: e.service, authorization: 'Bearer ' + e.service } });
  if (!r.ok) return res.status(502).json({ error: 'Status pesanan belum tersedia.' });
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  return res.status(200).json(rows[0]);
};