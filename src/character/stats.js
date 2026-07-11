// Player stat pool: numeric sliders accumulated through life, which seed
// trait reveals and bias event odds.
import { clamp } from '../constants.js';
import { agentById, householdOf } from '../agents/npc.js';
import { logMsg } from '../ui/hud.js';
import { adjustRel } from '../agents/relationships.js';

export function defaultStats() {
  return {
    care: 80,        // baby/toddler: how looked-after you are right now
    bonding: 25, stimulation: 15, stressExp: 5,   // infancy seeds
    curiosity: 10,   // toddler exploration
    grades: 45, social: 25,                       // school years
    rebellion: 0, addiction: 0,                   // teen risk
    health: 100,
  };
}

export function playerStats(game) {
  return game.state.playerData.stats;
}

export function addStat(game, key, delta) {
  const s = playerStats(game);
  if (!(key in s)) return;
  s[key] = clamp(s[key] + delta, 0, 100);
  if (key === 'health' && s.health <= 0) game.onPlayerDeath('their injuries');
}

// Generic effect applicator used by the event system.
// eff: { stats:{k:d}, needs:{k:d}, money:d, flag:{k:v}, rel:{who,d}, log }
export function applyEffects(game, eff, ctx = {}) {
  if (!eff) return;
  const st = game.state;
  const p = agentById(st, st.playerId);
  if (eff.stats) for (const [k, d] of Object.entries(eff.stats)) addStat(game, k, d);
  if (eff.needs && p) {
    for (const [k, d] of Object.entries(eff.needs)) {
      p.needs[k] = clamp((p.needs[k] || 0) + d, 0, 100);
    }
  }
  if (eff.money) {
    const hh = householdOf(st, p);
    if (hh) hh.money = Math.max(0, hh.money + eff.money);
  }
  if (eff.flag) {
    for (const [k, v] of Object.entries(eff.flag)) st.playerData.flags[k] = v;
  }
  if (eff.rel && ctx.target) adjustRel(st, st.playerId, ctx.target, eff.rel);
  if (eff.promotion) game.tryPromotion();
  if (eff.layoffRisk) { /* flavor only for now */ }
  if (eff.log) logMsg(game, eff.log, true);
}
