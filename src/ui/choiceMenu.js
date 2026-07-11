// Modal choice menu (events, death hand-off, branching decisions) and the
// side panel used inside civic buildings. The sim pauses while a modal is up.
import { getPanelInfo } from '../world/locations.js';

let game_ = null;
let queue = [];
let open = false;
let panelBuilding = null;
let savedSpeed = 1;

export function initChoiceUI(game) {
  game_ = game;
  game.ui = {
    showChoice, openPanel, closePanel, refreshPanel,
    isModalOpen: () => open,
    panelBuilding: () => panelBuilding,
  };
}

export function showChoice(spec) {
  queue.push(spec);
  if (!open) next();
}

function next() {
  const spec = queue.shift();
  if (!spec) { close(); return; }
  open = true;
  savedSpeed = game_.state.speed > 0 ? game_.state.speed : savedSpeed;
  game_.modalPause = true;
  const wrap = document.getElementById('modal-wrap');
  const modal = document.getElementById('modal');
  wrap.style.display = 'flex';
  modal.innerHTML = `<h2>${esc(spec.title)}</h2><p>${esc(spec.text || '')}</p>`;
  for (const opt of spec.options) {
    const b = document.createElement('button');
    b.className = 'opt';
    b.innerHTML = esc(opt.label) + (opt.sub ? `<span class="sub">${esc(opt.sub)}</span>` : '');
    b.onclick = () => {
      // run the handler first: it may push another modal onto the queue
      try { opt.fn && opt.fn(); } finally { next(); }
    };
    modal.appendChild(b);
  }
}

function close() {
  open = false;
  game_.modalPause = false;
  document.getElementById('modal-wrap').style.display = 'none';
}

// ------------------------------------------------------------ building panel
export function openPanel(building) {
  panelBuilding = building;
  refreshPanel();
}

export function refreshPanel() {
  const el = document.getElementById('panel');
  if (!panelBuilding) { el.style.display = 'none'; return; }
  const info = getPanelInfo(game_, panelBuilding);
  el.style.display = 'block';
  el.innerHTML = `<h3>${esc(info.title)}</h3><div class="desc">${esc(info.desc)}</div>`;
  for (const a of info.actions) {
    const b = document.createElement('button');
    b.className = 'abtn';
    b.textContent = a.label;
    b.disabled = !!a.disabled;
    b.onclick = () => { a.fn(); if (panelBuilding) refreshPanel(); };
    el.appendChild(b);
  }
}

export function closePanel() {
  panelBuilding = null;
  document.getElementById('panel').style.display = 'none';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
