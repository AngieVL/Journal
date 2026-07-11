// ===== Data store: localStorage, offline-first =====
const STORE_KEY = 'agenda_db_v1';

const DEFAULT_DB = {
  settings: { lang: 'es', name: 'Angie' },
  habits: [
    { id: 'h1', name: 'Water', color: '#5bc8c0' },
    { id: 'h2', name: 'Read', color: '#e08bb8' },
    { id: 'h3', name: 'Healthy food', color: '#8fd0a8' },
    { id: 'h4', name: 'Journal', color: '#a99bc6' },
    { id: 'h5', name: 'English practice', color: '#f5c85c' }
  ],
  habitLog: {},        // 'YYYY-MM-DD': ['h1','h2']
  tasks: {},           // 'YYYY-MM-DD': [{id,title,done}]
  weekNotes: {},       // 'YYYY-Www': 'text'
  events: [],          // {id, date:'YYYY-MM-DD', title, type:'event'|'holiday'|'highlight'}
  highlights: {},      // 'YYYY-MM': [{id,text}]
  goals: [],           // {id, year, category, title, done, target, tracker, count, milestones:[{id,quarter,title,done,steps:[{id,title,done}]}]}
  trackers: { mood:{}, productivity:{}, sleep:{}, health:{}, period:{}, gym:{} },
  body: [],            // {id, date, chest, armR, armL, waist, hips, thighR, thighL, calfR, calfL, weight}
  reviews: {},         // 'M-2026-07' | 'Q-2026-3' : {feel,win,improve,next,goals:{goalId:status}}
  ritual: {}           // 'start-2026': {word,vision,letter} / 'end-2026': {rating,best,learned,release,thanks}
};

let DB = null;

function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    DB = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_DB));
  } catch (e) {
    DB = JSON.parse(JSON.stringify(DEFAULT_DB));
  }
  // ensure new keys exist after updates
  for (const k in DEFAULT_DB) if (DB[k] === undefined) DB[k] = JSON.parse(JSON.stringify(DEFAULT_DB[k]));
  for (const k in DEFAULT_DB.trackers) if (!DB.trackers[k]) DB.trackers[k] = {};
  window.DB = DB;
}

function saveDB() {
  localStorage.setItem(STORE_KEY, JSON.stringify(DB));
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---- date helpers ----
function todayISO() { return dateISO(new Date()); }
function dateISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fromISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return dateISO(d); }
function monthKey(iso) { return iso.slice(0, 7); }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); } // m: 0-11
function weekStartISO(iso) { // week starts Sunday (like her journal)
  const d = fromISO(iso); d.setDate(d.getDate() - d.getDay()); return dateISO(d);
}
function curYear() { return new Date().getFullYear(); }
function curQuarter(d) { const m = (d || new Date()).getMonth(); return Math.floor(m / 3) + 1; }

function fmtDate(iso, opts) {
  const d = fromISO(iso);
  const months = t('months');
  return d.getDate() + ' ' + months[d.getMonth()].slice(0, 3) + (opts && opts.year ? ' ' + d.getFullYear() : '');
}

// ---- habit streak ----
function habitStreak(habitId) {
  let streak = 0;
  let day = todayISO();
  // today counts if logged; if not yet logged today, streak continues from yesterday
  if (!(DB.habitLog[day] || []).includes(habitId)) day = addDays(day, -1);
  while ((DB.habitLog[day] || []).includes(habitId)) { streak++; day = addDays(day, -1); }
  return streak;
}

// ---- goal progress ----
function goalAutoCount(goal) {
  if (goal.tracker === 'gym') {
    const y = String(goal.year);
    let n = 0;
    for (const d in DB.trackers.gym) {
      if (d.startsWith(y) && DB.trackers.gym[d] && DB.trackers.gym[d] !== 'rest') n++;
    }
    return n;
  }
  return goal.count || 0;
}

function goalProgress(goal) {
  if (goal.done) return 1;
  if (goal.target) {
    return Math.min(1, goalAutoCount(goal) / goal.target);
  }
  const steps = [];
  (goal.milestones || []).forEach(m => {
    steps.push(m);
    (m.steps || []).forEach(s => steps.push(s));
  });
  if (!steps.length) return 0;
  return steps.filter(s => s.done).length / steps.length;
}

// ---- period prediction ----
function periodPrediction() {
  const flowDays = Object.keys(DB.trackers.period)
    .filter(d => (DB.trackers.period[d] || []).includes('flow')).sort();
  if (!flowDays.length) return null;
  // find cycle starts: flow day with no flow the previous day
  const starts = flowDays.filter(d => !(DB.trackers.period[addDays(d, -1)] || []).includes('flow'));
  if (starts.length < 2) return null;
  const recent = starts.slice(-4);
  let gaps = [];
  for (let i = 1; i < recent.length; i++) {
    gaps.push((fromISO(recent[i]) - fromISO(recent[i - 1])) / 86400000);
  }
  const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  if (avg < 15 || avg > 60) return null;
  return { next: addDays(starts[starts.length - 1], avg), cycle: avg, lastStart: starts[starts.length - 1] };
}

// ---- backup ----
function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mi-agenda-backup-' + todayISO() + '.json';
  a.click();
}

function importData(file, cb) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.settings || !data.trackers) throw new Error('invalid');
      DB = data; window.DB = DB;
      for (const k in DEFAULT_DB) if (DB[k] === undefined) DB[k] = JSON.parse(JSON.stringify(DEFAULT_DB[k]));
      saveDB(); cb(true);
    } catch (e) { cb(false); }
  };
  r.readAsText(file);
}
