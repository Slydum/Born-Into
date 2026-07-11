// Canvas renderer: tiles, furniture, agents, day/night tint, camera.
import { TILE, SCALE, MAP_W, MAP_H, T } from '../constants.js';
import { sprites, charSprite } from './sprites.js';
import { agentById } from '../agents/npc.js';

let cv, ctx;
const cam = { x: 0, y: 0 };

export function initRenderer(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d');
  const resize = () => {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
  };
  window.addEventListener('resize', resize);
  resize();
}

function spriteKindFor(age) {
  if (age < 2) return 'baby';
  if (age < 5) return 'toddler';
  if (age < 13) return 'kid';
  return 'adult';
}

function focusAgent(game) {
  const p = agentById(game.state, game.state.playerId);
  if (!p) return null;
  if (p.carriedBy) {
    const c = agentById(game.state, p.carriedBy);
    if (c && !c.flags.dead) return c;
  }
  return p;
}

export function render(game) {
  const st = game.state;
  const SPR = sprites();
  const ts = TILE * SCALE;
  ctx.fillStyle = '#0e1013';
  ctx.fillRect(0, 0, cv.width, cv.height);

  const focus = focusAgent(game);
  if (focus) {
    cam.x += ((focus.x + 0.5) * ts - cv.width / 2 - cam.x) * 0.15;
    cam.y += ((focus.y + 0.5) * ts - cv.height / 2 - cam.y) * 0.15;
  }
  cam.x = Math.max(-ts * 2, Math.min(MAP_W * ts - cv.width + ts * 2, cam.x));
  cam.y = Math.max(-ts * 2, Math.min(MAP_H * ts - cv.height + ts * 2, cam.y));

  const x0 = Math.max(0, Math.floor(cam.x / ts) - 1);
  const y0 = Math.max(0, Math.floor(cam.y / ts) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((cam.x + cv.width) / ts) + 1);
  const y1 = Math.min(MAP_H - 1, Math.ceil((cam.y + cv.height) / ts) + 1);

  // tiles
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = st.town.tiles[y * MAP_W + x];
      const spr = SPR.tile[t] || SPR.tile[T.GRASS];
      ctx.drawImage(spr, Math.round(x * ts - cam.x), Math.round(y * ts - cam.y), ts, ts);
    }
  }

  // furniture
  for (const b of st.town.buildings) {
    if (!b.furniture) continue;
    for (const f of b.furniture) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      const spr = SPR.furn[f.type];
      if (spr) ctx.drawImage(spr, Math.round(f.x * ts - cam.x), Math.round(f.y * ts - cam.y), ts, ts);
    }
  }

  // building signs
  ctx.font = `${6 * SCALE}px monospace`;
  ctx.textAlign = 'center';
  for (const b of st.town.buildings) {
    if (b.interior) continue; // houses don't need signs
    const cxp = (b.x + b.w / 2) * ts - cam.x;
    const cyp = b.y * ts - cam.y - 4;
    if (cxp < -100 || cxp > cv.width + 100 || cyp < -40 || cyp > cv.height + 40) continue;
    ctx.fillStyle = 'rgba(14,16,19,0.7)';
    const tw = ctx.measureText(b.name).width;
    ctx.fillRect(cxp - tw / 2 - 3, cyp - 10, tw + 6, 12);
    ctx.fillStyle = '#e8d9a0';
    ctx.fillText(b.name, cxp, cyp);
  }

  // agents (skip dead / hidden-inside-civic / carried babies drawn on carrier)
  const drawList = st.agents.filter(a => !a.flags.dead && !a.inside && !a.carriedBy);
  drawList.sort((a, b) => a.y - b.y);
  for (const a of drawList) {
    drawAgent(game, a, ts);
    if (a.carrying) {
      const baby = agentById(st, a.carrying);
      if (baby && !baby.flags.dead) {
        const spr = charSprite('baby', baby.colors);
        ctx.drawImage(spr, Math.round((a.x + 0.32) * ts - cam.x), Math.round((a.y + 0.15) * ts - cam.y), 8 * SCALE, 8 * SCALE);
      }
    }
  }

  // day/night tint
  const h = st.hour;
  let dark = 0;
  if (h < 5) dark = 0.5;
  else if (h < 7) dark = 0.5 * (7 - h) / 2;
  else if (h >= 19 && h < 22) dark = 0.5 * (h - 19) / 3;
  else if (h >= 22) dark = 0.5;
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(8, 10, 30, ${dark})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }

  // player marker
  const p = agentById(st, st.playerId);
  const marker = p && p.carriedBy ? agentById(st, p.carriedBy) : p;
  if (marker && !marker.inside) {
    ctx.strokeStyle = 'rgba(232,176,75,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse((marker.x + 0.5) * ts - cam.x, (marker.y + 1.05) * ts - cam.y, ts * 0.36, ts * 0.14, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawAgent(game, a, ts) {
  const st = game.state;
  const age = st.day - a.birthDay;
  const kind = spriteKindFor(age);
  const spr = charSprite(kind, a.colors);
  const w = spr.width * SCALE, hh = spr.height * SCALE;
  const sx = Math.round((a.x + 0.5) * ts - cam.x - w / 2);
  const sy = Math.round((a.y + 1) * ts - cam.y - hh);
  ctx.drawImage(spr, sx, sy, w, hh);

  // emotes
  let emote = null;
  if (a.crying) emote = { t: '!!', c: '#e05555' };
  else if (a.activity && a.activity.type === 'sleep') emote = { t: 'z', c: '#9fc4e0' };
  else if (a.activity && a.activity.type === 'argue') emote = { t: '#!', c: '#e08b3a' };
  else if (a.activity && a.activity.type === 'tend') emote = { t: '♥', c: '#e07a95' };
  if (emote) {
    ctx.font = `${7 * SCALE}px monospace`;
    ctx.fillStyle = emote.c;
    ctx.textAlign = 'center';
    ctx.fillText(emote.t, sx + w / 2 + 6, sy - 2);
  }
}
