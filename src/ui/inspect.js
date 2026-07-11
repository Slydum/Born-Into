// Click-to-inspect: tap yourself or anyone nearby to see who they are —
// parents' rolled traits included, since you're born into them blind
// otherwise.
import { ageOf } from '../agents/npc.js';
import { relScore } from '../agents/relationships.js';
import { getBuilding } from '../world/townGen.js';
import { playerAgent } from '../character/player.js';

function levelWord(v) {
  return v >= 75 ? 'Very high' : v >= 55 ? 'High' : v >= 35 ? 'Moderate' : v >= 15 ? 'Low' : 'Very low';
}

function traitLines(t) {
  return [
    `Patience: ${levelWord(t.patience)} (${Math.round(t.patience)})`,
    `Warmth: ${levelWord(t.warmth)} (${Math.round(t.warmth)})`,
    `Impulsiveness: ${levelWord(t.impulsive)} (${Math.round(t.impulsive)})`,
    `Work ethic: ${levelWord(t.workEthic)} (${Math.round(t.workEthic)})`,
  ];
}

function moodLine(a) {
  if (!a.needs) return null;
  if (a.needs.stress > 60) return 'They look frayed.';
  if (a.needs.mood > 60) return 'They seem in good spirits.';
  return 'They seem tired.';
}

export function showAgentInfo(game, a) {
  const st = game.state;
  const p = playerAgent(game);
  const age = ageOf(st, a);
  const rel = a.id === p.id ? null : relScore(st, p.id, a.id);

  const role = p.parents.includes(a.id) ? (a.sex === 'f' ? 'Your mother.' : 'Your father.')
    : p.children.includes(a.id) ? 'Your child.'
    : null;

  const lines = [`Age ${age}.`];
  if (role) lines.push(role);
  if (rel !== null) lines.push(`Relationship: ${Math.round(rel)}`);
  const mood = moodLine(a);
  if (mood) lines.push(mood);
  if (a.work) {
    const b = getBuilding(st, a.work.buildingId);
    lines.push(`Works at ${b ? b.name : 'a job'} — $${a.work.wage}/h.`);
  }
  lines.push('');
  lines.push('Personality:');
  lines.push(...traitLines(a.traits));

  game.ui.showChoice({
    title: a.name,
    text: lines.join('\n'),
    options: [{ label: 'Close', fn: () => {} }],
  });
}

export function showSelfInfo(game) {
  const st = game.state;
  const p = playerAgent(game);
  const age = ageOf(st, p);
  const tdefs = st.playerData.traits.map(id => game.data.traits.find(t => t.id === id)).filter(Boolean);

  const lines = [`Age ${age}, ${st.playerData.stage}.`, ''];
  if (tdefs.length) {
    lines.push('Traits life has revealed in you:');
    for (const t of tdefs) lines.push(`• ${t.name} — ${t.desc}`);
  } else {
    lines.push('Nothing about you has been revealed yet — traits surface as your life goes on.');
  }

  game.ui.showChoice({
    title: p.name,
    text: lines.join('\n'),
    options: [{ label: 'Close', fn: () => {} }],
  });
}
