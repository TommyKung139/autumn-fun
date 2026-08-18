const { requireAuth } = require('../lib/auth');
const employees = require('../data/employees.json');

const byId = new Map();
for (const e of employees) {
  byId.set(String(e.emp_id).trim().toUpperCase(), e);
}

module.exports = (req, res) => {
  if (!requireAuth(req, res)) return;

  const idRaw = (req.query && req.query.id) || '';
  const id = String(idRaw).trim().toUpperCase();
  if (!id) {
    res.status(400).json({ error: '請輸入員工編號' });
    return;
  }
  const record = byId.get(id) || byId.get('Z' + id) || byId.get(id.replace(/^Z/, ''));
  if (!record) {
    res.status(404).json({ error: '查無此員工編號的第二梯報名資料，請確認輸入是否正確，或該員工是否確實報名參加第二梯次。' });
    return;
  }
  res.status(200).json({ employee: record });
};
