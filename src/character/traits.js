// Traits are never chosen — they're revealed by how life has gone so far.
// Reveal checks run at stage transitions and after notable events.
import { stageIndex } from '../constants.js';
import { playerStats } from './stats.js';
import { logMsg, toast } from '../ui/hud.js';

export function hasTrait(game, id) {
  return game.state.playerData.traits.includes(id);
}

export function grantTrait(game, id, silent = false) {
  const pd = game.state.playerData;
  if (pd.traits.includes(id)) return;
  pd.traits.push(id);
  const def = game.data.traits.find(t => t.id === id);
  if (def && !silent) {
    toast(`Trait revealed: ${def.name} — ${def.desc}`);
    logMsg(game, `Trait revealed: ${def.name}.`, true);
  }
}

function condMet(game, cond) {
  if (!cond) return true;
  const s = playerStats(game);
  const flags = game.state.playerData.flags;
  if (cond.flag !== undefined) return !!flags[cond.flag];
  if (cond.stat !== undefined) {
    const v = s[cond.stat] ?? 0;
    if (cond.gte !== undefined) return v >= cond.gte;
    if (cond.lte !== undefined) return v <= cond.lte;
  }
  return false;
}

// Reveal any traits whose stage has been reached and whose condition holds.
export function checkReveals(game) {
  const curIdx = stageIndex(game.state.playerData.stage);
  for (const def of game.data.traits) {
    if (hasTrait(game, def.id)) continue;
    if (stageIndex(def.stage) > curIdx) continue;
    if (condMet(game, def.cond)) grantTrait(game, def.id);
  }
}

// Sum a numeric effect across all revealed traits, e.g. traitMod(g,'riskMod').
export function traitMod(game, key) {
  let sum = 0;
  for (const id of game.state.playerData.traits) {
    const def = game.data.traits.find(t => t.id === id);
    if (def && def.effects && def.effects[key]) sum += def.effects[key];
  }
  return sum;
}
