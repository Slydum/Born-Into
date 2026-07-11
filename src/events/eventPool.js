// Life events by stage, weighted by traits. One roll per morning.
import { agentById, ageOf } from '../agents/npc.js';
import { playerStats, applyEffects } from '../character/stats.js';
import { checkReveals, traitMod } from '../character/traits.js';
import { logMsg } from '../ui/hud.js';

function condMet(game, ev) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  if (ev.minAge && ageOf(st, p) < ev.minAge) return false;
  if (!ev.cond) return true;
  if (ev.cond.flag !== undefined) return !!st.playerData.flags[ev.cond.flag];
  if (ev.cond.stat !== undefined) {
    const v = playerStats(game)[ev.cond.stat] ?? 0;
    if (ev.cond.gte !== undefined) return v >= ev.cond.gte;
    if (ev.cond.lte !== undefined) return v <= ev.cond.lte;
  }
  return true;
}

export function rollDailyEvent(game) {
  const st = game.state;
  if (!game.rng.chance(0.45)) return;
  const stage = st.playerData.stage === 'elder' ? 'adult' : st.playerData.stage;
  const riskBias = traitMod(game, 'riskMod');
  const pool = game.data.events.filter(e => e.stage === stage && condMet(game, e));
  if (!pool.length) return;

  let total = 0;
  const weighted = pool.map(e => {
    let w = e.weight || 1;
    if (e.riskEvent) w *= Math.max(0.2, 1 + riskBias / 40); // traits bias event odds
    total += w;
    return [w, e];
  });
  let r = game.rng.range(0, total);
  let ev = weighted[weighted.length - 1][1];
  for (const [w, e] of weighted) { if ((r -= w) <= 0) { ev = e; break; } }
  fireEvent(game, ev);
}

export function fireEvent(game, ev) {
  if (ev.auto) {
    applyEffects(game, ev.auto.effects);
    if (ev.auto.log) logMsg(game, ev.auto.log, true);
    checkReveals(game);
    return;
  }
  game.ui.showChoice({
    title: ev.title,
    text: ev.text,
    options: ev.choices.map(c => ({
      label: c.label,
      fn: () => {
        if (c.outcomes) {
          let r = game.rng.next(), pick = c.outcomes[c.outcomes.length - 1];
          for (const o of c.outcomes) { if ((r -= o.p) <= 0) { pick = o; break; } }
          applyEffects(game, pick.effects);
          logMsg(game, pick.effects && pick.effects.log ? pick.effects.log : pick.text, true);
        } else {
          applyEffects(game, c.effects);
        }
        checkReveals(game);
      },
    })),
  });
}
