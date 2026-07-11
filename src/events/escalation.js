// Bullying/rivalry escalation: ignored -> repeated -> physical -> serious.
// Outcomes lean on relationship stats and trait seeds — supported, resilient
// kids have more safety nets. Witnessed violence can pull in the school or
// the police, and police contact loops back onto the family's file.
import { agentById, ageOf, householdOf } from '../agents/npc.js';
import { getRel, adjustRel, relScore } from '../agents/relationships.js';
import { playerStats, addStat } from '../character/stats.js';
import { checkReveals, traitMod } from '../character/traits.js';
import { dispatchSocialWorker } from '../agents/parentAI.js';
import { logMsg } from '../ui/hud.js';

// called when the player attends class
export function attendSchoolTick(game) {
  const st = game.state;
  const esc = st.escalation;
  if (esc.cooldownDay && st.day < esc.cooldownDay) return;

  if (!esc.rivalId) {
    if (game.rng.chance(0.3)) {
      const p = agentById(st, st.playerId);
      const kids = st.agents.filter(a => !a.flags.dead && a.ai === 'kid' && a.id !== p.id &&
        Math.abs(ageOf(st, a) - ageOf(st, p)) <= 4 && relScore(st, p.id, a.id) < 30);
      if (kids.length) {
        esc.rivalId = game.rng.pick(kids).id;
        esc.level = 0;
      }
    }
    return;
  }
  const rival = agentById(st, esc.rivalId);
  if (!rival || rival.flags.dead || ageOf(st, rival) >= 18) { esc.rivalId = null; return; }
  if (!game.rng.chance(0.5)) return;
  escalationEvent(game, rival);
}

function support(game) {
  // your safety net: best friendship + resilience traits
  const st = game.state;
  const p = agentById(st, st.playerId);
  let bestFriend = 0;
  for (const a of st.agents) {
    if (a.flags.dead || a.id === p.id) continue;
    const r = getRel(st, p.id, a.id);
    if (r.tags.friend) bestFriend = Math.max(bestFriend, r.score);
  }
  return bestFriend / 2 + traitMod(game, 'resilience');
}

function escalationEvent(game, rival) {
  const st = game.state;
  const esc = st.escalation;
  const sup = support(game);
  const lvl = esc.level;

  if (lvl === 0) {
    game.ui.showChoice({
      title: 'A Shove in the Hallway',
      text: `${rival.name} knocks your books down and calls it an accident. People saw.`,
      options: [
        { label: 'Ignore it', fn: () => { esc.level = 1; addStat(game, 'stressExp', 3); logMsg(game, 'You let it go. It does not let you go.', true); } },
        { label: 'Say something back', fn: () => {
            if (game.rng.chance(0.4 + sup / 150)) { deescalate(game, 'Your comeback lands. Even their friends laugh. It ends there.'); }
            else { esc.level = 1; adjustRel(st, st.playerId, rival.id, -8); logMsg(game, 'It comes out wrong. Now it\'s a thing.', true); }
          } },
        { label: 'Tell a teacher', fn: () => {
            if (game.rng.chance(0.5)) deescalate(game, 'The teacher actually handles it. Small mercies.');
            else { esc.level = 1; addStat(game, 'social', -3); logMsg(game, 'The teacher shrugs. Word gets around that you told.', true); }
          } },
      ],
    });
  } else if (lvl === 1) {
    st.playerData.flags.wasBullied = true;
    game.ui.showChoice({
      title: 'It Keeps Happening',
      text: `${rival.name} has made you a hobby now. Lunch money, shoved lockers, the works.`,
      options: [
        { label: 'Keep your head down', fn: () => { esc.level = 2; addStat(game, 'stressExp', 5); addStat(game, 'social', -2); logMsg(game, 'Every day a little smaller.', true); } },
        { label: 'Get your friends to back you up', fn: () => {
            if (game.rng.chance(0.3 + sup / 100)) deescalate(game, 'You stop walking alone. The whole thing starves without an audience.');
            else { esc.level = 2; logMsg(game, 'Your friends are suddenly busy. It gets worse.', true); }
          } },
        { label: 'Report it formally', fn: () => {
            if (game.rng.chance(0.55)) deescalate(game, 'The school calls both families in. It ends, officially at least.');
            else { esc.level = 2; logMsg(game, 'A stern assembly about kindness. Nothing changes.', true); }
          } },
      ],
    });
  } else {
    // physical: a real fight, with real stakes
    game.ui.showChoice({
      title: 'Behind the Gym',
      text: `${rival.name} swings first. There is no walking away from this one.`,
      options: [
        { label: 'Fight back', fn: () => fight(game, rival, true) },
        { label: 'Cover up and take it', fn: () => fight(game, rival, false) },
      ],
    });
  }
}

function fight(game, rival, fought) {
  const st = game.state;
  const esc = st.escalation;
  const sup = support(game);
  const winP = fought ? 0.35 + sup / 120 + traitMod(game, 'riskMod') / 150 : 0.05;
  const witnessed = game.rng.chance(0.5);

  if (game.rng.chance(winP)) {
    st.playerData.flags.wonFight = true;
    addStat(game, 'health', -game.rng.int(3, 10));
    addStat(game, 'social', 6);
    logMsg(game, `It's ugly, but ${rival.name} comes off worse. Nobody bothers you after that.`, true);
    deescalate(game, null);
  } else {
    const dmg = game.rng.int(10, esc.level >= 3 ? 45 : 25);
    addStat(game, 'health', -dmg);
    addStat(game, 'stressExp', 6);
    st.playerData.flags.survivedHardship = true;
    if (dmg >= 35) st.playerData.flags.seriousInjury = true;
    logMsg(game, dmg >= 35
      ? 'You wake up in the nurse\'s office and then the hospital. This was serious.'
      : 'You lose, and it costs you.', true);
    esc.level = Math.min(3, esc.level + 1);
  }

  if (witnessed) {
    if (game.rng.chance(0.5)) {
      logMsg(game, 'A teacher saw the whole thing. Both families get called in; it\'s over.', true);
      deescalate(game, null);
    } else {
      logMsg(game, 'Someone called the police. An officer takes names — including your family\'s.', true);
      st.playerData.flags.policeContact = true;
      st.flags.familyFlagged = (st.flags.familyFlagged || 0) + 1;
      deescalate(game, null);
    }
  }
  checkReveals(game);
}

function deescalate(game, msg) {
  const st = game.state;
  st.escalation.level = 0;
  st.escalation.rivalId = null;
  st.escalation.cooldownDay = st.day + 2;
  if (msg) logMsg(game, msg, true);
  checkReveals(game);
}
