// ===== App shell: navigation, modal, settings =====
loadDB();

// ---- theme & accent ----
const ACCENTS = ['#5bc8c0', '#e08bb8', '#a99bc6', '#f28b82', '#8fd0a8', '#f5c85c'];
function applyTheme() {
  const theme = DB.settings.theme || 'light';
  document.documentElement.dataset.theme = theme;
  if (DB.settings.accent) document.documentElement.style.setProperty('--teal', DB.settings.accent);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#211d19' : '#faf6ef';
}
applyTheme();

const UI = {
  tab: 'today',
  week: weekStartISO(todayISO()),
  month: { y: new Date().getFullYear(), m: new Date().getMonth() },
  monthMode: 'month',
  trk: 'mood',
  trkYear: curYear(),
  habitMonth: { y: new Date().getFullYear(), m: new Date().getMonth() },
  goalYear: curYear(),
  goalCat: 'all'
};

function render() {
  const view = document.getElementById('view');
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === UI.tab));
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  let html = '', bind = null;
  switch (UI.tab) {
    case 'today': html = renderToday(); bind = bindToday; break;
    case 'week': html = renderWeek(); bind = bindWeek; break;
    case 'month': html = renderMonth(); bind = bindMonth; break;
    case 'goals': html = renderGoals(); bind = bindGoals; break;
    case 'trackers': html = renderTrackers(); bind = bindTrackers; break;
  }
  view.innerHTML = html;
  if (bind) bind(view);
}

document.querySelectorAll('.tab').forEach(btn => btn.onclick = () => { UI.tab = btn.dataset.tab; render(); });

// ---- modal ----
function openModal(html) {
  document.getElementById('modal-card').innerHTML = html;
  document.getElementById('modal-root').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-root').classList.add('hidden');
  document.getElementById('modal-card').innerHTML = '';
}
document.getElementById('modal-backdrop').onclick = () => { closeModal(); render(); };

// ---- toast ----
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

// ---- settings ----
document.getElementById('btn-settings').onclick = openSettings;

// ---- AI planner: "vuélcame el caos" ----
document.getElementById('btn-plan').onclick = openPlanner;

function openPlanner() {
  let html = '<div class="modal-title">✨ ' + t('plan.title') + '<button class="icon-btn" id="md-x">✕</button></div>' +
    '<div class="muted" style="font-size:13px">' + t('plan.hint') + '</div>' +
    '<textarea id="plan-text" style="min-height:150px;margin-top:10px" placeholder="' + t('plan.ph') + '"></textarea>' +
    '<div class="modal-actions"><button class="btn secondary" id="plan-mic" style="flex:0 0 62px">🎤</button>' +
    '<button class="btn" id="plan-go">🪄 ' + t('plan.go') + '</button></div>' +
    '<div id="plan-result"></div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = () => { stopMic(); closeModal(); };
  md.querySelector('#plan-go').onclick = () => { stopMic(); runPlanner(); };
  md.querySelector('#plan-mic').onclick = toggleMic;
}

// dictado por voz (Web Speech API, igual que en Finanzas)
let planRec = null;
function stopMic() {
  if (planRec) { try { planRec.stop(); } catch (e) {} planRec = null; }
  const b = document.getElementById('plan-mic');
  if (b) b.textContent = '🎤';
}
function toggleMic() {
  if (planRec) { stopMic(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast(t('plan.novoice')); return; }
  planRec = new SR();
  planRec.lang = DB.settings.lang === 'en' ? 'en-US' : 'es-CO';
  planRec.continuous = true;
  planRec.interimResults = false;
  planRec.onresult = e => {
    const ta = document.getElementById('plan-text');
    if (!ta) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) ta.value = (ta.value ? ta.value.trim() + ' ' : '') + e.results[i][0].transcript.trim();
    }
  };
  planRec.onend = () => { if (planRec) stopMic(); };
  planRec.onerror = () => stopMic();
  planRec.start();
  document.getElementById('plan-mic').textContent = '🔴';
}

