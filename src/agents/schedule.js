// Daily schedule helpers. Schedules are expressed as scored candidates fed
// into the utility-AI priority queue in parentAI.js.
import { isSchoolDay } from '../constants.js';

export function isNight(hour) {
  return hour >= 22 || hour < 6;
}

export function isWorkHours(state) {
  return isSchoolDay(state.day) && state.hour >= 9 && state.hour < 17;
}

export function isSchoolHours(state) {
  return isSchoolDay(state.day) && state.hour >= 8 && state.hour < 15;
}

// Priority queue: highest-utility candidate wins.
export function topCandidate(cands) {
  let best = null;
  for (const c of cands) {
    if (c.score <= 0) continue;
    if (!best || c.score > best.score) best = c;
  }
  return best;
}
