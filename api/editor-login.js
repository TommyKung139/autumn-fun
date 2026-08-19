const { createToken } = require('../lib/auth');

// Separate, higher-privilege login for 梯長／福委 who need to edit itinerary data.
// Uses its own password (EDITOR_PASSWORD) so ordinary attendees who only have
// SITE_PASSWORD cannot get write access.
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
  const editorPassword = process.env.EDITOR_PASSWORD;

  if (!editorPassword) {
    res.status(500).json({ error: 'EDITOR_PASSWORD 尚未於 Vercel 環境變數設定' });
    return;
  }

  if (password !== editorPassword) {
    res.status(401).json({ error: '編輯密碼錯誤' });
    return;
  }

  const token = createToken('editor');
  res.setHeader(
    'Set-Cookie',
    `ctbc_token=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax`
  );
  res.status(200).json({ token, role: 'editor' });
};
