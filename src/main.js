// Born Into — game init, main loop, world/family creation, generational
// hand-off. Everything serializable lives in game.state; everything else
// (sprites, input, timers) is runtime and rebuilt on load.
import { REAL_SEC_PER_HOUR, stageForAge, clamp, isSchoolDay, T } from './constants.js';
import { makeRng, hashStr } from './engine/rng.js';
import { blockKey } from './engine/grid.js';
import { initSprites } from './engine/sprites.js';
import { initRenderer, render } from './engine/renderer.js';
import { saveGame, loadSave, clearSave } from './engine/save.js';
import { generateTown, getBuilding, vacantHouses } from './world/townGen.js';
import { furnitureIn } from './world/houseGen.js';
import { leaveBuilding } from './world/locations.js';
import {
  createAgent, agentById, ageOf, householdOf, homeOf, genName, randomColors,
  randomTraits, updateMovement, decayNeeds, resetAgentCounter, adultsHome, gotoTile,
} from './agents/npc.js';
import { updateAI, dispatchSocialWorker, bumpKidStat } from './agents/parentAI.js';
import { isWorkHours } from './agents/schedule.js';
import { getRel, adjustRel, relScore } from './agents/relationships.js';
import { defaultStats, playerStats, addStat } from './character/stats.js';
import { checkReveals, traitMod } from './character/traits.js';
import { playerAgent, setStage, updatePlayer, getActions } from './character/player.js';
import { pickCareer } from './character/stages/adult.js';
import { romanticEveningOutcome } from './character/stages/teen.js';
import { rollDailyEvent } from './events/eventPool.js';
import { livingChildrenOf, describeHeir } from './family/familyTree.js';
import { dailyPregnancyTick } from './family/pregnancy.js';
import { initHud, updateHud, logMsg, toast } from './ui/hud.js';
import { initChoiceUI, showChoice, openPanel, closePanel, refreshPanel } from './ui/choiceMenu.js';

const game = {
  state: null,
  data: null,
  rng: null,
  blockSet: new Set(),
  input: { x: 0, y: 0 },
  simTimers: [],
  modalPause: false,
  ui: null,
};
window.BI = { game }; // debug handle

// ------------------------------------------------------------------- boot
async function boot() {
  const [traits, events, houseTemplates] = await Promise.all([
    fetch('assets/data/traits.json').then(r => r.json()),
    fetch('assets/data/events.json').then(r => r.json()),
    fetch('assets/data/houseTemplates.json').then(r => r.json()),
  ]);
  game.data = { traits, events, houseTemplates };

  initSprites();
  initRenderer(document.getElementById('game'));
  initHud();
  initChoiceUI(game);
  attachGameMethods();

  const saved = loadSave();
  if (saved) {
    game.state = saved;
    game.rng = makeRng(saved.seed);
    game.rng.setState(saved.rngState);
    rebuildRuntime();
    logMsg(game, 'The world resumes where you left it.');
  } else {
    newGame();
  }

  setupInput();
  setInterval(() => { if (game.state) saveGame(game); }, 12000);
  window.addEventListener('beforeunload', () => saveGame(game));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(game); });

  requestAnimationFrame(frame);
}

function rebuildRuntime() {
  game.blockSet = new Set(game.state.town.blockers);
  resetAgentCounter(game.state);
}

