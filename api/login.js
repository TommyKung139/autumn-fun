const { createToken } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const password = (body && body.password) || '';
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword) {
    res.status(500).json({ error: 'SITE_PASSWORD 尚未於 Vercel 環境變數設定' });
    return;
  }

  if (password !== sitePassword) {
    res.status(401).json({ error: '通關密碼錯誤' });
    return;
  }

  const token = createToken('viewer');
  res.setHeader(
    'Set-Cookie',
    `ctbc_token=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax`
  );
  res.status(200).json({ token, role: 'viewer' });
};
