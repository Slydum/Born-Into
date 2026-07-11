// Utility-AI decision loop for autonomous agents. Every ~1s of sim time an
// agent scores its candidate actions (a priority queue) and commits to the
// best one: sleep, work, groceries, tend the baby, argue, struggle-spiral...
import { clamp, isSchoolDay } from '../constants.js';
import { isNight, isWorkHours, isSchoolHours, topCandidate } from './schedule.js';
import {
  agentById, ageOf, householdOf, homeOf, isHome, adultsHome, dist,
  gotoTile, gotoAdjacent, gotoBuilding, createAgent, randomTraits, randomColors, genName,
} from './npc.js';
import { getBuilding } from '../world/townGen.js';
import { furnitureIn } from '../world/houseGen.js';
import { relScore, adjustRel, getRel } from './relationships.js';
import { logMsg, toast } from '../ui/hud.js';
import { neededFurniture, findFreeSpot, addFurniture, FURNITURE_COST, furnitureLabel } from '../world/furnish.js';

const AI_TICK = 1.0;

export function updateAI(game, agent, dt) {
  agent.aiCool -= dt;
  if (agent.aiCool > 0) return;
  agent.aiCool = AI_TICK;
  if (agent.ai === 'parent') decideParent(game, agent);
  else if (agent.ai === 'kid') decideKid(game, agent);
  else if (agent.ai === 'social') updateSocialWorker(game, agent);
}

function busy(game, agent) {
  return (agent.path && agent.path.length) || agent.activity.until > game.state.simSec;
}

function cooled(game, agent, key) {
  return (agent.cool[key] || 0) <= game.state.simSec;
}

function setCool(game, agent, key, sec) {
  agent.cool[key] = game.state.simSec + sec;
}

// ------------------------------------------------------------------ parents
function decideParent(game, agent) {
  const st = game.state;
  const hh = householdOf(st, agent);
  if (!hh) return;
  const home = homeOf(game, agent);
  const n = agent.needs;
  const t = agent.traits;

  // finish timed work: leave the building when the shift ends
  if (agent.inside) {
    const b = getBuilding(st, agent.inside);
    if (agent.activity.type === 'work' && (st.hour >= 17 || !isWorkHours(st))) {
      exitBuilding(game, agent, b);
      agent.activity = { type: 'idle', until: 0 };
    } else if (agent.activity.type === 'grocery' && agent.activity.until <= st.simSec) {
      if (hh.money >= 30) { hh.money -= 30; hh.fridge = 100; }
      exitBuilding(game, agent, b);
      agent.activity = { type: 'idle', until: 0 };
    }
    if (agent.inside) return;
  }

  if (busy(game, agent)) {
    arriveCheck(game, agent);
    return;
  }
  arriveCheck(game, agent);
  if (busy(game, agent)) return;

  const baby = youngestNeedyKid(game, hh);
  const partner = partnerOf(game, agent);
  const bingePenalty = agent.binged && st.simSec - agent.binged < 60 ? 25 : 0;
  const patience = clamp(t.patience - bingePenalty, 0, 100);

  const cands = [];
  cands.push({
    id: 'sleep',
    score: isNight(st.hour) ? 40 + (100 - n.energy) * 0.5 : (n.energy < 15 ? 65 : 0),
  });
  if (agent.work && isWorkHours(st) && n.energy > 12) {
    cands.push({ id: 'work', score: 42 + t.workEthic * 0.35 - (hh.money > 400 ? 10 : 0) });
  }
  if (hh.fridge < 30 && hh.money >= 30 && cooled(game, agent, 'grocery') && !isNight(st.hour)) {
    cands.push({ id: 'grocery', score: 34 + (30 - hh.fridge) });
  }
  if (home && isHome(game, agent) && cooled(game, agent, 'furnish') && !isNight(st.hour)) {
    const need = neededFurniture(game, home, hh);
    if (need.length) {
      const cost = FURNITURE_COST[need[0]];
      if (hh.money >= cost + 40) {
        cands.push({ id: 'furnish', score: 22 + t.workEthic * 0.15, target: need[0] });
      }
    }
  }
  if (baby) {
    const care = baby.careLevel;
    let s = (78 - care) * 0.9 * (0.4 + t.warmth / 90);
    if (baby.crying) s += patience * 0.45;
    s -= n.stress * 0.25;
    if (isNight(st.hour) && !baby.crying) s -= 15;
    cands.push({ id: 'tend', score: s, target: baby });
  }
  if (partner && isHome(game, agent) && isHome(game, partner) &&
      n.stress > 55 && relScore(st, agent.id, partner.id) < 20 && cooled(game, agent, 'argue')) {
    cands.push({ id: 'argue', score: t.impulsive * 0.35 + n.stress * 0.25, target: partner });
  }
  if (agent.flags.addiction && n.stress > 40 && cooled(game, agent, 'binge')) {
    cands.push({ id: 'binge', score: n.stress * 0.55 + t.impulsive * 0.15 });
  }
  if (!isHome(game, agent)) cands.push({ id: 'goHome', score: 16 });
  cands.push({ id: 'idle', score: 6 });

  const pick = topCandidate(cands);
  if (!pick) return;
  startParentAction(game, agent, pick, hh, home);
}

