// Cross-references an employee's HSR station choice against the master day
// schedule (data/reference.json -> day_schedule) to work out the actual clock
// times for their outbound and return legs.
//
// The two registration columns mean different things, which decides which end of
// the timetable each one refers to:
//   去程高鐵「上車地點」 - where they BOARD. Every outbound train terminates at
//                          台中, so their station gives the DEPARTURE time and
//                          台中 gives the arrival time.
//   回程高鐵「下車地點」 - where they GET OFF. Every return train starts at 台中,
//                          so 台中 gives the DEPARTURE time and their station
//                          gives the ARRIVAL time.
// Treating the return station as a departure point reports the train's arrival
// time as if it were the departure time (e.g. 684 leaves 台中 21:00 and reaches
// 板橋 21:50), so each leg is resolved from the correct end below.
const reference = require('../data/reference.json');

function normStation(s) {
  if (!s) return '';
  return String(s).replace(/高鐵站.*$/, '').replace(/\(.*\)/, '').trim();
}

// Registration answers that mean "I am not on this train at all".
function isLocalTaichung(station) {
  return /台中同仁專用/.test(String(station || ''));
}
function isSelfReturn(station) {
  return /自行回家/.test(String(station || ''));
}

function findStop(stops, station, { skipFirst = false, skipLast = false } = {}) {
  const target = normStation(station);
  if (!target) return null;
  const list = stops || [];
  const searchable = list.slice(skipFirst ? 1 : 0, skipLast ? -1 : undefined);
  return searchable.find(([st]) => normStation(st) === target) || null;
}

// Builds the full picture of one leg on one train, or null if that train does not
// serve the employee's station in the required direction.
function legOnTrain(stops, station, trainNo, direction) {
  if (!stops || stops.length < 2) return null;
  if (direction === 'outbound') {
    // board at their station (never the terminus), alight at 台中 (last stop)
    const board = findStop(stops, station, { skipLast: true });
    if (!board) return null;
    const last = stops[stops.length - 1];
    return {
      train_no: trainNo,
      depart_station: board[0], depart_time: board[1],
      arrive_station: last[0], arrive_time: last[1],
    };
  }
  // return: board at 台中 (first stop), alight at their station (never the origin)
  const alight = findStop(stops, station, { skipFirst: true });
  if (!alight) return null;
  const first = stops[0];
  return {
    train_no: trainNo,
    depart_station: first[0], depart_time: first[1],
    arrive_station: alight[0], arrive_time: alight[1],
  };
}

function legCandidates(trainsMap, station, direction) {
  const out = [];
  Object.keys(trainsMap || {}).forEach((trainNo) => {
    const leg = legOnTrain(trainsMap[trainNo], station, trainNo, direction);
    if (leg) out.push(leg);
  });
  return out;
}

// Outbound leg. Returns a leg object ({train_no, depart_station, depart_time,
// arrive_station, arrive_time}), or {candidates:[...]} when the train number is
// unknown and the boarding station is served by more than one train, or
// {local:true} for 台中 colleagues who gather at the office instead.
function outboundTiming(station, knownTrainNo) {
  const schedule = reference.day_schedule;
  if (!schedule || !station) return null;
  if (isLocalTaichung(station)) {
    const g = schedule.outbound_gather || {};
    return { local: true, time: g.time || null, label: g.label || null, note: g.note || null };
  }
  const trains = schedule.outbound_trains;
  if (knownTrainNo && trains[knownTrainNo]) {
    const leg = legOnTrain(trains[knownTrainNo], station, knownTrainNo, 'outbound');
    if (leg) return leg;
  }
  const candidates = legCandidates(trains, station, 'outbound');
  // If the seating chart named a train that does not actually call at this
  // station, fall back to the train that does, but keep the discrepancy visible.
  const conflict = knownTrainNo ? { assigned_train_no: knownTrainNo } : {};
  if (candidates.length === 1) return Object.assign(candidates[0], conflict);
  if (candidates.length > 1) return Object.assign({ candidates }, conflict);
  return null;
}

// Return leg, scoped to the evening group the employee chose (快樂賦歸 vs 球賽).
function returnTiming(station, knownTrainNo, eveningActivity) {
  const schedule = reference.day_schedule;
  if (!schedule || !station) return null;
  if (isSelfReturn(station)) return { self_return: true };
  if (isLocalTaichung(station)) return { local: true };

  const groups = schedule.evening_groups;
  const group = Object.values(groups).find((g) => g.match_evening === eveningActivity) || null;
  const trains = group ? group.trains : Object.assign({}, ...Object.values(groups).map((g) => g.trains));
  const label = group ? group.label : null;

  if (knownTrainNo && trains[knownTrainNo]) {
    const leg = legOnTrain(trains[knownTrainNo], station, knownTrainNo, 'return');
    if (leg) return Object.assign(leg, { group_label: label });
  }
  const candidates = legCandidates(trains, station, 'return');
  const extra = { group_label: label };
  if (knownTrainNo) extra.assigned_train_no = knownTrainNo;
  if (candidates.length === 1) return Object.assign(candidates[0], extra);
  if (candidates.length > 1) return Object.assign({ candidates }, extra);
  return null;
}

module.exports = { outboundTiming, returnTiming };
