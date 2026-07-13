// ===== Cloud sync: pull + MERGE + push (multi-device safe) =====
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbzJKyOaUKRnoEOzJz0enJF9jqSugzaWLTukl-IpJA44uhFLzON3GeK6fdLizl2XzUZz/exec';

let syncTimer = null, syncing = false;

function backendUrl() {
  // en desarrollo local no tocar el backend real (evita contaminar el respaldo)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return DB.settings.backendUrl || '';
  }
  return DB.settings.backendUrl || (SYNC_URL.indexOf('http') === 0 ? SYNC_URL : '');
}

// tombstones: recuerdan lo borrado para que la fusión no lo resucite
function tomb(key) {
  DB.tombstones = DB.tombstones || [];
  DB.tombstones.push(key);
  if (DB.tombstones.length > 800) DB.tombstones = DB.tombstones.slice(-800);
}

function scheduleSync() {
  if (!backendUrl()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushOnly, 8000); // subir cambios 8s después del último
}

async function pushOnly() {
  const url = backendUrl();
  if (!url || syncing || !navigator.onLine) return false;
  syncing = true;
  let ok = false;
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'sync', db: DB })
    });
    ok = (await res.json()).ok;
    if (ok) markSynced();
  } catch (e) { /* sin internet: reintenta con el próximo cambio */ }
  syncing = false;
  return ok;
}

// ciclo completo: bajar nube → fusionar → subir resultado
async function fullSync() {
  const url = backendUrl();
  if (!url || syncing || !navigator.onLine) return false;
  syncing = true;
  let ok = false;
  try {
    const res = await fetch(url + '?action=restore');
    const out = await res.json();
    if (out.ok && out.db) {
      mergeRemote(out.db);
      localStorage.setItem(STORE_KEY, JSON.stringify(DB)); // guardar sin re-agendar push
    }
    const res2 = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'sync', db: DB })
    });
    ok = (await res2.json()).ok;
    if (ok) markSynced();
  } catch (e) {}
  syncing = false;
  return ok;
}

function markSynced() {
  localStorage.setItem('agenda_last_sync', new Date().toISOString());
  const el = document.getElementById('sync-state');
  if (el) el.textContent = syncStateText();
}

// ---------- motor de fusión ----------
// Habitos/categorías/metas se casan por NOMBRE (cada dispositivo generó sus
// propios ids al sembrarse); tareas/eventos/etc. por id. done gana sobre no-done.
const lowKey = s => String(s || '').trim().toLowerCase();

