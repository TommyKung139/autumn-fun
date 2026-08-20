// Builds the three planning charts (高鐵車廂座位表 / 遊覽車分車表 / 島語分桌表)
// from the live employee records.
//
// These used to be a static snapshot exported from the Excel workbook. They are
// now derived from whatever is currently stored, so a seat moved through
// /edit.html (or straight in the Firestore console) shows up on the charts
// immediately, with no re-export step.
//
// What that means for two kinds of entry the Excel sheets also carried:
//  - 眷屬: dependents have no seat/coach/table fields of their own, only a name on
//    their employee's record. They ride the same coach and sit at the same lunch
//    table as the employee, so they are placed alongside them on those two charts.
//    They are NOT placed on the HSR seat map, because their individual seat number
//    is not stored anywhere - it is on the physical ticket.
//  - 保留席: seats bought but never assigned to a named person simply do not exist
//    as records, so they no longer appear as grey "（保留）" cells.

const CHINESE_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function coachOrder(label) {
  const m = String(label || '').match(/第(.+?)車/);
  if (!m) return 999;
  const idx = CHINESE_NUM.indexOf(m[1]);
  if (idx !== -1) return idx;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 999;
}

// 'A12A & A13' -> {zone:'A', num:12}; 'C8、C9' -> {zone:'C', num:8}
function tableKey(code) {
  const m = String(code || '').match(/([ABC])\s*(\d+)/);
  return m ? { zone: m[1], num: parseInt(m[2], 10) } : { zone: 'Z', num: 9999 };
}

function deptTag(division) {
  const d = String(division || '');
  if (d.indexOf('經營策略') !== -1) return '經策';
  if (d.indexOf('數位平台') !== -1) return '數平';
  if (d.indexOf('個金作業') !== -1) return '作資';
  return d || null;
}

function dependentsOf(emp) {
  return (emp.dependents || [])
    .filter((d) => d && d.name)
    .map((d) => ({ name: d.name + '(眷)', dept: deptTag(emp.division), dependent: true }));
}

// ---------------- HSR carriage maps ----------------
function buildHsr(employees, legField) {
  const blocks = new Map();
  for (const emp of employees) {
    const leg = emp[legField];
    if (!leg || !leg.train_no || !leg.seat_letter || leg.row_idx == null) continue;
    const car = leg.car || '未指定車廂';
    const key = leg.train_no + '|' + car;
    if (!blocks.has(key)) {
      blocks.set(key, { train_no: String(leg.train_no), car: String(car), seats: [], stations: new Set() });
    }
    const block = blocks.get(key);
    if (leg.station) block.stations.add(String(leg.station));
    block.seats.push({
      name: emp.name,
      emp_id: emp.emp_id,
      dept: deptTag(emp.division),
      station: leg.station || null,
      note: leg.note || null,
      row: Number(leg.row_idx),
      letter: String(leg.seat_letter).toUpperCase(),
    });
  }

  return [...blocks.values()]
    .map((b) => {
      b.seats.sort((x, y) => x.row - y.row || x.letter.localeCompare(y.letter));
      // Flag double-booked seats instead of silently drawing one on top of the other.
      const seen = new Map();
      for (const s of b.seats) {
        const k = s.row + s.letter;
        if (seen.has(k)) { s.conflict = true; seen.get(k).conflict = true; }
        else seen.set(k, s);
      }
      return {
        train_no: b.train_no,
        car: b.car,
        stations: [...b.stations],
        seats: b.seats,
        conflicts: b.seats.filter((s) => s.conflict).length,
      };
    })
    .sort((a, b) => a.train_no.localeCompare(b.train_no, undefined, { numeric: true })
      || a.car.localeCompare(b.car, undefined, { numeric: true }));
}

// ---------------- coach manifests ----------------
function buildBus(employees, field) {
  const cars = new Map();
  for (const emp of employees) {
    const label = emp[field];
    if (!label) continue;
    if (!cars.has(label)) cars.set(label, { label: String(label), members: [], depts: new Set() });
    const car = cars.get(label);
    const tag = deptTag(emp.division);
    if (tag) car.depts.add(tag);
    car.members.push({ name: emp.name, emp_id: emp.emp_id, dept: tag });
    car.members.push(...dependentsOf(emp));
  }
  return [...cars.values()]
    .map((c) => ({ label: c.label, depts: [...c.depts], members: c.members }))
    .sort((a, b) => coachOrder(a.label) - coachOrder(b.label));
}

// ---------------- lunch tables ----------------
function buildTables(employees) {
  const tables = new Map();
  for (const emp of employees) {
    const code = emp.table;
    if (!code) continue;
    if (!tables.has(code)) tables.set(code, { code: String(code), members: [], depts: new Set() });
    const t = tables.get(code);
    const tag = deptTag(emp.division);
    if (tag) t.depts.add(tag);
    t.members.push({ name: emp.name, emp_id: emp.emp_id, dept: tag });
    t.members.push(...dependentsOf(emp));
  }
  return [...tables.values()]
    .map((t) => ({ code: t.code, zone: tableKey(t.code).zone, depts: [...t.depts], members: t.members }))
    .sort((a, b) => {
      const ka = tableKey(a.code), kb = tableKey(b.code);
      return ka.zone.localeCompare(kb.zone) || ka.num - kb.num || a.code.localeCompare(b.code);
    });
}

function buildCharts(employees) {
  const list = (employees || []).filter(Boolean);
  const unassigned = {
    morning_bus: list.filter((e) => !e.morning_bus).map((e) => e.name),
    activity_bus: list.filter((e) => !e.activity_bus).map((e) => e.name),
    table: list.filter((e) => !e.table).map((e) => e.name),
    hsr_outbound: list.filter((e) => !(e.hsr_outbound && e.hsr_outbound.train_no)).length,
    hsr_return: list.filter((e) => !(e.hsr_return && e.hsr_return.train_no)).length,
  };
  return {
    total_employees: list.length,
    hsr: {
      outbound: buildHsr(list, 'hsr_outbound'),
      return: buildHsr(list, 'hsr_return'),
    },
    buses: [
      { title: '分車表一｜全員上午去程', field: 'morning_bus', cars: buildBus(list, 'morning_bus') },
      { title: '分車表二｜全員下午行程', field: 'activity_bus', cars: buildBus(list, 'activity_bus') },
    ],
    tables: buildTables(list),
    unassigned,
  };
}

module.exports = { buildCharts };
