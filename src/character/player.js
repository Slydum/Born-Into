// The controllable character: stage dispatch, movement, interaction.
import { T, clamp } from '../constants.js';
import { tileAt, isWalkable } from '../engine/grid.js';
import { agentById, ageOf, householdOf, dist } from '../agents/npc.js';
import { buildingAt, getBuilding } from '../world/townGen.js';
import { adjustRel, getRel, relScore } from '../agents/relationships.js';
import { enterBuilding } from '../agents/parentAI.js';
import { addStat, playerStats } from './stats.js';
import { checkReveals, traitMod } from './traits.js';
import { logMsg, toast } from '../ui/hud.js';

import * as baby from './stages/baby.js';
import * as toddler from './stages/toddler.js';
import * as child from './stages/child.js';
import * as teen from './stages/teen.js';
import * as adult from './stages/adult.js';

const STAGE_MODS = { baby, toddler, child, teen, adult, elder: adult };

export function playerAgent(game) {
  return agentById(game.state, game.state.playerId);
}

export function stageMod(game) {
  return STAGE_MODS[game.state.playerData.stage] || baby;
}

export function setStage(game, id) {
  const pd = game.state.playerData;
  const prev = pd.stage;
  pd.stage = id;
  checkReveals(game);
  const mod = STAGE_MODS[id];
  if (mod && mod.enter) mod.enter(game, prev);
}

export function updatePlayer(game, dt) {
  const p = playerAgent(game);
  if (!p || p.flags.dead) return;
  const mod = stageMod(game);

  if (mod.canMove && !p.carriedBy && !p.inside && !(p.path && p.path.length)) {
    movePlayer(game, p, dt, mod);
  }
  if (mod.update) mod.update(game, dt);
  autoEnterIfArrived(game, p);
}

// "Walk to school" / "Go to work" path you to the tile just outside a civic
// door, one step short of actually entering — otherwise you'd have to nudge
// yourself onto the door tile in exactly the right direction afterward,
// which is fiddly at the best of times and easy to get stuck on with a
// touch d-pad. Once you arrive, step the rest of the way in automatically.
function autoEnterIfArrived(game, p) {
  if (!p.autoEnterBuilding || p.inside || (p.path && p.path.length)) return;
  const b = getBuilding(game.state, p.autoEnterBuilding);
  if (!b) { p.autoEnterBuilding = null; return; }
  // same fuzzy tolerance parentAI uses for NPC arrival, so a stray sub-tile
  // nudge from player input doesn't defeat the match and strand the flag
  if (Math.round(p.x) === b.door.x && Math.abs(p.y - b.exit.y) <= 1.2) {
    p.autoEnterBuilding = null;
    enterBuilding(game, p, b);
    game.ui.openPanel(b);
  }
}

function movePlayer(game, p, dt, mod) {
  const inp = game.input;
  const speed = 3.2;
  let vx = inp.x, vy = inp.y;
  if (!vx && !vy) return;
  const len = Math.hypot(vx, vy);
  vx = vx / len * speed * dt; vy = vy / len * speed * dt;

  const tryAxis = (nx, ny) => {
    const tx = Math.round(nx), ty = Math.round(ny);
    // the tile you're already standing on is always leavable, even if it's
    // blocked furniture (e.g. a toddler starting out on top of their crib) —
    // otherwise a sub-tile step that rounds back to your own tile can never
    // pass the walkability check and movement locks up entirely
    const onOwnTile = tx === Math.round(p.x) && ty === Math.round(p.y);
    if (!onOwnTile) {
      if (!isWalkable(game, tx, ty)) return false;
      if (mod.canEnter && !mod.canEnter(game, tx, ty)) return false;
    }
    return true;
  };
  if (tryAxis(p.x + vx, p.y)) p.x += vx;
  if (tryAxis(p.x, p.y + vy)) p.y += vy;

  // stepping onto a civic door enters the building (child and up)
  const tx = Math.round(p.x), ty = Math.round(p.y);
  if (tileAt(game.state, tx, ty) === T.BDOOR) {
    const b = buildingAt(game.state, tx, ty);
    const age = ageOf(game.state, p);
    if (b && age >= 5) {
      enterBuilding(game, p, b);
      game.ui.openPanel(b);
    } else if (b) {
      p.y = b.exit.y; // toddlers bounce off
    }
  }
}

// ------------------------------------------------------------- interaction
export function nearestInteractable(game) {
  const st = game.state;
  const p = playerAgent(game);
  if (!p || p.inside || p.carriedBy) return null;
  const mod = stageMod(game);
  let best = null, bestD = 1.6;

  // furniture in interior buildings
  for (const b of st.town.buildings) {
    if (!b.furniture) continue;
    for (const f of b.furniture) {
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      if (d < bestD) { best = { kind: 'furniture', f, b }; bestD = d; }
    }
  }
  // nearby agents
  for (const a of st.agents) {
    if (a.flags.dead || a.id === p.id || a.inside || a.carriedBy) continue;
    const d = dist(p, a);
    if (d < bestD) { best = { kind: 'agent', a }; bestD = d; }
  }
  if (best && mod.filterInteract && !mod.filterInteract(game, best)) return null;
  return best;
}

export function doInteract(game) {
  const target = nearestInteractable(game);
  if (!target) return;
  const mod = stageMod(game);
  if (target.kind === 'furniture') {
    if (mod.onFurniture && mod.onFurniture(game, target.f, target.b)) return;
    defaultFurniture(game, target.f);
  } else {
    talkMenu(game, target.a);
  }
}