// --------------------------------------------------------------- new game
function newGame(seed) {
  clearSave();
  seed = seed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  game.rng = makeRng(seed);
  const rng = game.rng;

  game.state = {
    version: 1,
    seed, rngState: 0,
    day: 0, hour: 7.5, speed: 1, simSec: 0,
    town: null,
    households: [],
    agents: [],
    relationships: {},
    pregnancies: [],
    escalation: { level: 0, rivalId: null, cooldownDay: 0 },
    playerId: null,
    playerData: null,
    flags: { generation: 1, familyFlagged: 0 },
    log: [],
  };
  const st = game.state;

  generateTown(game);
  game.blockSet = new Set(st.town.blockers);

  // ---- roll the player's parents: their traits determine the family's
  // wealth tier, which determines the house you're born into
  const surname = rng.pick(['Calloway', 'Reyes', 'Okafor', 'Marsh', 'Delgado', 'Novak', 'Ferris', 'Tran', 'Boone', 'Kessler']);
  const single = rng.chance(0.22);
  const momTraits = randomTraits(rng);
  const dadTraits = randomTraits(rng);
  const momEdu = rng.int(10, 90), dadEdu = rng.int(10, 90);
  const fortune = (momTraits.workEthic + momEdu + (single ? momTraits.workEthic + momEdu : dadTraits.workEthic + dadEdu)) / 4 + rng.int(-12, 12);
  const tier = fortune < 42 ? 0 : fortune < 68 ? 1 : 2;

  const house = vacantHouses(st, tier)[0] || vacantHouses(st)[0];
  const hh = {
    id: 'hh1', houseId: house.id, tier: house.tier,
    money: [90, 260, 700][house.tier], fridge: 70,
  };
  st.households.push(hh);
  house.householdId = hh.id;

  const jobFor = (t, ethics) => t === 0
    ? { buildingId: 'grocery', wage: 8 }
    : t === 1 ? { buildingId: 'office', wage: 15 }
    : { buildingId: ethics > 60 ? 'hospital' : 'office', wage: 27 };

  const mkParent = (sex, traits, edu, dx) => {
    const a = createAgent(st, {
      name: genName(rng, sex, surname), sex, surname,
      birthDay: -rng.int(24, 34),
      householdId: hh.id,
      traits,
      x: house.x + 2 + dx, y: house.y + 2,
      colors: randomColors(rng),
      ai: 'parent',
      work: jobFor(house.tier, traits.workEthic),
      education: edu,
    });
    // struggle states are rolled, not scripted
    a.flags.addiction = rng.chance(0.13 + (traits.impulsive > 70 ? 0.12 : 0) + (house.tier === 0 ? 0.06 : 0));
    return a;
  };
  const mom = mkParent('f', momTraits, momEdu, 0);
  const dad = single ? null : mkParent('m', dadTraits, dadEdu, 2);
  if (dad) {
    const r = getRel(st, mom.id, dad.id);
    r.score = rng.int(-15, 70);
    r.tags.partner = true;
  }
  // one parent may stay home with an infant
  if (dad && rng.chance(0.35)) {
    (mom.traits.warmth >= dad.traits.warmth ? mom : dad).work = null;
  }

  // ---- the player: a newborn in the crib
  const crib = furnitureIn(house, 'crib')[0];
  const psex = rng.chance(0.5) ? 'f' : 'm';
  const player = createAgent(st, {
    name: genName(rng, psex, surname), sex: psex, surname,
    birthDay: 0,
    householdId: hh.id,
    x: crib.x, y: crib.y,
    colors: randomColors(rng),
    parents: [mom.id, dad ? dad.id : null].filter(Boolean),
    ai: 'none',
  });
  player.careLevel = 85;
  for (const pid of player.parents) agentById(st, pid).children.push(player.id);
  st.playerId = player.id;
  st.playerData = freshPlayerData();

  // ---- neighbor families: sources of friends, rivals, and romance
  const others = vacantHouses(st);
  for (let i = 0; i < Math.min(3, others.length); i++) {
    const nh = others[i];
    const nhh = { id: 'hh' + (i + 2), houseId: nh.id, tier: nh.tier, money: [90, 260, 700][nh.tier], fridge: 70 };
    st.households.push(nhh);
    nh.householdId = nhh.id;
    const nsur = rng.pick(['Lindqvist', 'Achebe', 'Vance', 'Moreno', 'Petrov', 'Ohara']);
    const p1 = createAgent(st, {
      name: genName(rng, 'f', nsur), sex: 'f', surname: nsur, birthDay: -rng.int(24, 36),
      householdId: nhh.id, traits: randomTraits(rng), x: nh.x + 2, y: nh.y + 2,
      colors: randomColors(rng), ai: 'parent', work: jobFor(nh.tier, 50),
    });
    p1.flags.addiction = rng.chance(0.12);
    const p2 = createAgent(st, {
      name: genName(rng, 'm', nsur), sex: 'm', surname: nsur, birthDay: -rng.int(24, 36),
      householdId: nhh.id, traits: randomTraits(rng), x: nh.x + 3, y: nh.y + 2,
      colors: randomColors(rng), ai: 'parent', work: null,
    });
    getRel(st, p1.id, p2.id).tags.partner = true;
    const kid = createAgent(st, {
      name: genName(rng, rng.chance(0.5) ? 'f' : 'm', nsur), sex: rng.chance(0.5) ? 'f' : 'm', surname: nsur,
      birthDay: -rng.int(0, 2),
      householdId: nhh.id, x: nh.x + 2, y: nh.y + 3,
      colors: randomColors(rng), ai: 'kid', parents: [p1.id, p2.id],
      kidStats: { bonding: 40, stimulation: 40, stressExp: 15, curiosity: 30 },
    });
    p1.children.push(kid.id); p2.children.push(kid.id);
  }

  setStage(game, 'baby');
  logMsg(game, `${st.town.name}. A ${['small', 'modest', 'comfortable'][house.tier]} house on the ${['west', 'middle', 'east'][Math.min(2, house.tier)]} side of town.`, true);
  logMsg(game, `You are born to ${mom.name}${dad ? ' and ' + dad.name : ' — she is raising you alone'}.`, true);
  toast(`Born Into — you are ${player.name}. Press C to cry. Your parents' rolled traits will do the rest.`);
  saveGame(game);
}

