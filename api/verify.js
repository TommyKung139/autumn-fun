const { requireAuth } = require('../lib/auth');

module.exports = (req, res) => {
  if (!requireAuth(req, res)) return;
  res.status(200).json({ ok: true });
};
