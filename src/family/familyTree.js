// Generational tracking. Agents ARE the family tree nodes (they persist with
// flags.dead after death); this module tracks lineage and handles the
// pick-a-child hand-off when the played character dies.
import { agentById, ageOf } from '../agents/npc.js';
import { stageForAge } from '../constants.js';

export function recordBirth(state, baby, motherId, fatherId) {
  baby.parents = [motherId, fatherId].filter(Boolean);
  for (const pid of baby.parents) {
    const par = agentById(state, pid);
    if (par && !par.children.includes(baby.id)) par.children.push(baby.id);
  }
}

export function livingChildrenOf(state, agentId) {
  const a = agentById(state, agentId);
  if (!a) return [];
  return a.children.map(id => agentById(state, id)).filter(c => c && !c.flags.dead);
}

export function describeHeir(state, c) {
  const age = ageOf(state, c);
  const stage = stageForAge(age);
  return `${c.name}, age ${age} (${stage.label})`;
}

export function lineage(state, agentId, depth = 5) {
  const names = [];
  let cur = agentById(state, agentId);
  while (cur && depth-- > 0) {
    names.push(cur.name);
    cur = cur.parents.length ? agentById(state, cur.parents[0]) : null;
  }
  return names;
}
