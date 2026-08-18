const { requireAuth } = require('../lib/auth');
const reference = require('../data/reference.json');

module.exports = (req, res) => {
  if (!requireAuth(req, res)) return;
  res.status(200).json(reference);
};
