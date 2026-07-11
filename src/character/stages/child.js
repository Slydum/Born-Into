// Child (5-12): school with a real weekday schedule, truancy that flags the
// family, friendships and rivalries that carry forward, and grades that nudge
// (not gate) the future.
import { clamp, isSchoolDay } from '../../constants.js';
import { agentById, ageOf, householdOf, homeOf, gotoTile } from '../../agents/npc.js';
import { getBuilding } from '../../world/townGen.js';
import { dispatchSocialWorker } from '../../agents/parentAI.js';
import { playerStats, addStat } from '../stats.js';
import { logMsg, toast } from '../../ui/hud.js';

export const canMove = true;

export function enter(game) {
  logMsg(game, 'You are five. School starts — weekdays, 8:00 to 15:00. Skipping it gets noticed.', true);
  toast('Child: walk to school on weekdays (or face truancy). E to interact.');
}

export function update(game, dt) {
  const st = game.state;
  const pd = st.playerData;
  const p = agentById(st, st.playerId);

  // truancy check at noon on school days
  if (isSchoolDay(st.day) && st.hour >= 12 && pd.truancyCheckedDay !== st.day) {
    pd.truancyCheckedDay = st.day;
    if (p.inside !== 'school') {
      pd.truancy = (pd.truancy || 0) + 1;
      addStat(game, 'grades', -3);
      logMsg(game, `You skip school. (${pd.truancy} unexcused absences on file.)`, true);
      if (pd.truancy >= 3 && (st.flags.swCooldown || 0) <= st.simSec) {
        st.flags.swCooldown = st.simSec + 120;
        st.flags.familyFlagged = (st.flags.familyFlagged || 0) + 1;
        const hh = householdOf(st, p);
        dispatchSocialWorker(game, hh.id, 'truancy');
        pd.truancy = 0;
      }
    }
  }

  // wandering far from home alone gets you marched back if your parents are strict
  const home = homeOf(game, p);
  if (home && !p.inside && pd.scoldCool !== st.day) {
    const d = Math.hypot(p.x - home.door.x, p.y - home.door.y);
    const perm = maxParentTrait(game, 'impulsive'); // permissive-ish proxy
    const allowed = 14 + perm / 5;
    const school = getBuilding(st, 'school');
    const nearSchoolPath = Math.abs(p.x - school.door.x) < 6;
    if (d > allowed && !nearSchoolPath && game.rng.chance(0.02 * dt)) {
      pd.scoldCool = st.day;
      addStat(game, 'stressExp', 2);
      logMsg(game, 'Word gets home before you do. You are grounded for the evening.', true);
    }
  }
}

function maxParentTrait(game, key) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  let v = 40;
  for (const pid of p.parents) {
    const par = agentById(st, pid);
    if (par && !par.flags.dead) v = Math.max(v, par.traits[key] || 0);
  }
  return v;
}

export function actions(game) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const acts = [];
  if (isSchoolDay(st.day) && st.hour >= 7 && st.hour < 14 && p.inside !== 'school' && !p.carriedBy) {
    acts.push({
      label: 'Walk to school', key: 'G',
      fn: () => {
        const school = getBuilding(st, 'school');
        if (gotoTile(game, p, school.door.x, school.exit.y)) {
          p.autoSchool = true;
          logMsg(game, 'You head for school.');
        }
      },
    });
  }
  return acts;
}