function startParentAction(game, agent, pick, hh, home) {
  const st = game.state;
  switch (pick.id) {
    case 'sleep': {
      const bed = home && furnitureIn(home, 'bed')[0];
      if (bed && !isNearTile(agent, bed)) { gotoAdjacent(game, agent, bed.x, bed.y); agent.activity = { type: 'goSleep', until: 0 }; }
      else agent.activity = { type: 'sleep', until: st.simSec + 2 };
      break;
    }
    case 'work': {
      const b = getBuilding(st, agent.work.buildingId);
      maybeBringBaby(game, agent, hh, 'work');
      gotoBuilding(game, agent, b);
      agent.activity = { type: 'work', until: 0, target: b.id };
      break;
    }
    case 'grocery': {
      const b = getBuilding(st, 'grocery');
      setCool(game, agent, 'grocery', 40);
      maybeBringBaby(game, agent, hh, 'errand');
      gotoBuilding(game, agent, b);
      agent.activity = { type: 'grocery', until: 0, target: b.id };
      break;
    }
    case 'tend': {
      const baby = pick.target;
      if (!isNearAgent(agent, baby)) {
        gotoAdjacent(game, agent, Math.round(baby.x), Math.round(baby.y)) || gotoTile(game, agent, Math.round(baby.x), Math.round(baby.y));
        agent.activity = { type: 'goTend', until: 0, target: baby.id };
      } else {
        doTend(game, agent, baby);
      }
      break;
    }
    case 'argue': {
      const partner = pick.target;
      doArgue(game, agent, partner);
      break;
    }
    case 'binge': {
      const park = getBuilding(st, 'park');
      setCool(game, agent, 'binge', 120);
      maybeBringBaby(game, agent, hh, 'binge');
      gotoTile(game, agent, park.x + 6, park.y + 5);
      agent.activity = { type: 'goBinge', until: 0 };
      break;
    }
    case 'goHome': {
      if (home) gotoTile(game, agent, home.door.x, home.door.y - 1) || gotoTile(game, agent, home.exit.x, home.exit.y);
      agent.activity = { type: 'goHome', until: 0 };
      break;
    }
    case 'furnish': {
      const type = pick.target;
      const cost = FURNITURE_COST[type];
      setCool(game, agent, 'furnish', 240);
      const spot = findFreeSpot(game, home);
      if (spot && hh.money >= cost) {
        hh.money -= cost;
        addFurniture(game, home, type, spot);
        const playerAg = agentById(st, st.playerId);
        if (playerAg && playerAg.householdId === hh.id) {
          if (type === 'kidbed') {
            logMsg(game, `${agent.name} scrapes together $${cost} for a real bed. You have your own bed now.`, true);
          } else {
            logMsg(game, `${agent.name} brings home ${furnitureLabel(type)} — the house feels a little more put together.`, true);
          }
        }
      }
      agent.activity = { type: 'idle', until: st.simSec + 2 };
      break;
    }
    default: {
      // idle: drift around home
      if (home && game.rng.chance(0.5)) {
        const tx = home.x + game.rng.int(1, home.w - 2);
        const ty = home.y + game.rng.int(1, home.h - 2);
        gotoTile(game, agent, tx, ty);
      }
      agent.activity = { type: 'idle', until: st.simSec + 3 };
    }
  }
}

