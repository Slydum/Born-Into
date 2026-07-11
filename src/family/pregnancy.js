// Pregnancy and birth. New babies are full characters governed by the same
// baby/parent-agent systems — including when a teen player becomes a parent.
import { agentById, ageOf, householdOf, createAgent, genName, randomColors } from '../agents/npc.js';
import { getBuilding } from '../world/townGen.js';
import { furnitureIn } from '../world/houseGen.js';
import { recordBirth } from './familyTree.js';
import { logMsg, toast } from '../ui/hud.js';

export function startPregnancy(game, motherId, fatherId) {
  const st = game.state;
  if (st.pregnancies.some(p => p.motherId === motherId)) return;
  st.pregnancies.push({ motherId, fatherId, due: st.day + 1 });
  const mother = agentById(st, motherId);
  const isPlayerParty = motherId === st.playerId || fatherId === st.playerId;
  if (isPlayerParty) {
    const teen = ageOf(st, agentById(st, st.playerId)) < 18;
    toast(teen
      ? 'Two lines on the test. You are still a kid yourself, and now there will be another one.'
      : `${mother.name} is expecting.`);
    logMsg(game, teen ? 'A baby is coming. School, job, everything just got heavier.' : 'A baby is on the way.', true);
  }
}

export function dailyPregnancyTick(game) {
  const st = game.state;
  for (const preg of [...st.pregnancies]) {
    if (st.day < preg.due) continue;
    st.pregnancies = st.pregnancies.filter(p => p !== preg);
    birth(game, preg);
  }
}

function birth(game, preg) {
  const st = game.state;
  const mother = agentById(st, preg.motherId);
  if (!mother || mother.flags.dead) return;
  const father = preg.fatherId ? agentById(st, preg.fatherId) : null;
  const hh = householdOf(st, mother);
  if (!hh) return;
  const home = getBuilding(st, hh.houseId);
  const crib = home ? furnitureIn(home, 'crib')[0] : null;
  const sex = game.rng.chance(0.5) ? 'f' : 'm';
  const surname = mother.surname || (mother.name.split(' ')[1] || '');
  const baby = createAgent(st, {
    name: genName(game.rng, sex, surname),
    sex, surname,
    birthDay: st.day,
    householdId: hh.id,
    x: crib ? crib.x : mother.x, y: crib ? crib.y : mother.y,
    colors: { ...randomColors(game.rng), skin: game.rng.chance(0.7) ? mother.colors.skin : (father ? father.colors.skin : mother.colors.skin) },
    kidStats: { bonding: 20, stimulation: 10, stressExp: 5, curiosity: 10 },
    ai: 'none',
  });
  baby.careLevel = 85;
  recordBirth(st, baby, preg.motherId, preg.fatherId);

  const involvesPlayer = preg.motherId === st.playerId || preg.fatherId === st.playerId;
  if (involvesPlayer) {
    toast(`${baby.name} is born. One of your children could carry your story forward.`);
    logMsg(game, `${baby.name} is born.`, true);
  } else if (mother.householdId === agentById(st, st.playerId)?.householdId) {
    logMsg(game, `${baby.name} is born in your household.`, true);
  }
}
