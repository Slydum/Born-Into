// Teen (13-18): personality locks in, the job/college fork opens, romance
// (and its consequences) become possible, and rebellion has real odds.
import { clamp, isSchoolDay, MIN_WAGE } from '../../constants.js';
import * as child from './child.js';
import { agentById, ageOf, householdOf, homeOf, adultsHome } from '../../agents/npc.js';
import { getRel, adjustRel } from '../../agents/relationships.js';
import { playerStats, addStat } from '../stats.js';
import { checkReveals, traitMod, hasTrait } from '../traits.js';
import { logMsg, toast } from '../../ui/hud.js';
import { startPregnancy } from '../../family/pregnancy.js';
import { isNight } from '../../agents/schedule.js';

export const canMove = true;
export const update = child.update; // school/truancy rules still apply

export function enter(game) {
  checkReveals(game);
  const traits = game.state.playerData.traits
    .map(id => game.data.traits.find(t => t.id === id))
    .filter(Boolean).map(t => t.name).join(', ');
  logMsg(game, `You are thirteen. Who you are is mostly set now: ${traits || 'a blank slate, somehow'}.`, true);
  toast('Teen: at 14 you\'ll choose work or the college track. Romance, rebellion, and risk are all on the table.');
}

export function actions(game) {
  const st = game.state;
  const pd = st.playerData;
  const p = agentById(st, st.playerId);
  const acts = child.actions(game);

  // the fork: part-time work vs college track (choice offered at 14)
  if (!pd.education && ageOf(st, p) >= 14) {
    acts.push({
      label: 'Decide your path', key: 'T',
      fn: () => {
        game.ui.showChoice({
          title: 'The Fork',
          text: 'Everyone your age is sorting into lanes. Money now, or a shot at more later?',
          options: [
            {
              label: 'Part-time job at the grocery',
              sub: `$${MIN_WAGE}/h, hard-capped no matter how talented you are. Money starts now.`,
              fn: () => { pd.education = 'parttime'; logMsg(game, 'You take the grocery job. The apron itches.', true); },
            },
            {
              label: 'College track',
              sub: 'No income for years. Unlocks higher-tier careers later — if your grades hold.',
              fn: () => { pd.education = 'college'; logMsg(game, 'You sign up for the college track. The workload is real.', true); },
            },
          ],
        });
      },
    });
  }

  // rebellion: sneaking out at night
  if (isNight(st.hour) && !p.inside && pd.sneakDay !== st.day) {
    acts.push({
      label: 'Sneak out', key: 'N',
      fn: () => sneakOut(game),
    });
  }
  return acts;
}

function sneakOut(game) {
  const st = game.state;
  const pd = st.playerData;
  const p = agentById(st, st.playerId);
  pd.sneakDay = st.day;
  addStat(game, 'rebellion', 8 + traitMod(game, 'rebellionMod') / 5);

  const hh = householdOf(st, p);
  const parents = st.agents.filter(a => !a.flags.dead && a.householdId === hh.id && a.ai === 'parent');
  // whether you're caught depends on who your parents are: the strict notice,
  // the absent and checked-out never do
  let caught = false, catcher = null;
  for (const par of parents) {
    if (par.inside || par.activity.type === 'binge') continue; // not even home
    let pCatch = par.traits.patience / 300 + (par.activity.type === 'sleep' ? 0.05 : 0.25);
    if (par.flags.addiction) pCatch *= 0.3;
    if (game.rng.chance(pCatch)) { caught = true; catcher = par; break; }
  }
  if (caught) {
    addStat(game, 'stressExp', 5);
    adjustRel(st, p.id, catcher.id, -6);
    logMsg(game, `Halfway out the window — the light snaps on. ${catcher.name} was waiting up.`, true);
    return;
  }
  // out free: something happens
  const roll = game.rng.next();
  const riskBias = traitMod(game, 'riskMod') / 200;
  if (roll < 0.35 - riskBias) {
    addStat(game, 'social', 6);
    logMsg(game, 'A night of parking-lot philosophy with friends. Worth it.', true);
  } else if (roll < 0.6) {
    const date = findDate(game);
    if (date) {
      adjustRel(st, p.id, date.id, 10);
      st.playerData.flags.romanced = true;
      logMsg(game, `You spend half the night talking to ${date.name} under the water tower.`, true);
    } else {
      logMsg(game, 'You wander the empty town. It feels like it belongs to you.', true);
    }
  } else if (roll < 0.85 + riskBias) {
    addStat(game, 'rebellion', 6);
    if (game.rng.chance(0.3 + riskBias)) {
      addStat(game, 'addiction', 12);
      pd.flags.addictionSeed = true;
      logMsg(game, 'Someone has bottles. The night goes soft at the edges. You like it more than you should.', true);
    } else {
      logMsg(game, 'Older kids, a bonfire, questionable decisions narrowly avoided.', true);
    }
  } else {
    addStat(game, 'health', -game.rng.int(10, 30));
    pd.flags.tookBigRisks = true;
    logMsg(game, 'It goes wrong — a fence, a fall, a limp home before dawn.', true);
  }
}

function findDate(game) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const myAge = ageOf(st, p);
  const cands = st.agents.filter(a => !a.flags.dead && a.id !== p.id && !p.parents.includes(a.id) &&
    Math.abs(ageOf(st, a) - myAge) <= 4 && ageOf(st, a) >= 13 && ageOf(st, a) < 25);
  return cands.length ? game.rng.pick(cands) : null;
}

// A shared "romantic evening" outcome table, wired in main.js — teens risk
// pregnancy here, which spawns a real baby run by the same systems.
export function romanticEveningOutcome(game, partner) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  adjustRel(st, p.id, partner.id, 8);
  p.needs.mood = clamp(p.needs.mood + 15, 0, 100);
  logMsg(game, `An evening with ${partner.name}. The rest of the world goes quiet.`, true);
  const myAge = ageOf(st, p);
  if (game.rng.chance(myAge < 18 ? 0.18 : 0.10)) {
    const mother = p.sex === 'f' ? p : (partner.sex === 'f' ? partner : null);
    const father = p.sex === 'f' ? partner : p;
    if (mother) {
      startPregnancy(game, mother.id, father.id);
    }
  }
}
