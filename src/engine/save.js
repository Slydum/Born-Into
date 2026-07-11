// localStorage save/load. All simulation state lives in game.state as plain
// JSON-serializable data, so persistence is a straight stringify.
const KEY = 'bornInto.save.v1';

export function saveGame(game) {
  try {
    game.state.rngState = game.rng.state();
    localStorage.setItem(KEY, JSON.stringify(game.state));
  } catch (e) {
    console.warn('save failed', e);
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const st = JSON.parse(raw);
    if (!st || st.version !== 1) return null;
    return st;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(KEY);
}
