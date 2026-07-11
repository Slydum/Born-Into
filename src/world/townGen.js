// Seed-based town generation: roads, park, civic buildings, house plots.
import { T, MAP_W, MAP_H } from '../constants.js';
import { stampHouse } from './houseGen.js';

const TOWN_NAMES = ['Maplewood', 'Cedar Falls', 'Rosier', 'Halloway', 'Bramble Creek', 'Elm Hollow', 'Kestrel Point', 'Gray Harbor'];
const CIVIC_NAMES = ['Alder', 'Birchall', 'Corven', 'Dunmore', 'Ellery', 'Fairview', 'Garland'];

function fill(st, x0, y0, w, h, t) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) st.town.tiles[y * MAP_W + x] = t;
}

function civic(st, rng, id, type, label, x, y, w, h) {
  fill(st, x, y, w, h, T.BWALL);
  const dx = x + Math.floor(w / 2);
  st.town.tiles[y * MAP_W + dx] = T.BDOOR; // door on north wall, facing the road
  const name = `${rng.pick(CIVIC_NAMES)} ${label}`;
  const b = { id, type, name, x, y, w, h, door: { x: dx, y }, exit: { x: dx, y: y - 1 }, interior: false };
  st.town.buildings.push(b);
  // path from door up to the road
  for (let py = y - 1; py > 23; py--) st.town.tiles[py * MAP_W + dx] = T.PATH;
  return b;
}

export function generateTown(game) {
  const st = game.state;
  const rng = game.rng;
  st.town = { name: rng.pick(TOWN_NAMES), tiles: new Array(MAP_W * MAP_H).fill(T.GRASS), buildings: [], blockers: [] };

  // border trees
  for (let x = 0; x < MAP_W; x++) { st.town.tiles[x] = T.TREE; st.town.tiles[(MAP_H - 1) * MAP_W + x] = T.TREE; }
  for (let y = 0; y < MAP_H; y++) { st.town.tiles[y * MAP_W] = T.TREE; st.town.tiles[y * MAP_W + MAP_W - 1] = T.TREE; }

  // roads: one main horizontal, one vertical
  fill(st, 1, 22, MAP_W - 2, 2, T.ROAD);
  fill(st, 16, 1, 2, MAP_H - 2, T.ROAD);

  // park (north-east)
  fill(st, 24, 2, 26, 9, T.PARK);
  for (let i = 0; i < 26; i++) {
    const x = 24 + rng.int(0, 25), y = 2 + rng.int(0, 8);
    st.town.tiles[y * MAP_W + x] = rng.chance(0.4) ? T.TREE : T.FLOWER;
  }
  const park = {
    id: 'park', type: 'park', name: `${rng.pick(CIVIC_NAMES)} Park`,
    x: 24, y: 2, w: 26, h: 9, door: { x: 36, y: 10 }, exit: { x: 36, y: 11 }, interior: true, furniture: [],
  };
  park.furniture.push({ type: 'bench', x: 30, y: 6 }, { type: 'bench', x: 42, y: 5 });
  st.town.buildings.push(park);
  for (let py = 11; py < 22; py++) st.town.tiles[py * MAP_W + 36] = T.PATH;

  // civic row south of the main road
  civic(st, rng, 'school', 'school', 'Elementary & High', 3, 26, 12, 7);
  civic(st, rng, 'grocery', 'grocery', 'Grocery', 18, 26, 9, 6);
  civic(st, rng, 'office', 'office', '& Co. Offices', 30, 26, 10, 7);
  civic(st, rng, 'hospital', 'hospital', 'General Hospital', 43, 26, 10, 6);
  const services = civic(st, rng, 'services', 'services', 'Family Services', 56, 26, 9, 6);
  services.name = 'Family Services';

  // house plots north of the road: tier rises west -> east
  const plots = [
    { x: 3, tier: 0 }, { x: 21, tier: 0 },
    { x: 31, tier: 1 }, { x: 44, tier: 1 },
    { x: 57, tier: 2 },
  ];
  let hid = 0;
  for (const p of plots) {
    const tpl = game.data.houseTemplates.tiers[p.tier];
    const h = tpl.rows.length;
    const y0 = 21 - h; // bottom wall one row above the road, path row between
    const house = stampHouse(game, p.x, y0, p.tier, 'house' + (hid++));
    st.town.buildings.push(house);
    // path from front door to road
    for (let py = house.door.y + 1; py < 22; py++) st.town.tiles[py * MAP_W + house.door.x] = T.PATH;
  }

  // group home (north-west), used by social services for removals
  const gh = stampHouse(game, 3, 3, 1, 'grouphome');
  gh.name = 'Sunrise Group Home';
  gh.isGroupHome = true;
  st.town.buildings.push(gh);
  for (let py = gh.door.y + 1; py < 22; py++) st.town.tiles[py * MAP_W + gh.door.x] = T.PATH;

  // scattered trees on open grass
  for (let i = 0; i < 40; i++) {
    const x = rng.int(2, MAP_W - 3), y = rng.int(2, MAP_H - 3);
    if (st.town.tiles[y * MAP_W + x] === T.GRASS) st.town.tiles[y * MAP_W + x] = T.TREE;
  }
}

export function getBuilding(state, id) {
  return state.town.buildings.find(b => b.id === id) || null;
}

export function buildingAt(state, x, y) {
  return state.town.buildings.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) || null;
}

export function vacantHouses(state, tier) {
  return state.town.buildings.filter(b => b.type === 'house' && !b.isGroupHome && b.householdId === null && (tier === undefined || b.tier === tier));
}
