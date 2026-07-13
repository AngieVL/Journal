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
document.getElementById('modal-backdrop').onclick = closeModal;

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
  if (syncNow) syncNow.onclick = async () => { await doSync(); const el = document.getElementById('sync-state'); if (el) el.textContent = syncStateText(); };
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

// push a backup shortly after opening (if backend configured and online)
setTimeout(() => { if (typeof doSync === 'function') doSync(); }, 3000);