async function runPlanner() {
  const md = document.getElementById('modal-card');
  const text = md.querySelector('#plan-text').value.trim();
  if (!text) return;
  const btn = md.querySelector('#plan-go');
  btn.disabled = true; btn.textContent = '🧠 ' + t('plan.thinking');
  let out = null;
  try {
    const res = await fetch(backendUrl(), {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'plan', text })
    });
    out = await res.json();
  } catch (e) { out = null; }
  btn.disabled = false; btn.textContent = '🪄 ' + t('plan.go');
  const box = md.querySelector('#plan-result');
  if (!out || !out.ok || !out.plan || !out.plan.length) {
    box.innerHTML = '<div class="empty">' + t('plan.error') + (out && out.error ? ' (' + esc(out.error) + ')' : '') + '</div>';
    return;
  }
  const items = out.plan.slice().sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
  let html = out.nota ? '<div class="card" style="margin-top:14px">💬 ' + esc(out.nota) + '</div>' : '';
  let lastDate = '';
  html += '<div style="max-height:40vh;overflow-y:auto">';
  items.forEach((it, i) => {
    if (it.date !== lastDate) {
      lastDate = it.date;
      html += '<div class="fld" style="font-weight:700;margin-top:10px">📅 ' + nombrePlanDia(it.date) + '</div>';
    }
    const cat = catById(it.cat);
    html += '<label class="task" style="cursor:pointer"><input type="checkbox" checked data-plani="' + i + '" style="width:18px;height:18px">' +
      (it.time ? '<span class="tk-time">🕐 ' + esc(it.time) + '</span>' : '') +
      '<span class="tk-title">' + esc(it.title) +
      (cat ? ' <span class="tk-cat" style="background:' + cat.color + '33">' + esc(cat.name) + '</span>' : '') + '</span></label>';
  });
  html += '</div><div class="modal-actions"><button class="btn" id="plan-add">📥 ' + t('plan.add') + '</button></div>';
  box.innerHTML = html;
  box.querySelector('#plan-add').onclick = () => {
    let added = 0;
    box.querySelectorAll('[data-plani]').forEach(chk => {
      if (!chk.checked) return;
      const it = items[Number(chk.dataset.plani)];
      const tk = { id: uid(), title: it.title, done: false };
      if (it.time) tk.time = it.time;
      if (it.cat && catById(it.cat)) tk.cat = it.cat;
      (DB.tasks[it.date] || (DB.tasks[it.date] = [])).push(tk);
      added++;
    });
    saveDB(); closeModal(); render();
    toast('📥 ' + added + ' ✓');
  };
}

function nombrePlanDia(iso) {
  const d = fromISO(iso);
  return t('days.long')[d.getDay()] + ' ' + fmtDate(iso);
}

