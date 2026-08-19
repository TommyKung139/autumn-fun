// Helpers that cross-reference an employee's HSR boarding/alighting station (and,
// for the return leg, their evening-activity choice) against the master day
// schedule (data/reference.json -> day_schedule) to attach actual clock times to
// the ticket info shown on the itinerary page.
const reference = require('../data/reference.json');

function normStation(s) {
  if (!s) return '';
  return String(s).replace(/高鐵站.*$/, '').replace(/\(.*\)/, '').trim();
}

function timeInTrain(stops, station) {
  const target = normStation(station);
  const hit = (stops || []).find(([st]) => normStation(st) === target);
  return hit ? hit[1] : null;
}

function candidatesInTrains(trainsMap, station) {
  const out = [];
  Object.keys(trainsMap || {}).forEach((trainNo) => {
    const t = timeInTrain(trainsMap[trainNo], station);
    if (t) out.push({ train_no: trainNo, time: t });
  });
  return out;
}

// Returns { time, train_no, candidates } for the outbound leg.
// If the employee has a known train_no (from the seating chart), returns its exact
// time. Otherwise, if the boarding station is only served by one outbound train,
// returns that unambiguous time; if served by more than one, returns all as candidates.
function outboundTiming(station, knownTrainNo) {
  const schedule = reference.day_schedule;
  if (!schedule || !station) return null;
  const trains = schedule.outbound_trains;
  if (knownTrainNo && trains[knownTrainNo]) {
    const t = timeInTrain(trains[knownTrainNo], station);
    if (t) return { time: t, train_no: knownTrainNo, candidates: null };
  }
  const candidates = candidatesInTrains(trains, station);
  if (candidates.length === 1) return { time: candidates[0].time, train_no: candidates[0].train_no, candidates: null };
  if (candidates.length > 1) return { time: null, train_no: null, candidates };
  return null;
}

// Same idea for the return leg, scoped to the correct evening group (快樂賦歸 vs
// 球賽) based on the employee's evening_activity choice.
function returnTiming(station, knownTrainNo, eveningActivity) {
  const schedule = reference.day_schedule;
  if (!schedule || !station) return null;
  const groups = schedule.evening_groups;
  const group = Object.values(groups).find((g) => g.match_evening === eveningActivity) || null;
  const trains = group ? group.trains : Object.assign({}, ...Object.values(groups).map((g) => g.trains));

  if (knownTrainNo && trains[knownTrainNo]) {
    const t = timeInTrain(trains[knownTrainNo], station);
    if (t) return { time: t, train_no: knownTrainNo, candidates: null, group_label: group ? group.label : null };
  }
  const candidates = candidatesInTrains(trains, station);
  if (candidates.length === 1) {
    return { time: candidates[0].time, train_no: candidates[0].train_no, candidates: null, group_label: group ? group.label : null };
  }
  if (candidates.length > 1) return { time: null, train_no: null, candidates, group_label: group ? group.label : null };
  return null;
}

module.exports = { outboundTiming, returnTiming };
