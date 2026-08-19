// Helpers that cross-reference an employee's HSR boarding/alighting station (and,
// for the return leg, their evening-activity choice) against the master day
// schedule (data/reference.json -> day_schedule) to attach actual clock times to
// the ticket info shown on the itinerary page.
const reference = require('../data/reference.json');

function normStation(s) {
  if (!s) return '';
  return String(s).replace(/高鐵站.*$/, '').replace(/\(.*\)/, '').trim();
}

// Two registration-form answers mean "I am not riding this train at all", and
// must never be looked up as a boarding station:
//  - 台中高鐵站(台中同仁專用): a 台中-based colleague, who gathers at the office
//    instead (see day_schedule.outbound_gather). 台中 is also the OUTBOUND
//    TERMINUS, so matching on it would report the train's arrival time as if it
//    were their departure time.
//  - 自行回家: making their own way home after the event.
function isLocalTaichung(station) {
  return /台中同仁專用/.test(String(station || ''));
}
function isSelfReturn(station) {
  return /自行回家/.test(String(station || ''));
}

function timeInTrain(stops, station, { excludeTerminus = false } = {}) {
  const target = normStation(station);
  if (!target) return null;
  const list = stops || [];
  const searchable = excludeTerminus ? list.slice(0, -1) : list;
  const hit = searchable.find(([st]) => normStation(st) === target);
  return hit ? hit[1] : null;
}

function candidatesInTrains(trainsMap, station, opts) {
  const out = [];
  Object.keys(trainsMap || {}).forEach((trainNo) => {
    const t = timeInTrain(trainsMap[trainNo], station, opts);
    if (t) out.push({ train_no: trainNo, time: t });
  });
  return out;
}

// Returns { time, train_no, candidates } for the outbound leg, or a
// { local: true } marker for 台中 colleagues who do not take the outbound train.
// If the employee has a known train_no (from the seating chart), returns its exact
// time. Otherwise, if the boarding station is only served by one outbound train,
// returns that unambiguous time; if served by more than one, returns all as candidates.
function outboundTiming(station, knownTrainNo) {
  const schedule = reference.day_schedule;
  if (!schedule || !station) return null;
  if (isLocalTaichung(station)) {
    const g = schedule.outbound_gather || {};
    return { local: true, time: g.time || null, label: g.label || null, note: g.note || null };
  }
  const trains = schedule.outbound_trains;
  // Every outbound train ends at 台中, so the last stop is an arrival, not a
  // boarding opportunity - exclude it from all outbound matching.
  const opts = { excludeTerminus: true };
  if (knownTrainNo && trains[knownTrainNo]) {
    const t = timeInTrain(trains[knownTrainNo], station, opts);
    if (t) return { time: t, train_no: knownTrainNo, candidates: null };
  }
  const candidates = candidatesInTrains(trains, station, opts);
  if (candidates.length === 1) return { time: candidates[0].time, train_no: candidates[0].train_no, candidates: null };
  if (candidates.length > 1) return { time: null, train_no: null, candidates };
  return null;
}

// Same idea for the return leg, scoped to the correct evening group (快樂賦歸 vs
// 球賽) based on the employee's evening_activity choice. 台中 colleagues and
// anyone making their own way home get a marker instead of a train time.
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
    const t = timeInTrain(trains[knownTrainNo], station);
    if (t) return { time: t, train_no: knownTrainNo, candidates: null, group_label: label };
  }
  const candidates = candidatesInTrains(trains, station);
  if (candidates.length === 1) {
    return { time: candidates[0].time, train_no: candidates[0].train_no, candidates: null, group_label: label };
  }
  if (candidates.length > 1) return { time: null, train_no: null, candidates, group_label: label };
  return null;
}

module.exports = { outboundTiming, returnTiming };