// Handle "I've arrived, now do the thing" transitions.
function arriveCheck(game, agent) {
  if (agent.path && agent.path.length) return;
  const st = game.state;
  const act = agent.activity;
  switch (act.type) {
    case 'goSleep':
      agent.activity = { type: 'sleep', until: st.simSec + 2 };
      break;
    case 'sleep':
      if (!isNight(st.hour) && agent.needs.energy > 60) agent.activity = { type: 'idle', until: 0 };
      else act.until = st.simSec + 2;
      break;
    case 'work': case 'grocery': {
      const b = getBuilding(st, act.target);
      if (b && Math.round(agent.x) === b.door.x && Math.abs(agent.y - (b.exit.y)) <= 1.2) {
        enterBuilding(game, agent, b);
        if (act.type === 'grocery') act.until = st.simSec + 5;
      }
      break;
    }
    case 'goTend': {
      const baby = agentById(st, act.target);
      if (baby && isNearAgent(agent, baby)) doTend(game, agent, baby);
      else if (baby && cooled(game, agent, 'repath')) {
        setCool(game, agent, 'repath', 2);
        gotoAdjacent(game, agent, Math.round(baby.x), Math.round(baby.y));
      }
      break;
    }
    case 'goBinge':
      agent.activity = { type: 'binge', until: st.simSec + 8 };
      break;
    case 'binge': {
      if (act.until <= st.simSec) {
        const hh = householdOf(st, agent);
        agent.needs.stress = clamp(agent.needs.stress - 30, 0, 100);
        agent.needs.mood = clamp(agent.needs.mood + 10, 0, 100);
        if (hh) hh.money = Math.max(0, hh.money - 20);
        agent.binged = st.simSec;
        agent.activity = { type: 'goHome', until: 0 };
        const home = homeOf(game, agent);
        if (home) gotoTile(game, agent, home.door.x, home.door.y);
      }
      break;
    }
    case 'goHome': {
      dropBabyAtCrib(game, agent);
      agent.activity = { type: 'idle', until: 0 };
      break;
    }
  }
}

// Route stat seeds to the right sheet: the player's live stats, or the
// kidStats that will become a future heir's starting point.
export function bumpKidStat(game, kid, key, d) {
  if (kid.id === game.state.playerId) game.pushPlayerStat(key, d);
  else if (kid.kidStats && key in kid.kidStats) kid.kidStats[key] = clamp(kid.kidStats[key] + d, 0, 100);
}

function doTend(game, agent, baby) {
  const st = game.state;
  const warm = agent.traits.warmth;
  baby.careLevel = clamp(baby.careLevel + 30, 0, 100);
  baby.crying = false;
  baby.cryAsk = 0;
  bumpKidStat(game, baby, 'bonding', warm > 45 ? 2.5 : 0.8);
  bumpKidStat(game, baby, 'stimulation', 1.2);
  agent.activity = { type: 'tend', until: st.simSec + 3 };
  if (baby.id === st.playerId) {
    logMsg(game, `${agent.name} ${warm > 45 ? 'picks you up gently' : 'deals with you, briskly'}.`);
  }
}