function freshPlayerData() {
  return {
    stage: 'baby',
    stats: defaultStats(),
    traits: [],
    flags: {},
    education: null,
    job: null,
    truancy: 0,
    neglectTimer: 0,
    escortedUntil: 0,
    doorUnlocked: false,
  };
}

// --------------------------------------------------- cross-module services
function attachGameMethods() {
  game.pushPlayerStat = (key, d) => addStat(game, key, d);

  game.tryPromotion = () => {
    const pd = game.state.playerData;
    if (!pd.job) return;
    pd.job.wage += 7;
    pd.job.tier = Math.min(2, pd.job.tier + 1);
    pd.job.title = pd.job.title + ' (Sr.)';
    const p = playerAgent(game);
    if (p.work) p.work.wage = pd.job.wage;
    logMsg(game, `Promotion. You are now ${pd.job.title} at $${pd.job.wage}/h.`, true);
  };

  game.assignCareer = () => {
    const st = game.state;
    const pd = st.playerData;
    const p = playerAgent(game);
    const age = ageOf(st, p);
    if (pd.education === 'college' && age < 22) {
      logMsg(game, 'College years: lean, caffeinated, and full of doors not yet opened. (Career starts at 22.)', true);
      return;
    }
    pd.job = pickCareer(game);
    pd.flags.employed = true;
    p.work = { buildingId: pd.job.buildingId, wage: pd.job.wage };
    logMsg(game, `You start work — ${pd.job.title}, $${pd.job.wage}/h (tier ${pd.job.tier}).`, true);
  };

  game.moveHousehold = (house) => {
    const st = game.state;
    const p = playerAgent(game);
    const oldHH = householdOf(st, p);
    const price = [150, 400, 900][house.tier];
    if (!oldHH || oldHH.money < price) return;
    oldHH.money -= price;
    const newHH = {
      id: 'hh' + (st.households.length + 1 + Math.floor(game.rng.next() * 1000)),
      houseId: house.id, tier: house.tier,
      money: Math.round(oldHH.money * 0.5), fridge: 40,
    };
    oldHH.money -= newHH.money;
    st.households.push(newHH);
    house.householdId = newHH.id;
    // bring partner + your own minor children
    const movers = st.agents.filter(a => !a.flags.dead && a.householdId === oldHH.id &&
      (a.id === p.id || getRel(st, p.id, a.id).tags.partner || (p.children.includes(a.id) && ageOf(st, a) < 18)));
    for (const m of movers) {
      m.householdId = newHH.id;
      m.x = house.x + 2; m.y = house.y + 2;
    }
    st.playerData.movedDay = st.day;
    logMsg(game, `You move into ${house.name}. Tier ${house.tier} — the same ladder your parents rolled on.`, true);
  };

  game.propose = (partner) => {
    const st = game.state;
    const p = playerAgent(game);
    const charm = traitMod(game, 'charm');
    if (game.rng.chance(clamp(0.6 + charm / 100 + relScore(st, p.id, partner.id) / 400, 0.2, 0.95))) {
      const r = getRel(st, p.id, partner.id);
      r.tags.partner = true;
      r.score = Math.max(r.score, 80);
      partner.householdId = p.householdId;
      partner.ai = 'parent';
      const home = homeOf(game, p);
      if (home) { partner.x = home.x + 2; partner.y = home.y + 2; }
      const hh = householdOf(st, p);
      if (hh) hh.money += 60;
      logMsg(game, `${partner.name} says yes. A small wedding in the park; the whole town shows up for the food.`, true);
    } else {
      adjustRel(st, p.id, partner.id, -10);
      logMsg(game, `${partner.name} isn't ready. The silence on the walk home is heavy.`, true);
    }
  };

  game.romanticEvening = (partner) => romanticEveningOutcome(game, partner);

  // Social services removal: minors go to the group home / foster care.
  game.removeToCare = (reason) => {
    const st = game.state;
    const p = playerAgent(game);
    const flaggedHH = householdOf(st, p);
    const gh = st.town.buildings.find(b => b.isGroupHome);
    let fosterHH = st.households.find(h => h.houseId === gh.id);
    if (!fosterHH) {
      fosterHH = { id: 'hhFoster', houseId: gh.id, tier: 1, money: 200, fridge: 85 };
      st.households.push(fosterHH);
      gh.householdId = fosterHH.id;
      for (const [sex, dx] of [['f', 0], ['m', 2]]) {
        createAgent(st, {
          name: genName(game.rng, sex, 'Whitfield'), sex, surname: 'Whitfield',
          birthDay: st.day - game.rng.int(30, 45), householdId: fosterHH.id,
          traits: { patience: game.rng.int(55, 90), impulsive: game.rng.int(10, 40), warmth: game.rng.int(45, 85), workEthic: game.rng.int(40, 80) },
          x: gh.x + 2 + dx, y: gh.y + 2, colors: randomColors(game.rng), ai: 'parent',
        });
      }
    }
    const minors = st.agents.filter(a => !a.flags.dead && a.householdId === flaggedHH.id && ageOf(st, a) < 18);
    const crib = furnitureIn(gh, 'crib')[0];
    for (const m of minors) {
      m.householdId = fosterHH.id;
      m.carriedBy = null;
      const spot = ageOf(st, m) < 2 && crib ? crib : { x: gh.x + 3, y: gh.y + 3 };
      m.x = spot.x; m.y = spot.y; m.inside = null;
      bumpKidStat(game, m, 'stressExp', 12);
      bumpKidStat(game, m, 'bonding', -10);
      if (m.careLevel !== undefined) m.careLevel = Math.max(m.careLevel, 70);
    }
    const parent = st.agents.find(a => !a.flags.dead && a.householdId === flaggedHH.id && a.ai === 'parent');
    if (parent) parent.carrying = null;
    st.flags.fostered = true;
    st.playerData.flags.survivedHardship = true;
    if (minors.some(m => m.id === st.playerId)) {
      logMsg(game, `Removal (${reason}). You are taken to ${gh.name}. New beds, new rules, carers paid to be patient.`, true);
      toast('Social services removed you from your home. Your future family stats just changed.');
      st.playerData.stats.care = 70;
    } else if (minors.length) {
      logMsg(game, `Social services remove your children (${reason}). The house has never been so quiet.`, true);
    }
  };

  game.onPlayerDeath = (cause) => {
    const st = game.state;
    const p = playerAgent(game);
    if (!p || p.flags.dead) return;
    p.flags.dead = true;
    p.carrying = null;
    const age = ageOf(st, p);
    logMsg(game, `${p.name} dies of ${cause}, age ${age}.`, true);

    const heirs = livingChildrenOf(st, p.id);
    if (!heirs.length) {
      showChoice({
        title: `${p.name} — ${Math.max(0, p.birthDay)}–${st.day}`,
        text: `Dead of ${cause} at ${age}, leaving no children. The line ends here.`,
        options: [{ label: 'Begin a new life (new town, new family)', fn: () => newGame() }],
      });
      return;
    }
    showChoice({
      title: 'The Line Continues',
      text: `${p.name} is gone at ${age} (${cause}). Someone has to carry the story. Choose which of your children you will live as:`,
      options: heirs.map(c => ({
        label: describeHeir(st, c),
        sub: c.kidStats ? `bonding ${Math.round(c.kidStats.bonding)} · stress ${Math.round(c.kidStats.stressExp)} · curiosity ${Math.round(c.kidStats.curiosity)}` : '',
        fn: () => switchToHeir(c),
      })),
    });
  };
}

