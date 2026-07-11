// Household furnishing: parents buy what a growing family actually needs,
// and add small upgrades when there's money spare. Nobody redecorates on a
// whim — it's gated by what's missing from the house and what's affordable.
import { T } from '../constants.js';
import { tileAt, blockKey } from '../engine/grid.js';
import { ageOf } from '../agents/npc.js';

export const FURNITURE_COST = { kidbed: 70, shelf: 90 };

// What's missing from a home, given who actually lives there.
export function neededFurniture(game, home, hh) {
  if (!home || !hh) return [];
  const st = game.state;
  const have = new Set((home.furniture || []).map(f => f.type));
  const need = [];
  const hasYoungKid = st.agents.some(a => !a.flags.dead && a.householdId === hh.id &&
    ageOf(st, a) >= 2 && ageOf(st, a) < 13);
  if (hasYoungKid && !have.has('kidbed')) need.push('kidbed');
  if (!have.has('shelf')) need.push('shelf');
  return need;
}

// First open floor tile inside the house (away from the door) to place new
// furniture on.
export function findFreeSpot(game, home) {
  const st = game.state;
  for (let y = home.y + 1; y < home.y + home.h - 1; y++) {
    for (let x = home.x + 1; x < home.x + home.w - 1; x++) {
      if (tileAt(st, x, y) !== T.FLOOR) continue;
      if (x === home.door.x && y === home.door.y) continue;
      if (game.blockSet.has(blockKey(x, y))) continue;
      return { x, y };
    }
  }
  return null;
}

export function addFurniture(game, home, type, spot) {
  home.furniture = home.furniture || [];
  home.furniture.push({ type, x: spot.x, y: spot.y });
  game.state.town.blockers.push(blockKey(spot.x, spot.y));
  game.blockSet.add(blockKey(spot.x, spot.y));
}

export function furnitureLabel(type) {
  return { kidbed: 'a bed', shelf: 'a bookshelf' }[type] || type;
}
