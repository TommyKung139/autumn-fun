const { requireAuth } = require('../lib/auth');
const { resolveEmployee, findEmployeesByName } = require('../lib/firestore');
const { outboundTiming, returnTiming } = require('../lib/schedule');

// Attaches the actual clock times for each HSR leg to a stored record.
function decorate(record) {
  return Object.assign({}, record, {
    outbound_timing: outboundTiming(
      record.outbound_station,
      record.hsr_outbound && record.hsr_outbound.train_no
    ),
    return_timing: returnTiming(
      record.return_station,
      record.hsr_return && record.hsr_return.train_no,
      record.evening_activity
    ),
  });
}

// An employee number is letters+digits (Z00012345, or occasionally just digits).
// Anything containing a non-ASCII character - i.e. a Chinese name - is a name.
function looksLikeEmployeeId(s) {
  return /^[A-Za-z]{0,2}\d{3,}$/.test(String(s).trim());
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const raw = String((req.query && (req.query.id || req.query.q)) || '').trim();
  if (!raw) {
    res.status(400).json({ error: '請輸入員工編號或姓名' });
    return;
  }

  try {
    if (looksLikeEmployeeId(raw)) {
      const hit = await resolveEmployee(raw);
      if (!hit) {
        res.status(404).json({
          error: '查無員工編號「' + raw + '」的第二梯報名資料。請確認輸入是否正確、' +
            '該同仁是否確實報名第二梯，或改用姓名查詢。',
        });
        return;
      }
      res.status(200).json({ employee: decorate(hit.record) });
      return;
    }

    // Name search. Several colleagues share a name (there are two 陳怡君), so a
    // list is returned when the search is ambiguous and the caller picks one.
    const matches = await findEmployeesByName(raw);
    if (!matches.length) {
      res.status(404).json({
        error: '查無姓名「' + raw + '」的第二梯報名資料。請確認用字是否正確' +
          '（例如有些同仁登記為「林芝萱(Chih)」），或改用員工編號查詢。',
      });
      return;
    }
    if (matches.length === 1) {
      res.status(200).json({ employee: decorate(matches[0]) });
      return;
    }
    res.status(200).json({
      matches: matches
        .map((e) => ({
          emp_id: e.emp_id, name: e.name,
          division: e.division || null, department: e.department || null,
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    });
  } catch (err) {
    res.status(500).json({ error: '查詢時發生問題，請稍後再試（' + (err && err.message) + '）' });
  }
};
