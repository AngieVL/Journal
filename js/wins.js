// ===== Muro de logros + Modo día suave =====
// Dos piezas pensadas para los días grises: una guarda evidencia de que sí
// avanza, y la otra reduce el día a una sola cosa en vez de abandonar todo.

// ---------------- muro de logros ----------------
function addWin(texto, auto) {
  if (!texto) return;
  const w = stamp({ id: uid(), date: todayISO(), text: String(texto).slice(0, 200) });
  if (auto) w.auto = true;
  (DB.wins || (DB.wins = [])).unshift(w);   // lo más reciente primero
  saveDB();
}

function winsCardHTML() {
  const wins = DB.wins || [];
  const verTodos = UI.winsAll;
  const lista = verTodos ? wins : wins.slice(0, 5);
  let html = '<div class="card"><div class="section-title"><span class="st-left">🏆 ' + t('wins.title') + '</span>' +
    (wins.length ? '<span class="muted" style="font-size:12px">' + wins.length + '</span>' : '') + '</div>';
  if (lista.length) {
    html += lista.map(w =>
      '<div class="win-row" data-win="' + w.id + '">' +
      '<span class="win-mark">' + (w.auto ? '🎉' : '✦') + '</span>' +
      '<span class="win-text">' + esc(w.text) + '</span>' +
      '<span class="win-date">' + fmtDate(w.date) + '</span>' +
      '<button class="tk-del win-del">✕</button></div>').join('');
    if (wins.length > 5) {
      html += '<button class="btn ghost small" id="wins-toggle" style="width:100%">' +
        (verTodos ? t('wins.less') : t('wins.more').replace('{n}', wins.length - 5)) + '</button>';
    }
  } else {
    html += '<div class="empty">' + t('wins.empty') + '</div>';
  }
  html += '<div class="add-row"><input type="text" id="win-new" placeholder="' + t('wins.ph') + '">' +
    '<button class="btn" id="win-add">+</button></div>' +
    '<div class="muted" style="font-size:11.5px;margin-top:6px">' + t('wins.hint') + '</div></div>';
  return html;
}

function bindWins(root) {
  const add = () => {
    const inp = root.querySelector('#win-new');
    if (!inp || !inp.value.trim()) return;
    addWin(inp.value.trim());
    render();
  };
  const b = root.querySelector('#win-add');
  if (b) b.onclick = add;
  const inp = root.querySelector('#win-new');
  if (inp) inp.onkeydown = e => { if (e.key === 'Enter') add(); };
  const tg = root.querySelector('#wins-toggle');
  if (tg) tg.onclick = () => { UI.winsAll = !UI.winsAll; render(); };
  root.querySelectorAll('[data-win]').forEach(row => {
    row.querySelector('.win-del').onclick = () => {
      tomb('win:' + row.dataset.win);
      DB.wins = (DB.wins || []).filter(w => w.id !== row.dataset.win);
      saveDB(); render();
    };
  });
}

// ---------------- modo día suave ----------------
function esDiaMalo() {
  return !!(DB.badDay && DB.badDay.date === todayISO());
}

function activarDiaMalo(taskId) {
  DB.badDay = { date: todayISO(), taskId: taskId || null };
  stampKey('badday:' + todayISO());
  saveDB(); closeModal(); render();
}

function salirDiaMalo() {
  DB.badDay = null;
  stampKey('badday:' + todayISO());
  saveDB(); render();
}

