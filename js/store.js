// ===== Data store: localStorage, offline-first =====
const STORE_KEY = 'agenda_db_v1';

const DEFAULT_DB = {
  settings: { lang: 'es', name: 'Angie' },
  categories: [
    { id: 'work', name: 'Trabajo', color: '#f5c85c' },
    { id: 'personal', name: 'Personal', color: '#5bc8c0' },
    { id: 'social', name: 'Social', color: '#8fd0a8' },
    { id: 'family', name: 'Familia', color: '#e08bb8' },
    { id: 'freelance', name: 'Freelance', color: '#a99bc6' },
    { id: 'home', name: 'Hogar', color: '#f4a98c' }
  ],
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
  // one-time seed of her 2026 goals from the physical journal
  if (!DB.settings.seeded2026) {
    if (!DB.goals.length) DB.goals = seedGoals2026();
    DB.settings.seeded2026 = true;
    saveDB();
  }
  // one-time upgrade: mid-year monthly plan (replaces milestones of untouched seeded goals)
  if (!DB.settings.plan2026) {
    const fresh = seedGoals2026();
    DB.goals.forEach(g => {
      if (g.year !== 2026 || g.done) return;
      const touched = (g.milestones || []).some(m => m.done || (m.steps || []).some(s => s.done));
      if (touched) return; // don't wipe her progress
      const nu = fresh.find(f => f.title === g.title);
      if (nu) g.milestones = nu.milestones;
    });
    DB.settings.plan2026 = true;
    saveDB();
  }
  window.DB = DB;
}

