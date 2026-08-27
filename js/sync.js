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

// fetch con límite de tiempo: sin esto una petición colgada dejaba
// la sincronización bloqueada para siempre (syncing en true)
function fetchT(url, opts, ms) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms || 25000);
  return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}))
    .finally(() => clearTimeout(to));
}

async function pushOnly() {
  const url = backendUrl();
  if (!url || syncing || !navigator.onLine) return false;
  syncing = true;
  let ok = false;
  try {
    const res = await fetchT(url, {
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
    // el parámetro _ evita que el navegador entregue una copia guardada
    const res = await fetchT(url + '?action=restore&_=' + Date.now(), { cache: 'no-store' });
    const out = await res.json();
    if (out.ok && out.db) {
      mergeRemote(out.db);
      localStorage.setItem(STORE_KEY, JSON.stringify(DB)); // guardar sin re-agendar push
    }
    const res2 = await fetchT(url, {
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
// ¿la versión remota de este elemento es más nueva que la local?
const remoteNewer = (l, r) => (r && r.mt ? r.mt : 0) > (l && l.mt ? l.mt : 0);
// copia los campos del remoto sobre el local (conservando el id)
function overwrite(local, remote) {
  Object.keys(local).forEach(k => { if (k !== 'id' && !(k in remote)) delete local[k]; });
  Object.keys(remote).forEach(k => { if (k !== 'id') local[k] = remote[k]; });
}

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
      else {
        idMap[rx.id] = lx.id;
        if (onBoth) onBoth(lx, rx);
        else if (remoteNewer(lx, rx) || (!lx.mt && !rx.mt)) { const id = lx.id; overwrite(lx, rx); lx.id = id; }
      }
    });
    return localArr.filter(x => !dead(prefix + lowKey(x.name || x.title)));
  };

  DB.categories = mergeNamed(DB.categories || [], r.categories, 'cat:');
  DB.habits = mergeNamed(DB.habits || [], r.habits, 'hab:');

  // --- metas por título; hitos y pasos por título dentro de su meta ---
  DB.goals = mergeNamed(DB.goals || [], r.goals, 'goal:', (lg, rg) => {
    // si la meta se editó más recientemente allá, se toma entera (hitos y pasos incluidos)
    if (remoteNewer(lg, rg)) { overwrite(lg, rg); return; }
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
      if (!ids.has(rt.id)) { loc.push(rt); return; }
      const lt = loc.find(t => t.id === rt.id);
      // gana la edición más reciente (título, hora, categoría, tachado...)
      if (remoteNewer(lt, rt)) overwrite(lt, rt);
      else if (!lt.mt && !rt.mt) {
        // Datos de antes de las marcas de tiempo: manda la copia de la nube
        // (así los dos dispositivos convergen en vez de quedarse cada uno
        // con su versión), pero nunca se destacha algo ya hecho.
        const done = lt.done || rt.done;
        overwrite(lt, rt);
        lt.done = done;
      }
    });
  }
  for (const d in DB.tasks) {
    DB.tasks[d] = DB.tasks[d].filter(t => !dead('task:' + d + ':' + t.id));
    if (!DB.tasks[d].length) delete DB.tasks[d];
  }

  // marcas de tiempo de los datos sin id (trackers, hábitos del día, notas)
  const lmt = DB.mt || (DB.mt = {}), rmt = r.mt || {};
  const rNewer = k => (rmt[k] || 0) > (lmt[k] || 0);

  // --- habitLog: el día editado más recientemente manda (permite desmarcar) ---
  const habDays = new Set(Object.keys(r.habitLog || {}).concat(
    Object.keys(rmt).filter(k => k.startsWith('hab:')).map(k => k.slice(4))));
  habDays.forEach(d => {
    const rem = (r.habitLog || {})[d];
    if (DB.habitLog[d] === undefined) { if (rem) DB.habitLog[d] = rem.map(h => idMap[h] || h); return; }
    if (rNewer('hab:' + d)) {
      if (rem) DB.habitLog[d] = rem.map(h => idMap[h] || h); else delete DB.habitLog[d];
    } else if (!lmt['hab:' + d] && !rmt['hab:' + d] && rem) {
      rem.forEach(h => { const m = idMap[h] || h; if (!DB.habitLog[d].includes(m)) DB.habitLog[d].push(m); });
    }
  });

  // --- trackers: gana el día pintado más recientemente (y respeta los borrados) ---
  for (const trk in (r.trackers || {})) {
    DB.trackers[trk] = DB.trackers[trk] || {};
    for (const d in r.trackers[trk]) {
      if (DB.trackers[trk][d] === undefined || rNewer('trk:' + trk + ':' + d)) {
        DB.trackers[trk][d] = r.trackers[trk][d];
      }
    }
  }
  Object.keys(rmt).forEach(k => {              // día borrado en el otro dispositivo
    if (k.indexOf('trk:') !== 0 || !rNewer(k)) return;
    const [, trk, d] = k.split(':');
    if (DB.trackers[trk] && (r.trackers[trk] || {})[d] === undefined) delete DB.trackers[trk][d];
  });

  // --- eventos y medidas corporales por id ---
  const mergeById = (localArr, remoteArr, prefix) => {
    const byId = new Map(localArr.map(x => [x.id, x]));
    (remoteArr || []).forEach(rx => {
      if (dead(prefix + rx.id)) return;
      const lx = byId.get(rx.id);
      if (!lx) { localArr.push(rx); return; }
      if (remoteNewer(lx, rx)) overwrite(lx, rx);            // edición más reciente gana
      else if (!lx.mt && !rx.mt) {                            // datos viejos: converge a la nube
        const done = lx.done || rx.done;
        overwrite(lx, rx);
        lx.done = done;
      }
    });
    return localArr.filter(x => !dead(prefix + x.id));
  };
  DB.events = mergeById(DB.events || [], r.events, 'ev:');
  DB.body = mergeById(DB.body || [], r.body, 'body:');

  // tipos de medida personalizados: unión por key
  DB.bodyFields = DB.bodyFields || [];
  const bfKeys = new Set(DB.bodyFields.map(f => f.key));
  (r.bodyFields || []).forEach(f => { if (!bfKeys.has(f.key)) DB.bodyFields.push(f); });

  // --- highlights por mes ---
  for (const mk in (r.highlights || {})) {
    DB.highlights[mk] = mergeById(DB.highlights[mk] || (DB.highlights[mk] = []), r.highlights[mk], 'hl:' + mk + ':');
  }

  // --- notas, revisiones, rituales: falta localmente o se editó después allá ---
  for (const k in (r.weekNotes || {})) if (!DB.weekNotes[k] || rNewer('wn:' + k)) DB.weekNotes[k] = r.weekNotes[k];
  for (const k in (r.reviews || {})) if (!DB.reviews[k] || rNewer('rev:' + k)) DB.reviews[k] = r.reviews[k];
  for (const k in (r.ritual || {})) if (!DB.ritual[k] || rNewer('rit:' + k)) DB.ritual[k] = r.ritual[k];
  DB.celebrated = Object.assign({}, r.celebrated || {}, DB.celebrated || {});
  // conserva la marca más nueva de cada clave
  Object.keys(rmt).forEach(k => { if ((rmt[k] || 0) > (lmt[k] || 0)) lmt[k] = rmt[k]; });
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

// Traer la copia de la nube tal cual (reemplaza lo del dispositivo)
async function restoreFromCloud() {
  const url = backendUrl();
  if (!url) { toast('❌'); return; }
  if (!confirm(t('sync.restoreconfirm'))) return;
  try {
    const res = await fetchT(url + '?action=restore&_=' + Date.now(), { cache: 'no-store' });
    const out = await res.json();
    if (!out.ok || !out.db) { toast(t('sync.fail')); return; }
    DB = out.db; window.DB = DB;
    for (const k in DEFAULT_DB) if (DB[k] === undefined) DB[k] = JSON.parse(JSON.stringify(DEFAULT_DB[k]));
    localStorage.setItem(STORE_KEY, JSON.stringify(DB)); // sin re-subir: ya es igual a la nube
    applyTheme(); closeModal(); render();
    toast(t('sync.restored'));
  } catch (e) { toast(t('sync.fail')); }
}

// Mandar lo de ESTE dispositivo a la nube tal cual (pisa lo que haya)
async function forcePush() {
  const url = backendUrl();
  if (!url) { toast('❌'); return; }
  if (!confirm(t('sync.forceconfirm'))) return;
  const ok = await pushOnly();
  toast(ok ? t('sync.forced') : t('sync.fail'));
}