// propone activarlo con las tareas de hoy, o descansar del todo
function openBadDayModal() {
  const iso = todayISO();
  const pend = (DB.tasks[iso] || []).filter(t => !t.done);
  let html = '<div class="modal-title">🌧️ ' + t('bad.title') + '<button class="icon-btn" id="md-x">✕</button></div>' +
    '<div class="muted" style="font-size:13.5px;line-height:1.5">' + t('bad.intro') + '</div>';
  if (pend.length) {
    html += '<label class="fld">' + t('bad.pick') + '</label>';
    html += pend.slice(0, 8).map(tk =>
      '<button class="btn secondary bad-pick" data-pick="' + tk.id + '" style="width:100%;margin-bottom:6px;text-align:left">' +
      (tk.time ? '🕐 ' + tk.time + ' · ' : '') + esc(tk.title) + '</button>').join('');
  }
  html += '<button class="btn secondary bad-pick" data-pick="" style="width:100%;margin-top:6px">🛌 ' + t('bad.nothing') + '</button>' +
    '<div class="modal-actions"><button class="btn secondary" id="md-cancel">' + t('common.cancel') + '</button></div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = md.querySelector('#md-cancel').onclick = closeModal;
  md.querySelectorAll('.bad-pick').forEach(b => b.onclick = () => activarDiaMalo(b.dataset.pick || null));
}

// la vista de Hoy cuando el modo está activo: casi vacía, a propósito
function renderBadDay() {
  const iso = todayISO();
  const d = new Date();
  const days = t('days.long'), months = t('months');
  const tk = DB.badDay.taskId ? (DB.tasks[iso] || []).find(x => x.id === DB.badDay.taskId) : null;

  let html = '<h1 class="page-title">' + days[d.getDay()] + ' ' + d.getDate() + '</h1>' +
    '<div class="subtitle">' + months[d.getMonth()] + ' ' + d.getFullYear() + ' · 🌧️ ' + t('bad.mode') + '</div>';

  html += '<div class="card bad-card">';
  if (tk) {
    html += '<div class="muted" style="font-size:13px">' + t('bad.only') + '</div>' +
      '<div class="task bad-task' + (tk.done ? ' done' : '') + '" data-task="' + tk.id + '" data-date="' + iso + '">' +
      '<button class="tk-check">' + (tk.done ? '✓' : '') + '</button>' +
      '<span class="tk-main"><span class="tk-title">' + esc(tk.title) + '</span>' + metaLineHTML(tk) + '</span></div>' +
      (tk.done ? '<div class="bad-done">' + t('bad.didit') + '</div>' : '');
  } else {
    html += '<div class="bad-rest">🛌<br>' + t('bad.resting') + '</div>';
  }
  html += '</div>';

  // un logro del muro: evidencia de que otros días sí pudo
  const wins = DB.wins || [];
  if (wins.length) {
    const w = wins[Math.floor(Math.random() * Math.min(wins.length, 10))];
    html += '<div class="card"><div class="section-title"><span class="st-left">🏆 ' + t('bad.remember') + '</span></div>' +
      '<div class="win-text" style="font-size:15px">' + esc(w.text) + '</div>' +
      '<div class="muted" style="font-size:12px;margin-top:4px">' + fmtDate(w.date, { year: true }) + '</div></div>';
  }

  // los hábitos siguen, son victorias baratas
  if ((DB.habits || []).length) {
    html += '<div class="card"><div class="section-title"><span class="st-left">🔥 ' + t('today.habits') + '</span></div><div class="habit-row">';
    DB.habits.forEach(h => {
      const on = (DB.habitLog[iso] || []).includes(h.id);
      html += '<button class="chip' + (on ? ' on' : '') + '" data-habit="' + h.id + '"' +
        (on ? ' style="background:' + h.color + '33;border:1.5px solid ' + h.color + '"' : '') + '>' +
        (on ? '✓ ' : '') + esc(h.name) + '</button>';
    });
    html += '</div></div>';
  }

  html += '<button class="btn secondary" id="bad-exit" style="width:100%">' + t('bad.exit') + '</button>';
  return html;
}

function bindBadDay(root) {
  const iso = todayISO();
  bindTaskEvents(root);
  root.querySelectorAll('[data-habit]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.habit;
    const log = DB.habitLog[iso] || (DB.habitLog[iso] = []);
    const i = log.indexOf(id);
    if (i >= 0) log.splice(i, 1); else { log.push(id); checkStreakCelebration(id); }
    stampKey('hab:' + iso);
    saveDB(); render();
  });
  const ex = root.querySelector('#bad-exit');
  if (ex) ex.onclick = salirDiaMalo;
}