function switchToHeir(child) {
  const st = game.state;
  st.playerId = child.id;
  child.ai = 'none';
  st.flags.generation += 1;
  st.flags.familyFlagged = 0;
  st.escalation = { level: 0, rivalId: null, cooldownDay: 0 };

  const ks = child.kidStats || { bonding: 30, stimulation: 25, stressExp: 15, curiosity: 20 };
  const pd = freshPlayerData();
  pd.stats = {
    ...defaultStats(),
    care: child.careLevel ?? 80,
    bonding: ks.bonding, stimulation: ks.stimulation,
    stressExp: ks.stressExp, curiosity: ks.curiosity,
    grades: clamp(35 + ks.curiosity / 2 + game.rng.int(-10, 10), 0, 100),
    social: clamp(20 + ks.bonding / 3, 0, 100),
    health: 100,
  };
  st.playerData = pd;
  const age = ageOf(st, child);
  setStage(game, stageForAge(age).id);
  if (age >= 18) game.assignCareer();
  checkReveals(game);
  logMsg(game, `Generation ${st.flags.generation}: you are ${child.name} now, age ${age}. Your childhood already happened — you were shaped by it.`, true);
  toast(`You continue as ${child.name}.`);
  saveGame(game);
}

// -------------------------------------------------------------- main loop
let last = performance.now();
let hudCool = 0;

