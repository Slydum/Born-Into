// Baby (0-2): fully passive. You go where you're taken — or you don't.
// One verb: cry. Care is driven entirely by your rolled parents' state, and
// neglect is a live possibility, not a script.
import { clamp } from '../../constants.js';
import { agentById, ageOf, householdOf, adultsHome, homeOf, gotoAdjacent } from '../../agents/npc.js';
import { dispatchSocialWorker } from '../../agents/parentAI.js';
import { playerStats, addStat } from '../stats.js';
import { logMsg, toast } from '../../ui/hud.js';

export const canMove = false;

export function enter(game, prev) {
  if (!prev) logMsg(game, 'You are born. The ceiling is very interesting.', true);
}

export function update(game, dt) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const hh = householdOf(st, p);
  const s = playerStats(game);

  // care decays; faster when nobody is home with you. p.careLevel is the
  // source of truth (parents' tending raises it directly); s.care mirrors it.
  const adults = hh ? adultsHome(game, hh) : [];
  const watched = p.carriedBy || adults.length > 0;
  const decay = watched ? 0.20 : 0.55;
  p.careLevel = clamp(p.careLevel - decay * dt, 0, 100);
  s.care = p.careLevel;

  // passive seeds
  if (p.carriedBy) {
    const carrier = agentById(st, p.carriedBy);
    if (carrier && !carrier.inside) addStat(game, 'stimulation', 0.06 * dt);
  }
  if (s.care < 30) addStat(game, 'stressExp', 0.05 * dt);
  if (s.care > 70 && watched) addStat(game, 'bonding', 0.025 * dt);

  // real-time neglect timer -> social services
  const pd = st.playerData;
  if (s.care < 15) {
    pd.neglectTimer = (pd.neglectTimer || 0) + dt;
    if (pd.neglectTimer > 8 && !pd.neglectWarned) {
      pd.neglectWarned = true;
      logMsg(game, 'You are hungry, wet, and alone. Someone at the clinic makes a phone call.', true);
    }
    if (pd.neglectTimer > 22 && (st.flags.swCooldown || 0) <= st.simSec) {
      st.flags.swCooldown = st.simSec + 90;
      dispatchSocialWorker(game, hh.id, 'neglect');
    }
  } else if (pd.neglectTimer) {
    pd.neglectTimer = Math.max(0, pd.neglectTimer - dt * 0.5);
    if (pd.neglectTimer === 0) pd.neglectWarned = false;
  }
}

export function actions(game) {
  const st = game.state;
  const pd = st.playerData;
  return [{
    label: 'Cry',
    key: 'C',
    disabled: (pd.cryCool || 0) > st.simSec,
    fn: () => cry(game),
  }];
}

function cry(game) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  const pd = st.playerData;
  pd.cryCool = st.simSec + 8;
  p.crying = true;
  p.cryStarted = st.simSec;
  setTimeoutSim(game, 6, () => { p.crying = false; });

  // each living parent rolls to respond, gated by their current state —
  // a real but never guaranteed chance
  const hh = householdOf(st, p);
  const parents = st.agents.filter(a => !a.flags.dead && a.householdId === hh.id && a.ai === 'parent');
  let responder = null;
  for (const par of parents) {
    const score = par.traits.patience * 0.5 + par.traits.warmth * 0.35 - par.needs.stress * 0.5 + game.rng.range(0, 30);
    if (score > 25 && (!responder || score > responder.score)) responder = { par, score };
  }
  if (responder) {
    const par = responder.par;
    if (par.inside) {
      logMsg(game, `You wail. ${par.name} is out — nobody comes.`, true);
      addStat(game, 'stressExp', 3);
    } else {
      par.activity = { type: 'goTend', until: 0, target: p.id };
      par.path = null;
      gotoAdjacent(game, par, Math.round(p.x), Math.round(p.y));
      logMsg(game, `You wail. Footsteps — ${par.name} is coming.`);
    }
  } else {
    logMsg(game, 'You wail into the empty air. Nobody comes.', true);
    addStat(game, 'stressExp', 4);
    addStat(game, 'bonding', -1);
  }
}

// tiny helper: schedule a callback in sim-seconds using the game's timer list
function setTimeoutSim(game, sec, fn) {
  game.simTimers.push({ at: game.state.simSec + sec, fn });
}