// ---- 2026 goals transcribed from Angie's physical bullet journal ----
function seedGoals2026() {
  const Y = 2026;
  const step = (title) => ({ id: uid(), title, done: false });
  const ms = (quarter, title, steps) => ({ id: uid(), quarter, title, done: false, steps: (steps || []).map(step) });
  const goal = (category, title, opts) => Object.assign(
    { id: uid(), year: Y, category, title, done: false, count: 0, milestones: [] }, opts || {});
  return [
    // personal
    goal('personal', 'Read 4 books', { target: 4, milestones: [
      ms(3, 'Jul-Aug: Book 1', ['Pick the book', 'Read 15 min before bed']),
      ms(3, 'Sep: Book 2'), ms(4, 'Oct-Nov: Book 3'), ms(4, 'Dec: Book 4')] }),
    goal('personal', 'Finish my bedroom and office remodel', { milestones: [
      ms(3, 'Jul: Final office design', ['Choose desk layout']),
      ms(3, 'Aug: Buy/order missing pieces'),
      ms(3, 'Sep: Office fully set up'),
      ms(4, 'Oct: Bedroom finishing touches'),
      ms(4, 'Nov: Decorate + final photos 📸')] }),
    goal('personal', 'Create an outfit combinations stock', { done: true }),
    goal('personal', 'Good method for cleaning my rooms', { milestones: [
      ms(3, 'Jul: Define routine + weekly checklist', ['List zones & frequency']),
      ms(3, 'Aug: Run it a full month')] }),
    goal('personal', 'Fluent english speaking (language exchange)', { milestones: [
      ms(3, 'Jul: Find exchange partner + fixed day'),
      ms(3, 'Aug-Sep: Weekly exchange sessions'),
      ms(4, 'Oct-Nov: 30-min full conversations'),
      ms(4, 'Dec: Fluency self-test 🎓')] }),
    goal('personal', 'Have 6 dates with me', { target: 6, milestones: [
      ms(3, 'Jul: Date 1'), ms(3, 'Aug: Date 2'), ms(3, 'Sep: Date 3'),
      ms(4, 'Oct: Date 4'), ms(4, 'Nov: Date 5'), ms(4, 'Dec: Date 6')] }),
    goal('personal', 'Make an international trip', { milestones: [
      ms(3, 'Jul: Pick destination + budget', ['Shortlist 3 destinations', 'Check flight prices']),
      ms(3, 'Aug: Book flights'),
      ms(4, 'Oct: Itinerary + documents ready'),
      ms(4, 'Nov-Dec: The trip! ✈️')] }),
    goal('personal', 'Make 2 national trips', { target: 2, done: true, count: 2 }),
    goal('personal', 'Have my diving certificate', { milestones: [
      ms(3, 'Jul: Finish course sessions'),
      ms(3, 'Aug: Open water dives + certification 🤿')] }),
    // health
    goal('health', 'Go to the dermatologist', { milestones: [
      ms(3, 'Jul: Book appointment'), ms(3, 'Aug: Attend appointment')] }),
    goal('health', 'Go to the gynecologist', { milestones: [
      ms(3, 'Aug: Book appointment'), ms(3, 'Sep: Attend appointment')] }),
    goal('health', 'Go to the optometrist', { milestones: [
      ms(3, 'Sep: Book appointment'), ms(4, 'Oct: Attend appointment')] }),
    goal('health', 'Finish my brackets treatment', { done: true }),
    goal('health', 'Have my annual medical exams', { milestones: [
      ms(4, 'Oct: Schedule the exams'), ms(4, 'Nov: Exams + review results')] }),
    goal('health', 'Have a functional skincare routine', { milestones: [
      ms(3, 'Jul: Define AM/PM routine', ['Pick products that work', 'Stick it on the mirror']),
      ms(3, 'Aug-Sep: 2 months consistent')] }),
    goal('health', 'Go to the gym 144 times', { target: 144, tracker: 'gym', milestones: [
      ms(3, 'Jul: Back on schedule (3-4x/week)'),
      ms(3, 'Aug-Sep: Steady 4-5x/week'),
      ms(4, 'Oct: Check count → keep or adjust target'),
      ms(4, 'Nov-Dec: Hold the pace 💪')] }),
    goal('health', 'Drink 2 lt of water daily', { milestones: [
      ms(3, 'Jul: Water bottle at the office every day'),
      ms(3, 'Aug: 30-day water streak'),
      ms(4, 'Oct-Dec: Maintain without thinking')] }),
    goal('health', 'Improve my diet (less sugar and dairy)', { milestones: [
      ms(3, 'Aug: No sugary drinks on weekdays'),
      ms(3, 'Sep: Low-dairy meal plan'),
      ms(4, 'Oct-Dec: Maintain 80/20')] }),
    goal('health', 'Improve my flexibility and posture on my back', { milestones: [
      ms(3, 'Sep: 10-min stretch routine 3x/week'),
      ms(4, 'Oct-Nov: Keep it consistent'),
      ms(4, 'Dec: Posture check + progress photo')] }),
    goal('health', 'Take supplements and vitamins', { milestones: [
      ms(3, 'Jul: Buy supplements'),
      ms(3, 'Aug: Full month daily'),
      ms(4, 'Oct-Dec: Maintain')] }),
    // finance
    goal('finance', 'Have 7-8M salary', { done: true }),
    goal('finance', 'Incomes greater than 90M', { target: 90, milestones: [
      ms(3, 'Jul: ~52M accumulated'), ms(3, 'Aug: ~60M'), ms(3, 'Sep: ~67M'),
      ms(4, 'Oct: ~75M'), ms(4, 'Nov: ~82M'), ms(4, 'Dec: 90M+ 🎉')] }),
    goal('finance', 'Have my legal and tax finances in order', { milestones: [
      ms(3, 'Jul: Gather all documents', ['List pending papers']),
      ms(3, 'Aug: Session with abogada'),
      ms(3, 'Sep: Everything filed & up to date')] }),
    goal('finance', 'Have emergency savings in invest (6 months)', { milestones: [
      ms(3, 'Aug: Define monthly auto-save amount'),
      ms(3, 'Sep: 1 month of expenses saved'),
      ms(4, 'Nov: 2 months saved'),
      ms(4, 'Dec: 3 months saved (halfway!)')] }),
    goal('finance', 'Learn and improve my invests', { milestones: [
      ms(3, 'Sep: Finish an investing course/book'),
      ms(4, 'Oct: Apply learnings to insights'),
      ms(4, 'Nov: Review & rebalance portfolio')] }),
    goal('finance', 'Complete down payment for my house', { milestones: [
      ms(4, 'Oct: Define total amount + deadline'),
      ms(4, 'Nov: Automatic saving plan running')] }),
    // work
    goal('work', 'Get a better job', { done: true }),
    goal('work', 'Publish content on my IG account', { milestones: [
      ms(3, 'Jul: Define 3 content pillars'),
      ms(3, 'Aug: First 3 posts published'),
      ms(3, 'Sep: Monthly rhythm set'),
      ms(4, 'Oct-Dec: 1+ post per month')] }),
    goal('work', 'Have original Adobe license', { done: true }),
    goal('work', 'Perform maintenance on my PC', { milestones: [
      ms(3, 'Aug: Backup + deep clean'),
      ms(3, 'Sep: Hardware check')] }),
    goal('work', 'Watch an animated movie per month', { target: 12, milestones: [
      ms(3, 'Jul: Movie 7'), ms(3, 'Aug: Movie 8'), ms(3, 'Sep: Movie 9'),
      ms(4, 'Oct: Movie 10'), ms(4, 'Nov: Movie 11'), ms(4, 'Dec: Movie 12 🍿')] }),
    goal('work', 'Strategically showcase my work and leadership to my leads', { milestones: [
      ms(3, 'Aug: Share wins in team meetings'),
      ms(3, 'Sep: Visibility plan with work samples'),
      ms(4, 'Nov: Portfolio review with my lead')] }),
    goal('work', 'Have a healthy relationship with my job', { milestones: [
      ms(3, 'Jul: Define end-of-day boundary'),
      ms(3, 'Sep: One full no-overtime month'),
      ms(4, 'Dec: Evaluate how it feels')] }),
    // social
    goal('social', 'Have a special monthly time with my parents', { target: 12, milestones: [
      ms(3, 'Jul: Moment 7'), ms(3, 'Aug: Moment 8'), ms(3, 'Sep: Moment 9'),
      ms(4, 'Oct: Moment 10'), ms(4, 'Nov: Moment 11'), ms(4, 'Dec: Moment 12 💜')] }),
    goal('social', 'Build stronger relationships with my friends', { milestones: [
      ms(3, 'Jul-Sep: One friend plan per month'),
      ms(4, 'Oct-Nov: Keep the monthly plan'),
      ms(4, 'Dec: End-of-year gathering 🎄')] })
  ];
}

function saveDB() {
  localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  if (typeof scheduleSync === 'function') scheduleSync();
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function catById(id) { return (DB.categories || []).find(c => c.id === id) || null; }
function catColor(id) { const c = catById(id); return c ? c.color : 'transparent'; }

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