function frame(t) {
  const rawDt = Math.min(0.1, (t - last) / 1000);
  last = t;
  const st = game.state;
  if (st && !game.modalPause && st.speed > 0) {
    sim(rawDt * st.speed);
  }
  if (st) {
    render(game);
    hudCool -= rawDt;
    if (hudCool <= 0) { hudCool = 0.2; updateHud(game); }
  }
  requestAnimationFrame(frame);
}

function sim(dt) {
  const st = game.state;
  st.simSec += dt;

  // clock
  const prevHour = Math.floor(st.hour);
  st.hour += dt / REAL_SEC_PER_HOUR;
  if (Math.floor(st.hour) !== prevHour) perHour(Math.floor(st.hour) % 24);
  if (st.hour >= 24) {
    st.hour -= 24;
    st.day += 1;
    perDay();
  }

  // sim timers
  for (const tm of [...game.simTimers]) {
    if (st.simSec >= tm.at) {
      game.simTimers = game.simTimers.filter(x => x !== tm);
      tm.fn();
    }
  }

  // agents
  for (const a of st.agents) {
    if (a.flags.dead) continue;
    if (a.id !== st.playerId) {
      updateAI(game, a, dt);
      updateMovement(game, a, dt);
      if (ageOf(st, a) >= 13) decayNeeds(game, a, dt);
      npcKidCare(a, dt);
    } else {
      updateMovement(game, a, dt); // walk-to-school etc.
    }
  }

  updatePlayer(game, dt);
}

// Care simulation for babies/toddlers that are NOT the played character —
// including the player's own children, whose neglect brings the same social
// worker to YOUR door.
function npcKidCare(a, dt) {
  const st = game.state;
  const age = ageOf(st, a);
  if (age >= 5 || a.careLevel === undefined) return;
  const hh = householdOf(st, a);
  if (!hh) return;
  const watched = a.carriedBy || adultsHome(game, hh).length > 0;
  a.careLevel = clamp(a.careLevel - (watched ? 0.06 : 0.25) * dt, 0, 100);

  const playerHH = agentById(st, st.playerId)?.householdId;
  if (hh.id === playerHH && a.careLevel < 15) {
    a.neglect = (a.neglect || 0) + dt;
    if (a.neglect > 25 && (st.flags.swCooldown || 0) <= st.simSec) {
      st.flags.swCooldown = st.simSec + 120;
      dispatchSocialWorker(game, hh.id, 'neglect');
    }
  } else if (a.neglect) {
    a.neglect = Math.max(0, a.neglect - dt);
  }
}

