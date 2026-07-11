// Code-generated pixel-art sprite sheets. Every sprite is authored as a tiny
// pixel map (strings of palette characters) and rendered once to an offscreen
// canvas at boot, then blitted by the renderer. This keeps the repo free of
// binary assets while still giving real (if humble) pixel art.
import { T, TILE } from '../constants.js';

const SPR = { tile: {}, furn: {}, chars: new Map() };
export function sprites() { return SPR; }

function px(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function drawMap(g, map, pal, ox = 0, oy = 0) {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const ch = map[y][x];
      if (ch === '.') continue;
      const col = pal[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function mapSprite(map, pal, w, h) {
  const [c, g] = px(w || map[0].length, h || map.length);
  drawMap(g, map, pal);
  return c;
}

// ---------------------------------------------------------------- characters
// Body pixel maps by stage. Palette chars: h hair, s skin, e eye, c shirt,
// p pants, b boots, w swaddle blanket.
const BODY = {
  adult: [
    '...hhhh...', '..hhhhhh..', '..hssssh..', '..sessse..', '..ssssss..',
    '...ssss...', '..cccccc..', '.cccccccc.', '.sccccccs.', '.sccccccs.',
    '..cccccc..', '..pppppp..', '..pp..pp..', '..pp..pp..', '..pp..pp..',
    '..bb..bb..',
  ],
  kid: [
    '..hhhh..', '.hhhhhh.', '.hssssh.', '.sessse.', '.ssssss.', '..cccc..',
    '.cccccc.', '.sccccs.', '..cccc..', '..pppp..', '..p..p..', '..b..b..',
  ],
  toddler: [
    '..hhhh..', '.hssssh.', '.sessse.', '.ssssss.', '..cccc..', '.cccccc.',
    '..cccc..', '..pppp..', '..p..p..', '..b..b..',
  ],
  baby: [
    '..ssss..', '.sessse.', '.ssssss.', '.wwwwww.', 'wwwwwwww', 'wwwwwwww',
    '.wwwwww.', '..wwww..',
  ],
};

export function charSprite(kind, colors) {
  const key = kind + '|' + colors.hair + colors.skin + colors.shirt + colors.pants;
  if (SPR.chars.has(key)) return SPR.chars.get(key);
  const map = BODY[kind] || BODY.adult;
  const c = mapSprite(map, {
    h: colors.hair, s: colors.skin, e: '#1b1b22',
    c: colors.shirt, p: colors.pants, b: '#25252d', w: colors.shirt,
  });
  SPR.chars.set(key, c);
  return c;
}

// ------------------------------------------------------------------ tiles
function noiseTile(base, speck, n, seedShift) {
  const [c, g] = px(TILE, TILE);
  g.fillStyle = base; g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = speck;
  // deterministic pseudo-random specks so tiles look uniform everywhere
  let s = 12345 + seedShift;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = s % TILE;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const y = s % TILE;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}

function buildTiles() {
  SPR.tile[T.GRASS] = noiseTile('#3e6b3a', '#356032', 14, 1);
  SPR.tile[T.PARK] = noiseTile('#47773f', '#3c6b37', 16, 7);

  { // road: asphalt with faint dashes
    const [c, g] = px(TILE, TILE);
    g.fillStyle = '#3a3d44'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#44474f';
    for (let i = 0; i < 8; i++) g.fillRect((i * 7) % TILE, (i * 5) % TILE, 1, 1);
    g.fillStyle = '#5a5d66'; g.fillRect(0, 7, 4, 1); g.fillRect(9, 7, 4, 1);
    SPR.tile[T.ROAD] = c;
  }
  { // path: packed dirt
    SPR.tile[T.PATH] = noiseTile('#8a7355', '#7c6749', 12, 3);
  }
  { // floor: wood planks
    const [c, g] = px(TILE, TILE);
    g.fillStyle = '#7a5b3d'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#6d5136';
    g.fillRect(0, 3, TILE, 1); g.fillRect(0, 8, TILE, 1); g.fillRect(0, 13, TILE, 1);
    g.fillStyle = '#856544'; g.fillRect(5, 0, 1, 3); g.fillRect(11, 9, 1, 4);
    SPR.tile[T.FLOOR] = c;
  }
  { // wall: brick
    const [c, g] = px(TILE, TILE);
    g.fillStyle = '#8c4a3c'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#733a2f';
    for (let y = 0; y < TILE; y += 4) g.fillRect(0, y, TILE, 1);
    for (let y = 0; y < TILE; y += 8) { g.fillRect(4, y, 1, 4); g.fillRect(12, y + 4, 1, 4); }
    g.fillStyle = '#9c584a'; g.fillRect(1, 1, 2, 1); g.fillRect(9, 5, 2, 1);
    SPR.tile[T.WALL] = c;
  }
  { // house door
    const [c, g] = px(TILE, TILE);
    g.fillStyle = '#7a5b3d'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#5d4326'; g.fillRect(2, 0, 12, 16);
    g.fillStyle = '#6e5233'; g.fillRect(4, 2, 8, 5); g.fillRect(4, 9, 8, 5);
    g.fillStyle = '#d8b45a'; g.fillRect(12, 8, 1, 2);
    SPR.tile[T.DOOR] = c;
  }
  { // tree (drawn on grass)
    const [c, g] = px(TILE, TILE);
    g.drawImage(SPR.tile[T.GRASS], 0, 0);
    drawMap(g, [
      '....gggggg......', '...gggGGggg.....', '..ggGGgggGgg....', '..gGgggggggg....',
      '..ggggGGgggg....', '..gGggggggGg....', '...gggGGggg.....', '....gggggg......',
      '......tt........', '......tt........', '.....ttt........', '................',
      '................', '................', '................', '................',
    ], { g: '#2d5c2b', G: '#3d7439', t: '#5d4326' });
    SPR.tile[T.TREE] = c;
  }
  { // civic building wall
    const [c, g] = px(TILE, TILE);
    g.fillStyle = '#5c6470'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#4d5460'; g.fillRect(0, 0, TILE, 1); g.fillRect(0, 8, TILE, 1);
    g.fillStyle = '#8fa3b8'; g.fillRect(3, 3, 4, 3); g.fillRect(10, 3, 4, 3);
    g.fillStyle = '#6b7482'; g.fillRect(3, 11, 4, 3); g.fillRect(10, 11, 4, 3);
    SPR.tile[T.BWALL] = c;
  }
  { // civic building door
    const [c, g] = px(TILE, TILE);
    g.fillStyle = '#5c6470'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#2c313a'; g.fillRect(3, 1, 10, 15);
    g.fillStyle = '#9fc4e0'; g.fillRect(4, 2, 8, 9);
    g.fillStyle = '#d8b45a'; g.fillRect(11, 11, 1, 2);
    SPR.tile[T.BDOOR] = c;
  }
  { // flowers on park grass
    const [c, g] = px(TILE, TILE);
    g.drawImage(SPR.tile[T.PARK], 0, 0);
    g.fillStyle = '#d86a7c'; g.fillRect(3, 4, 2, 2); g.fillRect(11, 9, 2, 2);
    g.fillStyle = '#e8d05a'; g.fillRect(4, 5, 1, 1); g.fillRect(12, 10, 1, 1); g.fillRect(7, 12, 2, 2);
    SPR.tile[T.FLOWER] = c;
  }
}

// ---------------------------------------------------------------- furniture
const FURN_MAPS = {
  crib: [
    'BBBBBBBB', 'B.B..B.B', 'BppppppB', 'BppppppB', 'B.B..B.B', 'BBBBBBBB',
    'B......B', 'B......B',
  ],
  bed: [
    'BBBBBBBB', 'BwwwwwwB', 'BrrrrrrB', 'BrrrrrrB', 'BrrrrrrB', 'BrrrrrrB',
    'BrrrrrrB', 'BBBBBBBB',
  ],
  kidbed: [
    'BBBBBBBB', 'BwwwwwwB', 'BuuuuuuB', 'BuuuuuuB', 'BuuuuuuB', 'BuuuuuuB',
    'BuuuuuuB', 'BBBBBBBB',
  ],
  stove: [
    'GGGGGGGG', 'G.O..O.G', 'G......G', 'G.O..O.G', 'GGGGGGGG', 'GddddddG',
    'GddddddG', 'GGGGGGGG',
  ],
  fridge: [
    'FFFFFFFF', 'F......F', 'F.....hF', 'FFFFFFFF', 'F......F', 'F.....hF',
    'F......F', 'FFFFFFFF',
  ],
  table: [
    '........', 'BBBBBBBB', 'BbbbbbbB', 'BbbbbbbB', 'BBBBBBBB', '.B....B.',
    '.B....B.', '.B....B.',
  ],
  tv: [
    '........', 'DDDDDDDD', 'DssssssD', 'DssssssD', 'DssssssD', 'DDDDDDDD',
    '...DD...', '..DDDD..',
  ],
  toybox: [
    '........', '........', 'RRYYGGUU', 'RRYYGGUU', 'BBBBBBBB', 'BooooooB',
    'BooooooB', 'BBBBBBBB',
  ],
  stairs: [
    'DD......', 'DDDD....', 'GGDDDD..', 'GGGGDD..', 'DDGGDDDD', 'DDDDGGDD',
    'GGDDDDGG', 'GGGGDDDD',
  ],
  shelf: [
    'BBBBBBBB', 'BrgubryB', 'BBBBBBBB', 'BygrbugB', 'BBBBBBBB', 'BurygbrB',
    'BBBBBBBB', 'B......B',
  ],
  bench: [
    '........', '........', 'BBBBBBBB', 'bbbbbbbb', 'BBBBBBBB', '.B....B.',
    '.B....B.', '........',
  ],
};

const FURN_PAL = {
  B: '#5d4326', b: '#7a5b3d', p: '#e0a8b8', w: '#e8e6df', r: '#b04848',
  u: '#4868b0', G: '#787f8a', O: '#22242a', d: '#4d5460', F: '#c8d4dc',
  h: '#6b7482', D: '#2c313a', s: '#7fb4d8', R: '#c25555', Y: '#e0c050',
  g: '#5d9b58', o: '#c9a35c', y: '#e0c050',
};

function buildFurniture() {
  for (const [k, map] of Object.entries(FURN_MAPS)) {
    if (!Array.isArray(map) || map.some(r => typeof r !== 'string')) continue;
    const [c, g] = px(TILE, TILE);
    // furniture drawn at 2x from an 8x8 map to fill the 16px tile
    const [tmp, tg] = px(8, 8);
    drawMap(tg, map, FURN_PAL);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, 8, 8, 0, 0, TILE, TILE);
    SPR.furn[k] = c;
  }
}

export function initSprites() {
  buildTiles();
  buildFurniture();
}
