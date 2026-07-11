// Toddler (2-5): first free movement, confined to the house unless a parent
// takes you out. Curiosity builds from poking at things. The house itself is
// dangerous if nobody's watching.
import { clamp } from '../../constants.js';
import { agentById, ageOf, householdOf, adultsHome, homeOf, dist } from '../../agents/npc.js';
import { playerStats, addStat } from '../stats.js';
import { logMsg, toast } from '../../ui/hud.js';
import { getBuilding } from '../../world/townGen.js';
import { tileAt } from '../../engine/grid.js';
import { T } from '../../constants.js';

export const canMove = true;

export function enter(game) {
  logMsg(game, 'You can walk now. The whole house is suddenly reachable.', true);
  toast('Toddler: explore the house (arrow keys/WASD). Watch out for the stove and stairs.');
}

// Toddlers may only roam the house — or outside if being carried/escorted.
export function canEnter(game, tx, ty) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const home = homeOf(game, p);
  if (!home) return true;
  const insideHome = tx >= home.x && tx < home.x + home.w && ty >= home.y && ty < home.y + home.h;
  if (insideHome) return true;
  if (st.playerData.escortedUntil > st.simSec) return true;
  // slipping out the unlocked front door is a hazard, not a freedom
  if (st.playerData.doorUnlocked && Math.abs(tx - home.door.x) <= 4 && Math.abs(ty - home.door.y) <= 4) return true;
  return false;
}

export function update(game, dt) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const s = playerStats(game);
  const hh = householdOf(st, p);
  const home = homeOf(game, p);

  // care still matters, but decays slower than infancy
  const adults = hh ? adultsHome(game, hh) : [];
  const watched = p.carriedBy || adults.length > 0;
  p.careLevel = clamp(p.careLevel - (watched ? 0.10 : 0.30) * dt, 0, 100);
  s.care = p.careLevel;

  // ambient curiosity from being mobile
  addStat(game, 'curiosity', 0.01 * dt);

  // hazards: stairs underfoot, wandering into the street
  const tx = Math.round(p.x), ty = Math.round(p.y);
  if (home) {
    const onStairs = (home.furniture || []).some(f => f.type === 'stairs' && f.x === tx && f.y === ty);
    if (onStairs && !watched && game.rng.chance(0.15 * dt)) {
      hurt(game, game.rng.int(8, 30), 'You tumble down the stairs.');
    }
    const outside = !(tx >= home.x && tx < home.x + home.w && ty >= home.y && ty < home.y + home.h);
    if (outside && !p.carriedBy && st.playerData.escortedUntil <= st.simSec) {
      // out the front door alone: every second in the street is a coin flip stack
      st.playerData.streetTime = (st.playerData.streetTime || 0) + dt;
      if (tileAt(st, tx, ty) === T.ROAD && game.rng.chance(0.25 * dt)) {
        hurt(game, game.rng.int(40, 100), 'A car. Brakes. Not fast enough.');
      }
      // a parent may notice the open door
      for (const a of adults) {
        if (game.rng.chance((a.traits.patience / 100) * 0.2 * dt)) {
          p.x = home.door.x; p.y = home.door.y;
          st.playerData.streetTime = 0;
          logMsg(game, `${a.name} snatches you back inside, heart pounding.`, true);
          addStat(game, 'stressExp', 3);
          break;
        }
      }
    } else {
      st.playerData.streetTime = 0;
    }
  }

  // daily chance the front door is left unlocked (rolled in perDay hook)
}

export function onFurniture(game, f, b) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const hh = householdOf(st, p);
  const adults = hh ? adultsHome(game, hh) : [];
  const watched = adults.some(a => dist(a, p) < 4);

  switch (f.type) {
    case 'stove': {
      if (watched) {
        logMsg(game, 'You reach for the stove but someone pulls your hand back.');
        addStat(game, 'curiosity', 2);
      } else if (game.rng.chance(0.4)) {
        hurt(game, game.rng.int(10, 35), 'You touch the burner. The scream brings the whole street running.');
        st.playerData.flags.hazardSurvivor = true;
      } else {
        addStat(game, 'curiosity', 4);
        st.playerData.flags.hazardSurvivor = true;
        logMsg(game, 'The stove is warm and forbidden and wonderful.', true);
      }
      return true;
    }
    case 'toybox':
      addStat(game, 'curiosity', 4);
      addStat(game, 'stimulation', 4);
      logMsg(game, 'Blocks! Blocks are everything.');
      return true;
    case 'shelf':
      addStat(game, 'curiosity', 3);
      logMsg(game, 'You pull every book off the bottom shelf. Research.');
      return true;
    case 'tv':
      addStat(game, 'stimulation', 2);
      logMsg(game, 'Colors! Sounds!');
      return true;
    case 'crib':
      logMsg(game, 'Your old crib. You are far too big for it now (you are not).');
      return true;
  }
  return false;
}

export function actions(game) {
  const st = game.state;
  const pd = st.playerData;
  const acts = [];
  if ((pd.cryCool || 0) <= st.simSec) {
    acts.push({
      label: 'Throw a tantrum', key: 'C',
      fn: () => {
        pd.cryCool = st.simSec + 12;
        const p = agentById(st, st.playerId);
        p.crying = true;
        game.simTimers.push({ at: st.simSec + 4, fn: () => { p.crying = false; } });
        const hh = householdOf(st, p);
        const adults = adultsHome(game, hh);
        if (adults.length && game.rng.chance(0.6)) {
          const a = game.rng.pick(adults);
          a.activity = { type: 'goTend', until: 0, target: p.id };
          logMsg(game, `${a.name} comes to see what the screaming is about.`);
        } else {
          addStat(game, 'stressExp', 2);
          logMsg(game, 'Your tantrum plays to an empty room.');
        }
      },
    });
  }
  return acts;
}

function hurt(game, dmg, text) {
  addStat(game, 'health', -dmg);
  addStat(game, 'stressExp', 4);
  logMsg(game, text, true);
  const s = playerStats(game);
  if (s.health > 0 && dmg >= 25) game.state.playerData.flags.survivedHardship = true;
}
