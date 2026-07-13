// ===== Cloud sync: push backup to Apps Script backend (assistant reads it) =====
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbzJKyOaUKRnoEOzJz0enJF9jqSugzaWLTukl-IpJA44uhFLzON3GeK6fdLizl2XzUZz/exec';

let syncTimer = null, syncing = false;

function backendUrl() {
  return DB.settings.backendUrl || (SYNC_URL.indexOf('http') === 0 ? SYNC_URL : '');
}

function scheduleSync() {
  if (!backendUrl()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(doSync, 8000); // debounce: sync 8s after last change
}

async function doSync() {
  const url = backendUrl();
  if (!url || syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // avoids CORS preflight with Apps Script
      body: JSON.stringify({ action: 'sync', db: DB })
    });
    const out = await res.json();
    if (out.ok) {
      localStorage.setItem('agenda_last_sync', new Date().toISOString());
      const el = document.getElementById('sync-state');
      if (el) el.textContent = syncStateText();
    }
  } catch (e) { /* offline or backend down: retry on next change */ }
  syncing = false;
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
