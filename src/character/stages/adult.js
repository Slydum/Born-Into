// Adult (18+): full agency. Career tied to the teen-era education fork,
// housing on the same wealth-tier system your parents rolled, marriage,
// parenthood. The "parent-agent brain" (needs/stress/schedule) now runs on
// YOUR character — when the generational hand-off comes, adult players
// become NPC parents driven by parentAI with no state conversion needed.
// (Refactor note: this module and agents/parentAI.js intentionally share
// shapes and should eventually converge into one behavior module.)
import { clamp, isSchoolDay } from '../../constants.js';
import { agentById, ageOf, householdOf, homeOf, decayNeeds, gotoTile } from '../../agents/npc.js';
import { getBuilding, vacantHouses } from '../../world/townGen.js';
import { getRel } from '../../agents/relationships.js';
import { playerStats, addStat } from '../stats.js';
import { traitMod } from '../traits.js';
import { logMsg, toast } from '../../ui/hud.js';
import { startPregnancy } from '../../family/pregnancy.js';
import { neededFurniture, findFreeSpot, addFurniture, FURNITURE_COST, furnitureLabel } from '../../world/furnish.js';

export const canMove = true;

export function enter(game, prev) {
  const st = game.state;
  const pd = st.playerData;
  if (prev === 'teen' || !pd.job) {
    game.assignCareer();
  }
  toast('Adult: work your job (walk in during hours), find a place, build a life. Your kids will inherit all of it.');
}

export function update(game, dt) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  // the parent-agent brain: same needs decay every NPC runs
  decayNeeds(game, p, dt);

  // stress accumulates into long-term health
  if (p.needs.stress > 80 && game.rng.chance(0.01 * dt)) addStat(game, 'health', -1);

  // your own small children pull on you exactly like you once pulled on
  // your parents — their care matters to social services too
  const s = playerStats(game);
  s.care = 100; // nobody is grading your care level anymore; your kids have their own
}

export function actions(game) {
  const st = game.state;
  const pd = st.playerData;
  const p = agentById(st, st.playerId);
  const hh = householdOf(st, p);
  const acts = [];

  if (pd.job && isSchoolDay(st.day) && st.hour >= 7 && st.hour < 16 && !p.inside) {
    acts.push({
      label: `Go to work (${pd.job.title}, $${pd.job.wage}/h)`, key: 'G',
      fn: () => {
        const b = getBuilding(st, pd.job.buildingId);
        gotoTile(game, p, b.door.x, b.exit.y);
      },
    });
  }

  // move house: same wealth-tier templates your parents rolled
  const affordable = vacantHouses(st).filter(h => h.tier <= incomeTier(game) && hh && hh.money >= movePrice(h.tier));
  if (affordable.length && !pd.movedDay) {
    acts.push({
      label: 'Find your own place', key: 'M',
      fn: () => {
        game.ui.showChoice({
          title: 'Moving Out',
          text: 'The listings page is short in a town this size.',
          options: affordable.map(h => ({
            label: `${h.name} (tier ${h.tier}) — $${movePrice(h.tier)}`,
            fn: () => game.moveHousehold(h),
          })).concat([{ label: 'Stay put', fn: () => {} }]),
        });
      },
    });
  }

  // try for a baby with a live-in partner
  const partner = st.agents.find(a => !a.flags.dead && a.id !== p.id && a.householdId === p.householdId &&
    getRel(st, p.id, a.id).tags.partner);
  if (partner && st.pregnancies.every(pr => pr.motherId !== p.id && pr.motherId !== partner.id)) {
    acts.push({
      label: `Try for a baby with ${partner.name}`, key: 'B',
      fn: () => {
        if (game.rng.chance(0.5)) {
          const mother = p.sex === 'f' ? p : partner;
          const father = mother === p ? partner : p;
          startPregnancy(game, mother.id, father.id);
        } else {
          logMsg(game, 'Not this time. You hold each other anyway.');
        }
      },
    });
  }

  // furnish the house for your own kids, or fix it up when there's spare
  // money — the same thing any parent household does automatically, but
  // you get to choose when.
  const home = homeOf(game, p);
  if (home && hh) {
    for (const type of neededFurniture(game, home, hh)) {
      const cost = FURNITURE_COST[type];
      acts.push({
        label: `${type === 'kidbed' ? 'Buy a bed for the kids' : 'Redecorate — add a bookshelf'} ($${cost})`,
        disabled: hh.money < cost,
        fn: () => {
          const spot = findFreeSpot(game, home);
          if (!spot) { logMsg(game, "There's no room left to put it."); return; }
          hh.money -= cost;
          addFurniture(game, home, type, spot);
          logMsg(game, type === 'kidbed'
            ? 'You buy a proper bed for the kids.'
            : `You bring home ${furnitureLabel(type)}. The house looks better for it.`, true);
        },
      });
    }
  }
  return acts;
}

export function incomeTier(game) {
  const pd = game.state.playerData;
  if (!pd.job) return 0;
  return pd.job.tier;
}

function movePrice(tier) {
  return [150, 400, 900][tier] || 150;
}

// Career assignment: education path chosen as a teen dominates, grades and a
// record nudge the odds — probabilistic, not a hard gate (except the teen
// wage cap, which was absolute by design).
export function pickCareer(game) {
  const st = game.state;
  const pd = st.playerData;
  const s = playerStats(game);
  const gradeRoll = s.grades + traitMod(game, 'academicMod') + game.rng.int(-15, 15);
  const record = pd.flags.record || pd.flags.policeContact;

  if (pd.education === 'college') {
    if (gradeRoll >= 75 && !record) return { title: 'Physician', buildingId: 'hospital', wage: 34, tier: 2 };
    if (gradeRoll >= 45) return { title: 'Analyst', buildingId: 'office', wage: 22, tier: record ? 1 : 2 };
    return { title: 'Office Clerk', buildingId: 'office', wage: 14, tier: 1 };
  }
  if (pd.education === 'parttime') {
    if (gradeRoll >= 70 && !record) return { title: 'Shift Manager', buildingId: 'grocery', wage: 15, tier: 1 };
    return { title: 'Store Clerk', buildingId: 'grocery', wage: 10, tier: record ? 0 : 1 };
  }
  return { title: 'Odd Jobs', buildingId: 'grocery', wage: 8, tier: 0 };
}