function mergeRemote(r) {
  if (!r || !r.trackers) return;
  const tombs = new Set([...(DB.tombstones || []), ...(r.tombstones || [])]);
  DB.tombstones = Array.from(tombs).slice(-800);
  const dead = k => tombs.has(k);

  // --- categorías y hábitos por nombre + mapa de ids remotos → locales ---
  const idMap = {};
  const mergeNamed = (localArr, remoteArr, prefix, onBoth) => {
    const byName = new Map(localArr.map(x => [lowKey(x.name || x.title), x]));
    (remoteArr || []).forEach(rx => {
      const k = prefix + lowKey(rx.name || rx.title);
      if (dead(k)) return;
      const lx = byName.get(lowKey(rx.name || rx.title));
      if (!lx) { localArr.push(rx); byName.set(lowKey(rx.name || rx.title), rx); idMap[rx.id] = rx.id; }
      else { idMap[rx.id] = lx.id; if (onBoth) onBoth(lx, rx); }
    });
    return localArr.filter(x => !dead(prefix + lowKey(x.name || x.title)));
  };

  DB.categories = mergeNamed(DB.categories || [], r.categories, 'cat:');
  DB.habits = mergeNamed(DB.habits || [], r.habits, 'hab:');

  // --- metas por título; hitos y pasos por título dentro de su meta ---
  DB.goals = mergeNamed(DB.goals || [], r.goals, 'goal:', (lg, rg) => {
    lg.done = lg.done || rg.done;
    if ((rg.count || 0) > (lg.count || 0)) lg.count = rg.count;
    const msByName = new Map((lg.milestones || []).map(m => [lowKey(m.title) + '|' + m.quarter, m]));
    (rg.milestones || []).forEach(rm => {
      const mk = 'ms:' + lowKey(lg.title) + ':' + lowKey(rm.title);
      if (dead(mk)) return;
      const lm = msByName.get(lowKey(rm.title) + '|' + rm.quarter);
      if (!lm) { lg.milestones.push(rm); return; }
      lm.done = lm.done || rm.done;
      const stByName = new Map((lm.steps || []).map(s => [lowKey(s.title), s]));
      (rm.steps || []).forEach(rs => {
        const sk = 'st:' + lowKey(lg.title) + ':' + lowKey(rs.title);
        if (dead(sk)) return;
        const ls = stByName.get(lowKey(rs.title));
        if (!ls) (lm.steps || (lm.steps = [])).push(rs);
        else ls.done = ls.done || rs.done;
      });
    });
    lg.milestones = (lg.milestones || []).filter(m => !dead('ms:' + lowKey(lg.title) + ':' + lowKey(m.title)));
  });

  // --- tareas: por id dentro de cada fecha (remapea categoría remota) ---
  for (const d in (r.tasks || {})) {
    const loc = DB.tasks[d] || (DB.tasks[d] = []);
    const ids = new Set(loc.map(t => t.id));
    r.tasks[d].forEach(rt => {
      if (dead('task:' + d + ':' + rt.id)) return;
      if (rt.cat && idMap[rt.cat]) rt.cat = idMap[rt.cat];
      if (!ids.has(rt.id)) loc.push(rt);
      else { const lt = loc.find(t => t.id === rt.id); lt.done = lt.done || rt.done; }
    });
  }
  for (const d in DB.tasks) {
    DB.tasks[d] = DB.tasks[d].filter(t => !dead('task:' + d + ':' + t.id));
    if (!DB.tasks[d].length) delete DB.tasks[d];
  }

  // --- habitLog: unión por día (remapeando ids de hábitos remotos) ---
  for (const d in (r.habitLog || {})) {
    const loc = DB.habitLog[d] || (DB.habitLog[d] = []);
    r.habitLog[d].forEach(hid => {
      const mapped = idMap[hid] || hid;
      if (!loc.includes(mapped)) loc.push(mapped);
    });
  }

  // --- trackers: días que faltan localmente se toman de la nube ---
  for (const trk in (r.trackers || {})) {
    DB.trackers[trk] = DB.trackers[trk] || {};
    for (const d in r.trackers[trk]) {
      if (DB.trackers[trk][d] === undefined) DB.trackers[trk][d] = r.trackers[trk][d];
    }
  }

  // --- eventos y medidas corporales por id ---
  const mergeById = (localArr, remoteArr, prefix) => {
    const ids = new Set(localArr.map(x => x.id));
    (remoteArr || []).forEach(rx => {
      if (!dead(prefix + rx.id) && !ids.has(rx.id)) localArr.push(rx);
    });
    return localArr.filter(x => !dead(prefix + x.id));
  };
  DB.events = mergeById(DB.events || [], r.events, 'ev:');
  DB.body = mergeById(DB.body || [], r.body, 'body:');

  // --- highlights por mes ---
  for (const mk in (r.highlights || {})) {
    DB.highlights[mk] = mergeById(DB.highlights[mk] || (DB.highlights[mk] = []), r.highlights[mk], 'hl:' + mk + ':');
  }

  // --- notas, revisiones, rituales: se toma lo que falte localmente ---
  for (const k in (r.weekNotes || {})) if (!DB.weekNotes[k]) DB.weekNotes[k] = r.weekNotes[k];
  for (const k in (r.reviews || {})) if (!DB.reviews[k]) DB.reviews[k] = r.reviews[k];
  for (const k in (r.ritual || {})) if (!DB.ritual[k]) DB.ritual[k] = r.ritual[k];
  DB.celebrated = Object.assign({}, r.celebrated || {}, DB.celebrated || {});
}

function syncStateText() {
  const ts = localStorage.getItem('agenda_last_sync');
  if (!ts) return t('sync.never');
  const d = new Date(ts);
  return t('sync.last') + ' ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
}

// celebraciones instantáneas por WhatsApp (con dedupe local)
const STREAK_MILESTONES = [7, 30, 50, 100, 200, 365];

function celebrate(kind, key, title, extra) {
  DB.celebrated = DB.celebrated || {};
  const k = kind + ':' + key;
  if (DB.celebrated[k]) return;
  DB.celebrated[k] = true;
  saveDB();
  const url = backendUrl();
  if (!url || !navigator.onLine) return;
  fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'celebrate', kind, title, extra: extra || '' })
  }).catch(() => {});
}

function checkStreakCelebration(habitId) {
  const h = DB.habits.find(x => x.id === habitId);
  if (!h) return;
  const st = habitStreak(habitId);
  if (STREAK_MILESTONES.includes(st)) celebrate('streak', habitId + ':' + st, h.name, st);
}

async function restoreFromCloud() {
  const url = backendUrl();
  if (!url) return;
  try {
    const res = await fetch(url + '?action=restore');
    const out = await res.json();
    if (!out.ok || !out.db) { toast('❌'); return; }
    if (!confirm(t('sync.restoreconfirm'))) return;
    DB = out.db; window.DB = DB;
    saveDB(); applyTheme(); closeModal(); render(); toast(t('common.saved'));
  } catch (e) { toast('❌'); }
}
