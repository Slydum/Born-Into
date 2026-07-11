// Base agent: identity, needs, position, movement. Both NPCs and the player
// character are agents; the difference is who drives them (agent.ai).
import { clamp } from '../constants.js';
import { findPath, adjacentWalkable } from '../engine/grid.js';
import { getBuilding } from '../world/townGen.js';

const FIRST_M = ['Eli', 'Marcus', 'Theo', 'Ray', 'Dominic', 'Wes', 'Aaron', 'Cole', 'Felix', 'Jonah', 'Sam', 'Victor', 'Dez', 'Milo', 'Ruben'];
const FIRST_F = ['Mara', 'Iris', 'Dana', 'Celia', 'June', 'Priya', 'Wren', 'Tessa', 'Alma', 'Noor', 'Skye', 'Vera', 'Lena', 'Opal', 'Rosa'];
const SURNAMES = ['Calloway', 'Reyes', 'Okafor', 'Lindqvist', 'Marsh', 'Delgado', 'Novak', 'Ferris', 'Achebe', 'Tran', 'Boone', 'Kessler'];

const SKIN = ['#e8b88f', '#d9a06e', '#b97f52', '#8a5a37', '#6e4326', '#f0c9a5'];
const HAIR = ['#2b2118', '#4a3320', '#7a5230', '#b58940', '#1a1a1e', '#8f3f2a', '#c9c2b5'];
const SHIRT = ['#b04848', '#4868b0', '#4f8a4a', '#8a5aa0', '#c98a3a', '#4a8a8a', '#a04a72'];
const PANTS = ['#3a4a68', '#4a3a2e', '#2e3a2e', '#503a50', '#333842'];

export function genName(rng, sex, surname) {
  const first = rng.pick(sex === 'f' ? FIRST_F : FIRST_M);
  return surname ? `${first} ${surname}` : first;
}

export function randomColors(rng) {
  return { skin: rng.pick(SKIN), hair: rng.pick(HAIR), shirt: rng.pick(SHIRT), pants: rng.pick(PANTS) };
}

export function randomTraits(rng) {
  return {
    patience: rng.int(15, 90),
    impulsive: rng.int(10, 85),
    warmth: rng.int(15, 95),
    workEthic: rng.int(10, 90),
  };
}

let nextAgentNum = 1;
export function resetAgentCounter(state) {
  nextAgentNum = 1 + Math.max(0, ...state.agents.map(a => parseInt(a.id.slice(1), 10) || 0));
}

export function createAgent(state, opts) {
  const a = {
    id: 'a' + (nextAgentNum++),
    name: opts.name,
    sex: opts.sex,
    surname: opts.surname || '',
    birthDay: opts.birthDay,
    householdId: opts.householdId ?? null,
    parents: opts.parents || [],   // agent ids
    children: opts.children || [],
    traits: opts.traits || { patience: 50, impulsive: 50, warmth: 50, workEthic: 50 },
    needs: { energy: 80, stress: 20, mood: 65 },
    health: 100,
    x: opts.x, y: opts.y,
    path: null,
    speed: opts.speed || 2.4,
    activity: { type: 'idle', until: 0 },
    inside: opts.inside || null,
    carrying: null,
    carriedBy: null,
    crying: false,
    careLevel: 80,          // meaningful while age < 5
    kidStats: opts.kidStats || null, // for potential heirs: {bonding, stimulation, stressExp, curiosity}
    flags: { dead: false, addiction: opts.addiction || false },
    work: opts.work || null, // {buildingId, wage}
    education: opts.education || 0, // 0..100 roll, feeds wealth tier
    ai: opts.ai || 'none',  // 'parent' | 'kid' | 'social' | 'none'
    aiCool: 0,
    cool: {},               // per-action cooldowns (sim seconds)
    colors: opts.colors,
  };
  state.agents.push(a);
  return a;
}

// agentById is called from many per-agent, per-frame update paths; a plain
// .find() scan would make the sim O(n^2) as agents accumulate across
// generations. Cache a Map per state object, invalidated by size so it
// stays correct across pushes (agents are never removed from the array)
// and self-resets when game.state is replaced wholesale on load.
const agentIndexCache = new WeakMap();
export function agentById(state, id) {
  let idx = agentIndexCache.get(state);
  if (!idx || idx.size !== state.agents.length) {
    idx = new Map();
    for (const a of state.agents) idx.set(a.id, a);
    agentIndexCache.set(state, idx);
  }
  return idx.get(id) || null;
}

export function ageOf(state, a) {
  return state.day - a.birthDay;
}

export function householdOf(state, a) {
  return state.households.find(h => h.id === a.householdId) || null;
}

export function homeOf(game, a) {
  const hh = householdOf(game.state, a);
  return hh ? getBuilding(game.state, hh.houseId) : null;
}

export function isHome(game, a) {
  const home = homeOf(game, a);
  if (!home) return false;
  return a.x >= home.x && a.x < home.x + home.w && a.y >= home.y && a.y < home.y + home.h;
}

export function adultsHome(game, hh) {
  const home = getBuilding(game.state, hh.houseId);
  if (!home) return [];
  return game.state.agents.filter(a => !a.flags.dead && a.householdId === hh.id &&
    ageOf(game.state, a) >= 16 &&
    a.x >= home.x && a.x < home.x + home.w && a.y >= home.y && a.y < home.y + home.h && !a.inside);
}

export function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function gotoTile(game, agent, tx, ty) {
  const path = findPath(game, agent.x, agent.y, tx, ty);
  if (!path) return false;
  agent.path = path;
  return true;
}

// Path to stand next to a furniture tile (which is usually blocked).
export function gotoAdjacent(game, agent, tx, ty) {
  const spot = adjacentWalkable(game, tx, ty);
  if (!spot) return false;
  return gotoTile(game, agent, spot.x, spot.y);
}

export function gotoBuilding(game, agent, b) {
  const target = b.interior ? b.door : { x: b.door.x, y: b.exit.y };
  return gotoTile(game, agent, target.x, target.y);
}

export function updateMovement(game, agent, dt) {
  if (!agent.path || !agent.path.length) return;
  const next = agent.path[0];
  const dx = next.x - agent.x, dy = next.y - agent.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const step = agent.speed * dt;
  if (d <= step) {
    agent.x = next.x; agent.y = next.y;
    agent.path.shift();
    if (!agent.path.length) agent.path = null;
  } else {
    agent.x += (dx / d) * step;
    agent.y += (dy / d) * step;
  }
  if (agent.carrying) {
    const baby = agentById(game.state, agent.carrying);
    if (baby) { baby.x = agent.x; baby.y = agent.y; baby.inside = agent.inside; }
  }
}

export function decayNeeds(game, agent, dt) {
  // dt in sim seconds; one game hour = REAL_SEC_PER_HOUR sim seconds
  const perHour = dt / 4;
  const n = agent.needs;
  if (agent.activity.type === 'sleep') {
    n.energy = clamp(n.energy + 14 * perHour, 0, 100);
    n.stress = clamp(n.stress - 3 * perHour, 0, 100);
  } else {
    n.energy = clamp(n.energy - 2.2 * perHour, 0, 100);
  }
  if (agent.flags.addiction) n.stress = clamp(n.stress + 0.8 * perHour, 0, 100);
  n.stress = clamp(n.stress - 0.5 * perHour, 0, 100);
  n.mood = clamp(n.mood + ((70 - n.stress) / 50 - (n.energy < 25 ? 1.5 : 0)) * perHour, 0, 100);
}