// -------------------------------------------------------------- per hour
function perHour(h) {
  const st = game.state;
  const p = playerAgent(game);

  // wages: anyone standing inside their workplace during work hours earns
  if (isWorkHours(st)) {
    for (const a of st.agents) {
      if (a.flags.dead || !a.work || a.inside !== a.work.buildingId) continue;
      const hh = householdOf(st, a);
      if (hh) hh.money += a.work.wage;
      if (a.id === st.playerId) {
        a.needs.energy = clamp(a.needs.energy - 2, 0, 100);
        a.needs.stress = clamp(a.needs.stress + 1.5 + traitMod(game, 'stressGain'), 0, 100);
      }
    }
  }

  // family meals drain the fridge; empty fridges fray everyone
  if (h === 8 || h === 13 || h === 19) {
    for (const hh of st.households) {
      const members = st.agents.filter(a => !a.flags.dead && a.householdId === hh.id).length;
      if (hh.fridge > 0) {
        hh.fridge = Math.max(0, hh.fridge - members * 2);
      } else {
        for (const a of st.agents) {
          if (!a.flags.dead && a.householdId === hh.id) {
            a.needs.stress = clamp(a.needs.stress + 4, 0, 100);
            a.needs.mood = clamp(a.needs.mood - 4, 0, 100);
          }
        }
        if (p && p.householdId === hh.id && ageOf(st, p) < 13) bumpKidStat(game, p, 'stressExp', 1);
      }
    }
  }

  // one life-event roll each morning
  if (h === 9 && p && !p.flags.dead) rollDailyEvent(game);

  // school lets out
  if (h === 15 && p && p.inside === 'school') {
    leaveBuilding(game, getBuilding(st, 'school'));
    logMsg(game, 'The last bell rings.');
  }
  // work day ends
  if (h === 17 && p && p.inside && st.playerData.job && p.inside === st.playerData.job.buildingId) {
    leaveBuilding(game, getBuilding(st, p.inside));
    logMsg(game, 'Shift over. The evening is yours.');
  }

  // weekend park outing for a toddler with a warm, present parent
  if (h === 14 && !isSchoolDay(st.day) && p && st.playerData.stage === 'toddler' && !st.flags.fostered) {
    const hh = householdOf(st, p);
    const adults = adultsHome(game, hh);
    const warmest = adults.sort((a, b) => b.traits.warmth - a.traits.warmth)[0];
    if (warmest && game.rng.chance(warmest.traits.warmth / 130)) {
      const park = getBuilding(st, 'park');
      st.playerData.escortedUntil = st.simSec + 70;
      gotoTile(game, warmest, park.x + 5, park.y + 5);
      p.x = warmest.x; p.y = warmest.y + 1;
      logMsg(game, `${warmest.name} takes you to the park. Other kids! Grass! Everything!`, true);
      bumpKidStat(game, p, 'stimulation', 6);
    }
  }
  // escort expired: a parent fetches you home
  if (st.playerData && st.playerData.escortedUntil && st.playerData.escortedUntil <= st.simSec && st.playerData.stage === 'toddler') {
    const home = homeOf(game, p);
    if (home) {
      const inHome = p.x >= home.x && p.x < home.x + home.w && p.y >= home.y && p.y < home.y + home.h;
      if (!inHome) {
        p.x = home.x + 2; p.y = home.y + 2;
        logMsg(game, 'You are carried home, asleep before the front door.');
      }
    }
    st.playerData.escortedUntil = 0;
  }
}

