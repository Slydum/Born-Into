// Stamps a wealth-tier house template onto the town map.
import { T, MAP_W } from '../constants.js';
import { blockKey } from '../engine/grid.js';

const FURN_CHARS = {
  C: 'crib', B: 'bed', b: 'kidbed', K: 'stove', R: 'fridge',
  T: 'table', V: 'tv', X: 'toybox', H: 'stairs', O: 'shelf',
};

// Furniture the character can walk onto (hazard tiles) vs. solid pieces.
const WALK_ON = new Set(['stairs']);

export function stampHouse(game, x0, y0, tier, id) {
  const st = game.state;
  const tpl = game.data.houseTemplates.tiers[tier];
  const rows = tpl.rows;
  const h = rows.length, w = rows[0].length;
  const furniture = [];
  let door = null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const gx = x0 + x, gy = y0 + y;
      const i = gy * MAP_W + gx;
      if (ch === 'W') {
        st.town.tiles[i] = T.WALL;
      } else if (ch === 'D') {
        st.town.tiles[i] = T.DOOR;
        door = { x: gx, y: gy };
      } else {
        st.town.tiles[i] = T.FLOOR;
        const ft = FURN_CHARS[ch];
        if (ft) {
          furniture.push({ type: ft, x: gx, y: gy });
          if (!WALK_ON.has(ft)) st.town.blockers.push(blockKey(gx, gy));
        }
      }
    }
  }

  return {
    id, type: 'house', name: tpl.name, x: x0, y: y0, w, h,
    door, exit: { x: door.x, y: door.y + 1 },
    tier, interior: true, furniture, householdId: null,
  };
}

export function furnitureIn(building, type) {
  return (building.furniture || []).filter(f => f.type === type);
}
