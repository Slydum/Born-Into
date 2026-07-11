// Tile grid helpers + BFS pathfinding over the town map.
import { WALKABLE, MAP_W, MAP_H } from '../constants.js';

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function tileAt(state, x, y) {
  if (!inBounds(x, y)) return -1;
  return state.town.tiles[y * MAP_W + x];
}

export function blockKey(x, y) { return x + ',' + y; }

// game.blockSet is the runtime Set built from state.town.blockers (furniture etc).
export function isWalkable(game, x, y) {
  if (!inBounds(x, y)) return false;
  if (!WALKABLE.has(tileAt(game.state, x, y))) return false;
  if (game.blockSet && game.blockSet.has(blockKey(x, y))) return false;
  return true;
}

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

// BFS shortest path. Returns array of {x,y} steps (excluding start), or null.
export function findPath(game, sx, sy, tx, ty, maxNodes = 6000) {
  sx = Math.round(sx); sy = Math.round(sy); tx = Math.round(tx); ty = Math.round(ty);
  if (!isWalkable(game, tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  const prev = new Map();
  const startK = sy * MAP_W + sx;
  prev.set(startK, -1);
  let frontier = [[sx, sy]];
  let n = 0;
  while (frontier.length && n < maxNodes) {
    const next = [];
    for (const [cx, cy] of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        const k = ny * MAP_W + nx;
        if (prev.has(k)) continue;
        if (!isWalkable(game, nx, ny)) continue;
        prev.set(k, cy * MAP_W + cx);
        n++;
        if (nx === tx && ny === ty) {
          // reconstruct
          const path = [];
          let cur = k;
          while (cur !== startK) {
            path.push({ x: cur % MAP_W, y: Math.floor(cur / MAP_W) });
            cur = prev.get(cur);
          }
          path.reverse();
          return path;
        }
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  return null;
}

// Find a walkable tile adjacent to (x,y) — used to stand next to furniture.
export function adjacentWalkable(game, x, y) {
  for (const [dx, dy] of DIRS) {
    if (isWalkable(game, x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  return null;
}
