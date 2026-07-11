// Shared constants: tile enum, time scale, life stages.

export const TILE = 16;          // source pixel size of a tile sprite
export const SCALE = 2;          // on-screen zoom
export const MAP_W = 72;
export const MAP_H = 46;

// Time: 1 game day = 1 game year. 4 real seconds per game hour at 1x speed,
// so one year of life takes ~96s at 1x (32s at 3x).
export const REAL_SEC_PER_HOUR = 4;
export const MIN_WAGE = 7;

export const T = {
  GRASS: 0, ROAD: 1, PATH: 2, FLOOR: 3, WALL: 4, DOOR: 5,
  TREE: 6, BWALL: 7, BDOOR: 8, PARK: 9, FLOWER: 10,
};

export const WALKABLE = new Set([T.GRASS, T.ROAD, T.PATH, T.FLOOR, T.DOOR, T.BDOOR, T.PARK, T.FLOWER]);

export const STAGES = [
  { id: 'baby',    min: 0,  label: 'Baby' },
  { id: 'toddler', min: 2,  label: 'Toddler' },
  { id: 'child',   min: 5,  label: 'Child' },
  { id: 'teen',    min: 13, label: 'Teen' },
  { id: 'adult',   min: 18, label: 'Adult' },
  { id: 'elder',   min: 60, label: 'Elder' },
];

export function stageForAge(age) {
  let s = STAGES[0];
  for (const st of STAGES) if (age >= st.min) s = st;
  return s;
}

export function stageIndex(id) {
  return STAGES.findIndex(s => s.id === id);
}

export function isSchoolDay(day) {
  return ((day % 7) + 7) % 7 < 5;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function fmtHour(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