function doArgue(game, agent, partner) {
  const st = game.state;
  setCool(game, agent, 'argue', 90);
  setCool(game, partner, 'argue', 90);
  agent.activity = { type: 'argue', until: st.simSec + 4 };
  partner.activity = { type: 'argue', until: st.simSec + 4 };
  agent.needs.stress = clamp(agent.needs.stress + 8, 0, 100);
  partner.needs.stress = clamp(partner.needs.stress + 12, 0, 100);
  adjustRel(st, agent.id, partner.id, -7);
  // shouting seeps into little ears
  const hh = householdOf(st, agent);
  for (const a of st.agents) {
    if (a.flags.dead || a.householdId !== hh.id || ageOf(st, a) >= 13) continue;
    bumpKidStat(game, a, 'stressExp', 4);
    if (a.id === st.playerId) {
      logMsg(game, `${agent.name} and ${partner.name} are shouting again.`, true);
    }
  }
}

function partnerOf(game, agent) {
  const st = game.state;
  const hh = householdOf(st, agent);
  if (!hh) return null;
  return st.agents.find(a => !a.flags.dead && a.id !== agent.id && a.householdId === hh.id &&
    ageOf(st, a) >= 18 && a.ai === 'parent') || null;
}

function youngestNeedyKid(game, hh) {
  const st = game.state;
  let best = null;
  for (const a of st.agents) {
    if (a.flags.dead || a.householdId !== hh.id) continue;
    const age = ageOf(st, a);
    if (age >= 5) continue;
    if (a.careLevel >= 78 && !a.crying) continue;
    if (!best || a.careLevel < best.careLevel) best = a;
  }
  return best;
}

// When leaving the house, a parent decides whether to bring the baby along,
// based on their traits — warm/patient parents rarely leave a baby alone.
function maybeBringBaby(game, agent, hh, why) {
  const st = game.state;
  const baby = st.agents.find(a => !a.flags.dead && a.householdId === hh.id && ageOf(st, a) < 2);
  if (!baby || baby.carriedBy) return;
  const othersHome = adultsHome(game, hh).filter(a => a.id !== agent.id);
  if (othersHome.length) return; // someone's watching them
  let p = agent.traits.warmth / 110 + agent.traits.patience / 250;
  if (why === 'binge') p *= 0.25;
  if (why === 'work') p *= 0.6;
  if (game.rng.chance(clamp(p, 0.05, 0.95))) {
    agent.carrying = baby.id;
    baby.carriedBy = agent.id;
    if (baby.id === st.playerId) logMsg(game, `${agent.name} scoops you up and heads out.`);
  } else if (baby.id === st.playerId) {
    logMsg(game, `${agent.name} leaves. The house goes quiet.`, true);
  }
}

function dropBabyAtCrib(game, agent) {
  const st = game.state;
  if (!agent.carrying) return;
  const baby = agentById(st, agent.carrying);
  const home = homeOf(game, agent);
  if (baby && home) {
    const crib = furnitureIn(home, 'crib')[0];
    if (crib) { baby.x = crib.x; baby.y = crib.y; }
    baby.inside = null;
    baby.carriedBy = null;
    agent.carrying = null;
    bumpKidStat(game, baby, 'stimulation', 3);
  }
}

export function enterBuilding(game, agent, b) {
  agent.inside = b.id;
  agent.x = b.door.x; agent.y = b.door.y;
  if (agent.carrying) {
    const baby = agentById(game.state, agent.carrying);
    if (baby) baby.inside = b.id;
  }
}

export function exitBuilding(game, agent, b) {
  agent.inside = null;
  agent.x = b.exit.x; agent.y = b.exit.y;
  if (agent.carrying) {
    const baby = agentById(game.state, agent.carrying);
    if (baby) { baby.inside = null; baby.x = agent.x; baby.y = agent.y; }
  }
}

function isNearTile(agent, f) {
  return Math.abs(agent.x - f.x) + Math.abs(agent.y - f.y) <= 1.4;
}
function isNearAgent(a, b) {
  return dist(a, b) <= 1.5;
}