// --------------------------------------------------------------- per day
function perDay() {
  const st = game.state;
  const p = playerAgent(game);
  if (!p || p.flags.dead) { saveGame(game); return; }
  const age = ageOf(st, p);

  // stage transitions
  const stage = stageForAge(age);
  if (stage.id !== st.playerData.stage) {
    setStage(game, stage.id);
    if (stage.id === 'elder') {
      logMsg(game, 'You are old now. The town has changed around you; mostly you notice the hills got steeper.', true);
    }
  }

  // toddler-era front door: sometimes somebody forgets to lock it
  st.playerData.doorUnlocked = game.rng.chance(0.3);

  // college graduation
  if (st.playerData.education === 'college' && age === 22 && !st.playerData.job) {
    game.assignCareer();
  }

  dailyPregnancyTick(game);
  checkReveals(game);

  // ageing and death — for everyone, not just you
  for (const a of st.agents) {
    if (a.flags.dead) continue;
    const aAge = ageOf(st, a);
    // nobody carries a two-year-old around all day
    if (aAge >= 2 && a.carriedBy) {
      const carrier = agentById(st, a.carriedBy);
      if (carrier) carrier.carrying = null;
      a.carriedBy = null;
    }
    if (a.id === st.playerId) continue;
    if (aAge >= 62) {
      const P = 0.02 * (aAge - 60) + (a.flags.addiction ? 0.05 : 0);
      if (aAge >= 90 || game.rng.chance(P)) npcDeath(a, aAge);
    }
  }

  // the player's own mortality: old-age threshold OR accumulated damage
  const s = playerStats(game);
  if (age >= 60) {
    const healthMod = traitMod(game, 'healthMod');
    const P = 0.03 * (age - 58) + (100 - (s.health + healthMod)) * 0.002 + (s.addiction > 50 ? 0.06 : 0);
    if (age >= 92 || game.rng.chance(clamp(P, 0, 0.9))) {
      game.onPlayerDeath('old age');
      saveGame(game);
      return;
    }
  }
  // chronic strain wears health down
  if (s.addiction > 60) addStat(game, 'health', -1);
  if (age >= 70) addStat(game, 'health', -1);

  // orphaned minors get taken into care
  if (age < 18) {
    const hh = householdOf(st, p);
    const guardians = st.agents.filter(a => !a.flags.dead && a.householdId === hh.id && ageOf(st, a) >= 18);
    if (!guardians.length && !st.flags.fostered) {
      logMsg(game, 'There is no one left to look after you.', true);
      game.removeToCare('orphaned');
    }
  }

  saveGame(game);
}

function npcDeath(a, aAge) {
  const st = game.state;
  a.flags.dead = true;
  a.carrying = null;
  const p = playerAgent(game);
  if (p) {
    const baby = st.agents.find(x => x.carriedBy === a.id);
    if (baby) { baby.carriedBy = null; }
    if (p.parents.includes(a.id)) {
      logMsg(game, `${a.name} — your ${a.sex === 'f' ? 'mother' : 'father'} — dies at ${aAge}.`, true);
      toast(`${a.name} has died.`);
    } else if (getRel(st, p.id, a.id).tags.partner) {
      logMsg(game, `${a.name}, your partner, dies at ${aAge}. The other side of the bed goes cold.`, true);
      toast(`${a.name} has died.`);
    } else if (p.children.includes(a.id)) {
      logMsg(game, `Your child ${a.name} dies at ${aAge}.`, true);
    }
  }
}

// ------------------------------------------------------------------ input
function setupInput() {
  const keys = {};
  const updateAxis = () => {
    game.input.x = (keys['arrowright'] || keys['d'] ? 1 : 0) - (keys['arrowleft'] || keys['a'] ? 1 : 0);
    game.input.y = (keys['arrowdown'] || keys['s'] ? 1 : 0) - (keys['arrowup'] || keys['w'] ? 1 : 0);
  };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) || ['arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    keys[k] = true;
    updateAxis();
    if (game.modalPause) return;
    if (k === ' ' || k === 'p') {
      game.state.speed = game.state.speed === 0 ? 1 : 0;
    } else if (k === '1') game.state.speed = 0;
    else if (k === '2') game.state.speed = 1;
    else if (k === '3') game.state.speed = 3;
    else {
      // stage action hotkeys (E, C, G, T, N, M, B...)
      const act = getActions(game).find(a => a.key && a.key.toLowerCase() === k && !a.disabled);
      if (act) act.fn();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    updateAxis();
  });
}

// debug helpers for development/testing
window.BI.newGame = (seed) => newGame(seed);
window.BI.skipYears = (n) => {
  for (let i = 0; i < n; i++) {
    game.state.day += 1;
    game.state.hour = 8;
    perDay();
    if (playerAgent(game)?.flags.dead) break;
  }
};

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#e88;padding:20px">Failed to boot: ${err.stack || err}</pre>`;
});
