// Relationship scores between any two agents, keyed by sorted id pair.
import { clamp } from '../constants.js';

function relKey(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

export function getRel(state, a, b) {
  const k = relKey(a, b);
  if (!state.relationships[k]) state.relationships[k] = { score: 0, tags: {} };
  return state.relationships[k];
}

export function relScore(state, a, b) {
  const k = relKey(a, b);
  return state.relationships[k] ? state.relationships[k].score : 0;
}

export function adjustRel(state, a, b, delta) {
  const r = getRel(state, a, b);
  r.score = clamp(r.score + delta, -100, 100);
  return r;
}

export function tagRel(state, a, b, tag, val = true) {
  getRel(state, a, b).tags[tag] = val;
}

export function hasTag(state, a, b, tag) {
  const k = relKey(a, b);
  return !!(state.relationships[k] && state.relationships[k].tags[tag]);
}
