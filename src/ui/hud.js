// DOM HUD: stat bars, stage/clock/money readout, action buttons, message log.
import { fmtHour, stageForAge, clamp } from '../constants.js';
import { agentById, ageOf, householdOf } from '../agents/npc.js';
import { playerStats } from '../character/stats.js';
import { getActions } from '../character/player.js';

let els = {};
let toastTimer = null;

export function initHud() {
  els = {
    top: document.getElementById('topbar'),
    stats: document.getElementById('stats'),
    log: document.getElementById('log'),
    actions: document.getElementById('actions'),
    hint: document.getElementById('hint'),
    toast: document.getElementById('toast'),
  };
}

export function logMsg(game, text, hot = false) {
  game.state.log.push({ day: game.state.day, text, hot: !!hot });
  if (game.state.log.length > 60) game.state.log.splice(0, game.state.log.length - 60);
}

export function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 5200);
}

const STAGE_BARS = {
  baby:    [['care', 'Care', '#6fbf73'], ['bonding', 'Bonding', '#e07a95'], ['stimulation', 'Stimulation', '#6f9fbf'], ['stressExp', 'Stress', '#d05555']],
  toddler: [['care', 'Care', '#6fbf73'], ['curiosity', 'Curiosity', '#e8b04b'], ['stimulation', 'Stimulation', '#6f9fbf'], ['stressExp', 'Stress', '#d05555'], ['health', 'Health', '#6fbf73']],
  child:   [['grades', 'Grades', '#e8b04b'], ['social', 'Social', '#6f9fbf'], ['stressExp', 'Stress', '#d05555'], ['health', 'Health', '#6fbf73']],
  teen:    [['grades', 'Grades', '#e8b04b'], ['social', 'Social', '#6f9fbf'], ['rebellion', 'Rebellion', '#c98a3a'], ['addiction', 'Addiction', '#a04a72'], ['health', 'Health', '#6fbf73']],
  adult:   [['health', 'Health', '#6fbf73']],
  elder:   [['health', 'Health', '#6fbf73']],
};

export function updateHud(game) {
  const st = game.state;
  const p = agentById(st, st.playerId);
  if (!p) return;
  const age = ageOf(st, p);
  const stage = stageForAge(age);
  const hh = householdOf(st, p);
  const s = playerStats(game);

  // top bar
  els.top.innerHTML = `
    <b>${p.name}</b>
    <span>Gen ${st.flags.generation} · ${stage.label}, age ${age}</span>
    <span>${st.town.name} · Year ${st.day} · ${fmtHour(st.hour)} ${dayLabel(st.day)}</span>
    <span>$${hh ? Math.round(hh.money) : 0} · Fridge ${hh ? Math.round(hh.fridge) : 0}%</span>
    ${st.flags.familyFlagged ? `<span style="color:var(--bad)">⚑ family flagged ×${st.flags.familyFlagged}</span>` : ''}
    <span style="flex:1"></span>
    <span class="spd ${st.speed === 0 ? 'on' : ''}" data-spd="0">❚❚</span>
    <span class="spd ${st.speed === 1 ? 'on' : ''}" data-spd="1">▶</span>
    <span class="spd ${st.speed === 3 ? 'on' : ''}" data-spd="3">▶▶▶</span>`;
  for (const el of els.top.querySelectorAll('.spd')) {
    el.onclick = () => { st.speed = +el.dataset.spd; };
  }

  // stat bars
  const bars = STAGE_BARS[st.playerData.stage] || STAGE_BARS.adult;
  let html = '';
  for (const [key, label, color] of bars) {
    const v = clamp(Math.round(s[key] ?? 0), 0, 100);
    html += `<div class="bar"><div class="lbl"><span>${label}</span><span>${v}</span></div>
      <div class="tr"><div class="fl" style="width:${v}%;background:${color}"></div></div></div>`;
  }
  if (st.playerData.stage === 'adult' || st.playerData.stage === 'elder' || st.playerData.stage === 'teen') {
    const n = p.needs;
    for (const [key, label, color] of [['energy', 'Energy', '#6f9fbf'], ['stress', 'Stress', '#d05555'], ['mood', 'Mood', '#e8b04b']]) {
      const v = Math.round(n[key]);
      html += `<div class="bar"><div class="lbl"><span>${label}</span><span>${v}</span></div>
        <div class="tr"><div class="fl" style="width:${v}%;background:${color}"></div></div></div>`;
    }
  }
  // traits
  const tdefs = st.playerData.traits.map(id => game.data.traits.find(t => t.id === id)).filter(Boolean);
  if (tdefs.length) {
    html += `<div id="traits">${tdefs.map(t => `<span class="t ${t.polarity}" title="${t.desc}">${t.name}</span>`).join('')}</div>`;
  }
  els.stats.innerHTML = html;

  // log
  const entries = st.log.slice(-7);
  els.log.innerHTML = entries.map(e => `<div class="${e.hot ? 'hot' : ''}">Y${e.day} · ${e.text}</div>`).join('');

  // actions
  const acts = getActions(game);
  els.actions.innerHTML = '';
  for (const a of acts) {
    const b = document.createElement('button');
    b.className = 'abtn';
    b.innerHTML = a.key ? `<span class="k">[${a.key}]</span> ${a.label}` : a.label;
    b.disabled = !!a.disabled;
    b.onclick = a.fn;
    els.actions.appendChild(b);
  }

  els.hint.textContent = hintFor(game, stage.id, p);
}

function hintFor(game, stageId, p) {
  if (p.carriedBy) {
    const c = agentById(game.state, p.carriedBy);
    return c ? `${c.name} is carrying you.` : '';
  }
  switch (stageId) {
    case 'baby': return 'You are a baby. Cry, and hope someone comes.';
    case 'toddler': return 'WASD/arrows to toddle. E to poke at things. The house has teeth.';
    case 'child': return 'School is weekdays 8–15. E to interact, G to walk to school.';
    case 'teen': return 'Choose your path, mind your grades — or don\'t.';
    default: return 'Build the life your kids will be born into.';
  }
}

function dayLabel(day) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][((day % 7) + 7) % 7];
}
