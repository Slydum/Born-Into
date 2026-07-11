// Panel actions for civic (non-walkable-interior) buildings. Houses and the
// park have real walkable interiors; these use a menu instead.
import { MIN_WAGE, isSchoolDay, clamp } from '../constants.js';
import { agentById, householdOf, ageOf } from '../agents/npc.js';
import { addStat, playerStats } from '../character/stats.js';
import { logMsg } from '../ui/hud.js';
import { attendSchoolTick } from '../events/escalation.js';
import { adjustRel, getRel } from '../agents/relationships.js';
import { traitMod } from '../character/traits.js';

export function getPanelInfo(game, b) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const age = ageOf(st, p);
  const pd = st.playerData;
  const hh = householdOf(st, p);
  const actions = [];
  let desc = '';

  if (b.type === 'grocery') {
    desc = 'Fluorescent lights, squeaky carts, the smell of bread.';
    actions.push({
      label: `Buy groceries ($30)`,
      disabled: hh.money < 30,
      fn: () => { hh.money -= 30; hh.fridge = 100; logMsg(game, 'You stock the fridge.'); },
    });
    if (age >= 13 && age < 18 && pd.education === 'parttime') {
      const onShift = st.hour >= 16 && st.hour < 20;
      actions.push({
        label: onShift ? `Work shift (min wage $${MIN_WAGE}/h — hard cap)` : 'Shifts run 16:00–20:00',
        disabled: !onShift || pd.workedShiftDay === st.day,
        fn: () => {
          hh.money += MIN_WAGE * 4;
          pd.workedShiftDay = st.day;
          addStat(game, 'stressExp', 2);
          logMsg(game, `You bag groceries for four hours. +$${MIN_WAGE * 4}. No amount of talent raises teen wages.`);
        },
      });
    }
  } else if (b.type === 'school') {
    const inSession = isSchoolDay(st.day) && st.hour >= 8 && st.hour < 15;
    desc = inSession ? 'Hallways of noise and linoleum. Class is in session.' : 'The school is quiet outside of hours.';
    if (age >= 5 && age < 18 && inSession) {
      actions.push({
        label: 'Attend class',
        disabled: pd.attendedDay === st.day,
        fn: () => {
          pd.attendedDay = st.day;
          const boost = 3 + Math.round(traitBonus(game, 'academicMod') / 5);
          addStat(game, 'grades', boost);
          logMsg(game, 'You sit through class. Some of it even sticks.');
          attendSchoolTick(game);
        },
      });
      actions.push({
        label: 'Hang out between classes',
        disabled: pd.hungOutDay === st.day,
        fn: () => {
          pd.hungOutDay = st.day;
          addStat(game, 'social', 3 + Math.round(traitBonus(game, 'socialMod') / 6));
          befriendClassmate(game);
        },
      });
      if (age >= 13 && pd.education === 'college') {
        actions.push({
          label: 'Extra study (college track)',
          disabled: pd.studiedDay === st.day,
          fn: () => {
            pd.studiedDay = st.day;
            addStat(game, 'grades', 4);
            addStat(game, 'stressExp', 1);
            logMsg(game, 'You stay after for AP prep. The college track demands it.');
          },
        });
      }
    }
  } else if (b.type === 'office') {
    desc = 'Cubicles, burnt coffee, a plant that refuses to die.';
    workActions(game, b, actions);
  } else if (b.type === 'hospital') {
    desc = 'The waiting room chairs are bolted to the floor.';
    const s = playerStats(game);
    const cost = 50;
    actions.push({
      label: `Get treated ($${cost})`,
      disabled: hh.money < cost || s.health >= 90,
      fn: () => {
        hh.money -= cost;
        addStat(game, 'health', 25);
        logMsg(game, 'Stitched, salved, and sent home.');
      },
    });
    workActions(game, b, actions);
  } else if (b.type === 'services') {
    desc = 'Family Services. Case files stacked to the ceiling.';
    if (st.flags.familyFlagged > 0) {
      actions.push({ label: `Your family has ${st.flags.familyFlagged} flag(s) on file`, disabled: true, fn: () => {} });
    }
  }

  actions.push({ label: 'Leave', fn: () => leaveBuilding(game, b) });
  return { title: b.name, desc, actions };
}

function workActions(game, b, actions) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const pd = st.playerData;
  if (pd.job && pd.job.buildingId === b.id) {
    const onShift = isSchoolDay(st.day) && st.hour >= 9 && st.hour < 17;
    actions.push({
      label: onShift ? `Work (earning $${pd.job.wage}/h while inside)` : 'Shift runs weekdays 9:00–17:00',
      disabled: true,
      fn: () => {},
    });
  }
}

function befriendClassmate(game) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const kids = st.agents.filter(a => !a.flags.dead && a.id !== p.id && a.ai === 'kid' && Math.abs((st.day - a.birthDay) - (st.day - p.birthDay)) <= 3);
  if (!kids.length) { logMsg(game, 'You hang around the vending machines.'); return; }
  const k = game.rng.pick(kids);
  adjustRel(st, p.id, k.id, 6);
  const r = getRel(st, p.id, k.id);
  if (r.score >= 40 && !r.tags.friend) {
    r.tags.friend = true;
    logMsg(game, `${k.name} is officially your friend now.`, true);
  } else {
    logMsg(game, `You hang out with ${k.name}.`);
  }
}

export function leaveBuilding(game, b) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  p.inside = null;
  p.x = b.exit.x; p.y = b.exit.y;
  game.ui.closePanel();
}

function traitBonus(game, key) {
  return traitMod(game, key);
}