function defaultFurniture(game, f) {
  const p = playerAgent(game);
  const hh = householdOf(game.state, p);
  const s = playerStats(game);
  switch (f.type) {
    case 'fridge':
      if (hh && hh.fridge > 0) {
        hh.fridge = Math.max(0, hh.fridge - 4);
        p.needs.energy = clamp(p.needs.energy + 10, 0, 100);
        p.needs.mood = clamp(p.needs.mood + 4, 0, 100);
        logMsg(game, 'You raid the fridge.');
      } else logMsg(game, 'The fridge is empty.', true);
      break;
    case 'bed': case 'kidbed':
      p.needs.energy = clamp(p.needs.energy + 35, 0, 100);
      p.needs.stress = clamp(p.needs.stress - 10, 0, 100);
      logMsg(game, 'You catch some sleep.');
      break;
    case 'tv':
      p.needs.mood = clamp(p.needs.mood + 6, 0, 100);
      addStat(game, 'stimulation', 1);
      logMsg(game, 'You zone out in front of the TV.');
      break;
    case 'shelf':
      addStat(game, 'grades', 2);
      addStat(game, 'curiosity', 2);
      logMsg(game, 'You pull a book off the shelf and read.');
      break;
    case 'toybox':
      addStat(game, 'curiosity', 3);
      addStat(game, 'stimulation', 3);
      logMsg(game, 'You dig through the toybox.');
      break;
    case 'bench':
      p.needs.stress = clamp(p.needs.stress - 6, 0, 100);
      logMsg(game, 'You sit on the bench and watch the park.');
      break;
    default:
      logMsg(game, `It's a ${f.type}.`);
  }
}

function talkMenu(game, a) {
  const st = game.state;
  const p = playerAgent(game);
  const myAge = ageOf(st, p);
  const theirAge = ageOf(st, a);
  const rel = getRel(st, p.id, a.id);
  const opts = [];

  opts.push({
    label: `Talk`,
    sub: `Relationship: ${Math.round(rel.score)}`,
    fn: () => {
      const gain = 3 + Math.round(traitMod(game, 'socialMod') / 8 + traitMod(game, 'charm') / 10);
      adjustRel(st, p.id, a.id, gain);
      addStat(game, 'social', 1);
      logMsg(game, `You chat with ${a.name}.`);
    },
  });
  if (myAge < 13 && theirAge < 13) {
    opts.push({
      label: 'Play together',
      fn: () => {
        adjustRel(st, p.id, a.id, 6);
        addStat(game, 'social', 2);
        addStat(game, 'stimulation', 3);
        const r = getRel(st, p.id, a.id);
        if (r.score >= 35 && !r.tags.friend) {
          r.tags.friend = true;
          logMsg(game, `${a.name} is your friend now. That's a real thing that will last.`, true);
        } else {
          logMsg(game, `You and ${a.name} play until you're both out of breath.`);
        }
      },
    });
  }
  const canRomance = myAge >= 13 && theirAge >= 13 && theirAge < 60 &&
    Math.abs(myAge - theirAge) <= 8 && a.ai !== 'social' && !p.parents.includes(a.id);
  if (canRomance) {
    if (!rel.tags.partner) {
      opts.push({
        label: 'Flirt',
        sub: rel.score >= 30 ? 'They seem receptive' : 'Might be too soon',
        fn: () => {
          const charm = traitMod(game, 'charm');
          if (game.rng.chance(clamp(0.3 + rel.score / 150 + charm / 120, 0.05, 0.9))) {
            adjustRel(st, p.id, a.id, 9);
            st.playerData.flags.romanced = true;
            logMsg(game, `${a.name} laughs at your joke a beat too long.`, true);
            const r2 = getRel(st, p.id, a.id);
            if (r2.score >= 55 && !r2.tags.dating) {
              r2.tags.dating = true;
              logMsg(game, `You and ${a.name} are officially a thing.`, true);
            }
          } else {
            adjustRel(st, p.id, a.id, -4);
            logMsg(game, `${a.name} suddenly remembers somewhere else to be.`);
          }
        },
      });
    }
    if (rel.tags.dating && myAge >= 13) {
      opts.push({
        label: 'Spend the evening together',
        fn: () => game.romanticEvening(a),
      });
    }
    if (rel.tags.dating && !rel.tags.partner && myAge >= 18 && theirAge >= 18 && rel.score >= 75) {
      opts.push({
        label: 'Propose',
        fn: () => game.propose(a),
      });
    }
  }
  opts.push({ label: 'Never mind', fn: () => {} });
  game.ui.showChoice({ title: a.name, text: describeAgent(game, a), options: opts });
}

function describeAgent(game, a) {
  const st = game.state;
  const age = ageOf(st, a);
  const rel = relScore(st, st.playerId, a.id);
  let mood = a.needs.stress > 60 ? 'They look frayed.' : a.needs.mood > 60 ? 'They seem in good spirits.' : 'They seem tired.';
  return `Age ${age}. ${mood}${rel > 50 ? ' They light up when they see you.' : ''}`;
}

export function getActions(game) {
  const mod = stageMod(game);
  const acts = mod.actions ? mod.actions(game) : [];
  const near = nearestInteractable(game);
  if (near && mod.canMove) {
    const label = near.kind === 'furniture' ? `Interact: ${near.f.type}` : `Talk to ${near.a.name}`;
    acts.push({ label, key: 'E', fn: () => doInteract(game) });
  }
  return acts;
}