function openSettings() {
  let html = '<div class="modal-title">⚙️ ' + t('set.title') + '<button class="icon-btn" id="md-x">✕</button></div>';
  html += '<div class="set-row"><span>' + t('set.lang') + '</span><div class="seg">' +
    '<button id="lang-es" class="' + (DB.settings.lang === 'es' ? 'on' : '') + '">Español</button>' +
    '<button id="lang-en" class="' + (DB.settings.lang === 'en' ? 'on' : '') + '">English</button></div></div>';
  const theme = DB.settings.theme || 'light';
  html += '<div class="set-row"><span>' + t('set.theme') + '</span><div class="seg">' +
    '<button id="th-light" class="' + (theme === 'light' ? 'on' : '') + '">☀️ ' + t('theme.light') + '</button>' +
    '<button id="th-dark" class="' + (theme === 'dark' ? 'on' : '') + '">🌙 ' + t('theme.dark') + '</button></div></div>';
  const accent = DB.settings.accent || ACCENTS[0];
  html += '<div class="set-row"><span>' + t('set.accent') + '</span><div style="display:flex;gap:7px">' +
    ACCENTS.map(c => '<button class="acc-swatch" data-accent="' + c + '" style="width:26px;height:26px;border-radius:50%;background:' + c +
      ';border:2px solid ' + (c === accent ? 'var(--ink)' : 'transparent') + ';cursor:pointer"></button>').join('') + '</div></div>';
  html += '<label class="fld">🎨 ' + t('set.cats') + '</label><div class="muted" style="font-size:12px">' + t('set.catshint') + '</div>';
  (DB.categories || []).forEach(c => {
    html += '<div class="set-row" style="gap:8px">' +
      '<input type="color" value="' + c.color + '" data-catcolor="' + c.id + '" style="width:38px;height:34px;min-width:38px;padding:2px;border-radius:8px;border:1px solid var(--line);background:none;cursor:pointer">' +
      '<input type="text" value="' + esc(c.name) + '" data-catname="' + c.id + '" style="flex:1">' +
      '<button class="tk-del" data-catdel="' + c.id + '">✕</button></div>';
  });
  html += '<div class="add-row"><input type="text" id="new-cat" placeholder="' + t('set.addcat') + '"><button class="btn" id="btn-add-cat">+</button></div>';
  html += '<label class="fld">' + t('set.habits') + '</label>';
  DB.habits.forEach(h => {
    html += '<div class="set-row"><span><span class="dot" style="display:inline-block;width:13px;height:13px;border-radius:4px;background:' + h.color + ';margin-right:8px"></span>' + esc(h.name) + '</span>' +
      '<button class="tk-del" data-habdel="' + h.id + '">✕</button></div>';
  });
  html += '<div class="add-row"><input type="text" id="new-habit" placeholder="' + t('set.addhabit') + '"><button class="btn" id="btn-add-habit">+</button></div>';
  html += '<label class="fld mt16">' + t('set.backup') + '</label>' +
    '<div style="display:flex;gap:8px"><button class="btn secondary" id="btn-export" style="flex:1">⬇️ ' + t('set.export') + '</button>' +
    '<button class="btn secondary" id="btn-import" style="flex:1">⬆️ ' + t('set.import') + '</button></div>' +
    '<input type="file" id="import-file" accept=".json" style="display:none">';
  html += '<label class="fld mt16">☁️ ' + t('set.sync') + '</label>' +
    '<div class="set-row"><span id="sync-state" class="muted">' + (typeof syncStateText === 'function' ? syncStateText() : '') + '</span>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="btn small secondary" id="btn-sync-now">🔄 ' + t('sync.now') + '</button>' +
    '<button class="btn small secondary" id="btn-restore">⬇️ ' + t('sync.restore') + '</button></div></div>';
  html += '<div class="muted mt8 center">Mi Agenda v1 · ' + (DB.settings.name || '') + ' 💜</div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = closeModal;
  md.querySelector('#lang-es').onclick = () => { DB.settings.lang = 'es'; saveDB(); render(); openSettings(); };
  md.querySelector('#lang-en').onclick = () => { DB.settings.lang = 'en'; saveDB(); render(); openSettings(); };
  md.querySelector('#th-light').onclick = () => { DB.settings.theme = 'light'; saveDB(); applyTheme(); openSettings(); };
  md.querySelector('#th-dark').onclick = () => { DB.settings.theme = 'dark'; saveDB(); applyTheme(); openSettings(); };
  md.querySelectorAll('.acc-swatch').forEach(b => b.onclick = () => {
    DB.settings.accent = b.dataset.accent; saveDB(); applyTheme(); render(); openSettings();
  });
  md.querySelectorAll('[data-habdel]').forEach(b => b.onclick = () => {
    const dh = DB.habits.find(h => h.id === b.dataset.habdel);
    if (dh) tomb('hab:' + dh.name.trim().toLowerCase());
    DB.habits = DB.habits.filter(h => h.id !== b.dataset.habdel);
    saveDB(); render(); openSettings();
  });
  const habitColors = ['#5bc8c0', '#e08bb8', '#8fd0a8', '#a99bc6', '#f5c85c', '#f4a98c', '#f28b82'];
  md.querySelector('#btn-add-habit').onclick = () => {
    const inp = md.querySelector('#new-habit');
    if (!inp.value.trim()) return;
    DB.habits.push({ id: uid(), name: inp.value.trim(), color: habitColors[DB.habits.length % habitColors.length] });
    saveDB(); render(); openSettings();
  };
  md.querySelectorAll('[data-catcolor]').forEach(inp => inp.onchange = () => {
    const c = catById(inp.dataset.catcolor);
    if (c) { c.color = inp.value; saveDB(); render(); }
  });
  md.querySelectorAll('[data-catname]').forEach(inp => inp.onchange = () => {
    const c = catById(inp.dataset.catname);
    if (c && inp.value.trim()) { c.name = inp.value.trim(); saveDB(); render(); }
  });
  md.querySelectorAll('[data-catdel]').forEach(b => b.onclick = () => {
    const dc = catById(b.dataset.catdel);
    if (dc) tomb('cat:' + dc.name.trim().toLowerCase());
    DB.categories = DB.categories.filter(c => c.id !== b.dataset.catdel);
    saveDB(); render(); openSettings();
  });
  const catColors = ['#f5c85c', '#5bc8c0', '#8fd0a8', '#e08bb8', '#a99bc6', '#f4a98c', '#f28b82'];
  md.querySelector('#btn-add-cat').onclick = () => {
    const inp = md.querySelector('#new-cat');
    if (!inp.value.trim()) return;
    (DB.categories || (DB.categories = [])).push({ id: uid(), name: inp.value.trim(), color: catColors[DB.categories.length % catColors.length] });
    saveDB(); render(); openSettings();
  };
  const syncNow = md.querySelector('#btn-sync-now');
  if (syncNow) syncNow.onclick = async () => {
    syncNow.textContent = '⏳';
    const ok = await fullSync();
    render(); openSettings();
    toast(ok ? t('common.saved') : '❌');
  };
  const restore = md.querySelector('#btn-restore');
  if (restore) restore.onclick = restoreFromCloud;
  md.querySelector('#btn-export').onclick = exportData;
  md.querySelector('#btn-import').onclick = () => md.querySelector('#import-file').click();
  md.querySelector('#import-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!confirm(t('set.importconfirm'))) return;
    importData(f, ok => { applyTheme(); closeModal(); render(); toast(ok ? t('common.saved') : '❌'); });
  };
}

render();

// full sync cycle shortly after opening: pull cloud → merge → push
setTimeout(async () => {
  if (typeof fullSync !== 'function') return;
  const ok = await fullSync();
  if (ok) render(); // reflejar lo que llegó de otros dispositivos
}, 2000);

// y cada vez que la app vuelve al frente (en Android la PWA se "resume",
// no se reinicia — sin esto la sincronización nunca corría al reabrirla)
let lastFgSync = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - lastFgSync < 45000) return; // máx una vez cada 45s
  lastFgSync = Date.now();
  const ok = await fullSync();
  if (ok) render();
});