// --------------------------------------------------------------------- kids
function decideKid(game, agent) {
  const st = game.state;
  if (busy(game, agent)) { kidArrive(game, agent); return; }
  kidArrive(game, agent);
  if (busy(game, agent)) return;

  const age = ageOf(st, agent);
  const home = homeOf(game, agent);
  if (age >= 5 && isSchoolHours(st)) {
    if (agent.inside !== 'school') {
      const school = getBuilding(st, 'school');
      gotoBuilding(game, agent, school);
      agent.activity = { type: 'toSchool', until: 0 };
    }
    return;
  }
  if (agent.inside === 'school') {
    exitBuilding(game, agent, getBuilding(st, 'school'));
  }
  if (isNight(st.hour)) {
    if (home && !isHome(game, agent)) { gotoTile(game, agent, home.door.x, home.door.y); agent.activity = { type: 'goHome', until: 0 }; }
    else agent.activity = { type: 'sleep', until: st.simSec + 4 };
    return;
  }
  // afternoons: park or home
  if (cooled(game, agent, 'roam')) {
    setCool(game, agent, 'roam', 25);
    if (game.rng.chance(0.5)) {
      const park = getBuilding(st, 'park');
      gotoTile(game, agent, park.x + game.rng.int(2, park.w - 3), park.y + game.rng.int(2, park.h - 3));
    } else if (home) {
      gotoTile(game, agent, home.x + game.rng.int(1, home.w - 2), home.y + game.rng.int(1, home.h - 2));
    }
    agent.activity = { type: 'idle', until: st.simSec + 5 };
  }
}

function kidArrive(game, agent) {
  if (agent.path && agent.path.length) return;
  const st = game.state;
  if (agent.activity.type === 'toSchool') {
    const school = getBuilding(st, 'school');
    if (Math.round(agent.x) === school.door.x && Math.abs(agent.y - school.exit.y) <= 1.2) {
      enterBuilding(game, agent, school);
      agent.activity = { type: 'atSchool', until: 0 };
    }
  }
}

// ---------------------------------------------------------- social services
export function dispatchSocialWorker(game, householdId, reason) {
  const st = game.state;
  if (st.agents.some(a => !a.flags.dead && a.ai === 'social')) return;
  const services = getBuilding(st, 'services');
  const w = createAgent(st, {
    name: 'Case Worker ' + genName(game.rng, game.rng.chance(0.5) ? 'f' : 'm'),
    sex: 'f', birthDay: st.day - 38,
    x: services.exit.x, y: services.exit.y,
    traits: randomTraits(game.rng),
    colors: { skin: '#d9a06e', hair: '#2b2118', shirt: '#37414f', pants: '#22262e' },
    ai: 'social',
  });
  w.mission = { householdId, reason, phase: 'go' };
  const hh = st.households.find(h => h.id === householdId);
  const house = getBuilding(st, hh.houseId);
  gotoTile(game, w, house.door.x, house.door.y);
  logMsg(game, 'A social worker has been dispatched to the house.', true);
}

function updateSocialWorker(game, w) {
  const st = game.state;
  if (w.path && w.path.length) return;
  const m = w.mission;
  if (!m) { w.flags.dead = true; return; }
  const hh = st.households.find(h => h.id === m.householdId);
  const house = hh && getBuilding(st, hh.houseId);

  if (m.phase === 'go') {
    m.phase = 'evaluate';
    w.activity = { type: 'evaluate', until: st.simSec + 5 };
    logMsg(game, 'The case worker is at the door, taking notes.', true);
  } else if (m.phase === 'evaluate' && w.activity.until <= st.simSec) {
    const kids = st.agents.filter(a => !a.flags.dead && a.householdId === m.householdId && ageOf(st, a) < 18);
    const worst = kids.reduce((v, k) => Math.min(v, k.careLevel ?? 100), 100);
    const flagged = st.flags.familyFlagged || 0;
    if (worst < 35 || (m.reason === 'truancy' && flagged >= 2) || m.reason === 'orphaned') {
      game.removeToCare(m.reason);
    } else {
      st.flags.familyFlagged = flagged + 1;
      logMsg(game, 'The case worker issues a warning and leaves. The family is now flagged.', true);
    }
    m.phase = 'leave';
    const services = getBuilding(st, 'services');
    gotoTile(game, w, services.exit.x, services.exit.y);
  } else if (m.phase === 'leave') {
    w.flags.dead = true; // walks back into the bureaucracy
  }
}
