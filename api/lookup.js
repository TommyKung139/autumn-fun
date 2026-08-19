const { requireAuth } = require('../lib/auth');
const { getEmployee } = require('../lib/firestore');
const { outboundTiming, returnTiming } = require('../lib/schedule');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const idRaw = (req.query && req.query.id) || '';
  const id = String(idRaw).trim().toUpperCase();
  if (!id) {
    res.status(400).json({ error: '請輸入員工編號' });
    return;
  }

  let record = null;
  try {
    record =
      (await getEmployee(id)) ||
      (await getEmployee('Z' + id)) ||
      (await getEmployee(id.replace(/^Z/, '')));
  } catch (err) {
    res.status(500).json({ error: '查詢時發生問題，請稍後再試（' + (err && err.message) + '）' });
    return;
  }

  if (!record) {
    res.status(404).json({ error: '查無此員工編號的第二梯報名資料，請確認輸入是否正確，或該員工是否確實報名參加第二梯次。' });
    return;
  }

  // Attach actual clock times to the HSR legs, looked up from the master day
  // schedule by train number (if known) and boarding/alighting station.
  const out = outboundTiming(record.outbound_station, record.hsr_outbound && record.hsr_outbound.train_no);
  const back = returnTiming(record.return_station, record.hsr_return && record.hsr_return.train_no, record.evening_activity);

  const employee = Object.assign({}, record, {
    outbound_timing: out,
    return_timing: back,
  });

  res.status(200).json({ employee });
};
