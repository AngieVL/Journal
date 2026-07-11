// ===== Views: Today / Week / Month / Trackers =====

// ---------- TODAY ----------
function renderToday() {
  const iso = todayISO();
  const d = new Date();
  const days = t('days.long'), months = t('months');
  const tasks = DB.tasks[iso] || [];
  let html = '<h1 class="page-title">' + days[d.getDay()] + ' ' + d.getDate() + '</h1>' +
    '<div class="subtitle">' + months[d.getMonth()] + ' ' + d.getFullYear() + '</div>';

  // tasks
  html += '<div class="card"><div class="section-title"><span class="st-left">✍️ ' + t('today.tasks') + '</span></div>';
  html += tasks.length ? tasks.map(tk => taskRowHTML(iso, tk)).join('') : '<div class="empty">' + t('today.notask') + '</div>';
  html += '<div class="add-row"><input type="text" id="new-task" placeholder="' + t('today.addtask') + '">' +
          '<button class="btn" id="btn-add-task">+</button></div></div>';

  // habits
  html += '<div class="card"><div class="section-title"><span class="st-left">🔥 ' + t('today.habits') + '</span></div><div class="habit-row">';
  DB.habits.forEach(h => {
    const on = (DB.habitLog[iso] || []).includes(h.id);
    const st = habitStreak(h.id);
    html += '<button class="chip' + (on ? ' on' : '') + '" data-habit="' + h.id + '"' +
      (on ? ' style="background:' + h.color + '33;border:1.5px solid ' + h.color + '"' : '') + '>' +
      (on ? '✓ ' : '') + esc(h.name) + (st > 0 ? ' <span class="streak">🔥' + st + '</span>' : '') + '</button>';
  });
  html += '</div></div>';

  // quick trackers
  html += '<div class="card"><div class="section-title"><span class="st-left">🎨 ' + t('today.quick') + '</span></div>';
  ['mood', 'productivity', 'sleep', 'gym', 'health', 'period'].forEach(trk => {
    html += quickTrackerHTML(trk, iso);
  });
  const pred = periodPrediction();
  if (pred) html += '<div class="muted mt8">🩸 ' + t('trk.predict') + ': <b>' + fmtDate(pred.next) + '</b> (' + t('trk.predictdays') + ' ' + pred.cycle + 'd)</div>';
  html += '</div>';
  return html;
}

function quickTrackerHTML(trk, iso) {
  const def = TRACKER_DEFS[trk];
  const v = DB.trackers[trk][iso];
  let html = '<div class="qt-group"><div class="qt-label"><span>' + t('trk.' + trk).replace(' tracker', '') + '</span></div><div class="qt-opts">';
  def.options.forEach(o => {
    const on = def.multi ? (v || []).includes(o.id) : v === o.id;
    html += '<button class="qt-opt' + (on ? ' on' : '') + '" data-trk="' + trk + '" data-opt="' + o.id + '" data-date="' + iso + '">' +
      '<span class="dot" style="background:' + o.color + '"></span>' + trkLabel(trk, o.id) + '</button>';
  });
  return html + '</div></div>';
}

function taskRowHTML(iso, tk) {
  return '<div class="task' + (tk.done ? ' done' : '') + '" data-task="' + tk.id + '" data-date="' + iso + '">' +
    '<button class="tk-check">' + (tk.done ? '✓' : '') + '</button>' +
    '<span class="tk-title">' + esc(tk.title) + '</span>' +
    '<button class="tk-move" title="→">↪️</button>' +
    '<button class="tk-del">✕</button></div>';
}

function bindToday(root) {
  const iso = todayISO();
  bindTaskEvents(root);
  root.querySelectorAll('[data-habit]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.habit;
    const log = DB.habitLog[iso] || (DB.habitLog[iso] = []);
    const i = log.indexOf(id);
    if (i >= 0) log.splice(i, 1); else log.push(id);
    saveDB(); render();
  });
  root.querySelectorAll('.qt-opt').forEach(btn => btn.onclick = () => {
    setTrackerValue(btn.dataset.trk, btn.dataset.date, btn.dataset.opt);
    render();
  });
  const inp = root.querySelector('#new-task');
  const add = () => {
    if (!inp.value.trim()) return;
    (DB.tasks[iso] || (DB.tasks[iso] = [])).push({ id: uid(), title: inp.value.trim(), done: false });
    saveDB(); render();
  };
  root.querySelector('#btn-add-task').onclick = add;
  inp.onkeydown = e => { if (e.key === 'Enter') add(); };
}

function bindTaskEvents(root) {
  root.querySelectorAll('.task').forEach(row => {
    const iso = row.dataset.date, id = row.dataset.task;
    const list = DB.tasks[iso] || [];
    const tk = list.find(x => x.id === id);
    if (!tk) return;
    row.querySelector('.tk-check').onclick = () => { tk.done = !tk.done; saveDB(); render(); };
    row.querySelector('.tk-del').onclick = () => { DB.tasks[iso] = list.filter(x => x.id !== id); saveDB(); render(); };
    const mv = row.querySelector('.tk-move');
    if (mv) mv.onclick = () => { // move to next day
      DB.tasks[iso] = list.filter(x => x.id !== id);
      const next = addDays(iso, 1);
      (DB.tasks[next] || (DB.tasks[next] = [])).push(tk);
      saveDB(); render(); toast('→ ' + fmtDate(next));
    };
  });
}

// ---------- WEEK ----------
function renderWeek() {
  const ws = UI.week;
  const days = t('days.long');
  const today = todayISO();
  const wkEnd = addDays(ws, 6);
  let html = '<h1 class="page-title">' + t('week.title') + '</h1>' +
    '<div class="wk-nav"><button class="btn secondary small" id="wk-prev">‹</button>' +
    '<div><b>' + fmtDate(ws) + ' – ' + fmtDate(wkEnd, { year: true }) + '</b></div>' +
    '<button class="btn secondary small" id="wk-next">›</button></div>';
  html += '<button class="btn secondary small" id="wk-collect" style="width:100%">📥 ' + t('week.moveundone') + '</button>';

  for (let i = 0; i < 7; i++) {
    const iso = addDays(ws, i);
    const d = fromISO(iso);
    const tasks = DB.tasks[iso] || [];
    html += '<div class="card wk-day' + (iso === today ? ' today-col' : '') + '">' +
      '<div class="wd-head"><span>' + days[d.getDay()] + ' ' + d.getDate() + (iso === today ? ' · ' + t('common.today') : '') + '</span></div>';
    html += tasks.map(tk => taskRowHTML(iso, tk)).join('');
    html += '<div class="add-row"><input type="text" class="wk-new" data-date="' + iso + '" placeholder="' + t('week.addtask') + '">' +
      '<button class="btn small wk-add" data-date="' + iso + '">+</button></div></div>';
  }
  const wkKey = 'N' + ws;
  html += '<div class="card"><div class="section-title"><span class="st-left">📝 ' + t('week.notes') + '</span></div>' +
    '<textarea id="wk-notes">' + esc(DB.weekNotes[wkKey] || '') + '</textarea></div>';
  return html;
}

function bindWeek(root) {
  root.querySelector('#wk-prev').onclick = () => { UI.week = addDays(UI.week, -7); render(); };
  root.querySelector('#wk-next').onclick = () => { UI.week = addDays(UI.week, 7); render(); };
  root.querySelector('#wk-collect').onclick = () => {
    const today = todayISO();
    let moved = 0;
    for (let i = 0; i < 7; i++) {
      const iso = addDays(UI.week, i);
      if (iso >= today) continue;
      const list = DB.tasks[iso] || [];
      const undone = list.filter(x => !x.done);
      if (!undone.length) continue;
      DB.tasks[iso] = list.filter(x => x.done);
      (DB.tasks[today] || (DB.tasks[today] = [])).push(...undone);
      moved += undone.length;
    }
    saveDB(); render(); toast('📥 ' + moved);
  };
  bindTaskEvents(root);
  root.querySelectorAll('.wk-add').forEach(btn => btn.onclick = () => {
    const inp = root.querySelector('.wk-new[data-date="' + btn.dataset.date + '"]');
    if (!inp.value.trim()) return;
    (DB.tasks[btn.dataset.date] || (DB.tasks[btn.dataset.date] = [])).push({ id: uid(), title: inp.value.trim(), done: false });
    saveDB(); render();
  });
  root.querySelectorAll('.wk-new').forEach(inp => inp.onkeydown = e => {
    if (e.key === 'Enter') root.querySelector('.wk-add[data-date="' + inp.dataset.date + '"]').click();
  });
  const notes = root.querySelector('#wk-notes');
  notes.onchange = () => { DB.weekNotes['N' + UI.week] = notes.value; saveDB(); };
}

// ---------- MONTH ----------
const EV_COLORS = { event: '#5bc8c0', holiday: '#f5c85c', highlight: '#e08bb8' };

function renderMonth() {
  const { y, m } = UI.month;
  const months = t('months');
  let html = '<h1 class="page-title">' + (UI.monthMode === 'year' ? y : months[m] + ' ' + y) + '</h1>';
  html += '<div class="wk-nav"><button class="btn secondary small" id="mo-prev">‹</button>' +
    '<div class="seg"><button id="seg-month" class="' + (UI.monthMode === 'month' ? 'on' : '') + '">' + t('month.month') + '</button>' +
    '<button id="seg-year" class="' + (UI.monthMode === 'year' ? 'on' : '') + '">' + t('month.year') + '</button></div>' +
    '<button class="btn secondary small" id="mo-next">›</button></div>';

  if (UI.monthMode === 'year') return html + renderYearOverview(y);

  // calendar grid
  const dshort = t('days.short');
  const first = new Date(y, m, 1).getDay();
  const dim = daysInMonth(y, m);
  const today = todayISO();
  html += '<div class="card"><table class="cal"><tr>' + dshort.map(d => '<th>' + d + '</th>').join('') + '</tr>';
  let day = 1;
  for (let r = 0; r < 6 && day <= dim; r++) {
    html += '<tr>';
    for (let c = 0; c < 7; c++) {
      const cellIdx = r * 7 + c;
      if (cellIdx < first || day > dim) { html += '<td class="other"></td>'; continue; }
      const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const evs = DB.events.filter(e => e.date === iso);
      html += '<td data-date="' + iso + '" class="' + (iso === today ? 'today' : '') + '"><span class="dnum">' + day + '</span>' +
        '<div class="dots">' + evs.map(e => '<span class="ev-dot" style="background:' + EV_COLORS[e.type] + '"></span>').join('') + '</div></td>';
      day++;
    }
    html += '</tr>';
  }
  html += '</table><div class="legend mt8">' +
    '<div class="lg"><span class="dot" style="background:' + EV_COLORS.event + '"></span>' + t('ev.event') + '</div>' +
    '<div class="lg"><span class="dot" style="background:' + EV_COLORS.holiday + '"></span>' + t('ev.holiday') + '</div>' +
    '<div class="lg"><span class="dot" style="background:' + EV_COLORS.highlight + '"></span>' + t('ev.highlight') + '</div></div></div>';

  // events of month
  const mk = y + '-' + String(m + 1).padStart(2, '0');
  const monthEvs = DB.events.filter(e => e.date.startsWith(mk)).sort((a, b) => a.date < b.date ? -1 : 1);
  html += '<div class="card"><div class="section-title"><span class="st-left">📌 ' + t('month.events') + '</span>' +
    '<button class="btn small" id="ev-add">+</button></div>';
  html += monthEvs.length ? monthEvs.map(e =>
    '<div class="ev-item"><span class="ev-dot" style="background:' + EV_COLORS[e.type] + ';width:9px;height:9px;border-radius:50%"></span>' +
    '<span class="ev-date">' + fmtDate(e.date) + '</span><span style="flex:1">' + esc(e.title) + '</span>' +
    '<button class="tk-del" data-ev="' + e.id + '">✕</button></div>').join('')
    : '<div class="empty">' + t('month.noev') + '</div>';
  html += '</div>';

  // highlights
  const hls = DB.highlights[mk] || [];
  html += '<div class="card"><div class="section-title"><span class="st-left">🌟 ' + t('month.highlights') + '</span></div>';
  html += hls.length ? hls.map(h =>
    '<div class="hl-item"><span class="hl-mark">✦</span><span style="flex:1">' + esc(h.text) + '</span>' +
    '<button class="tk-del" data-hl="' + h.id + '">✕</button></div>').join('')
    : '<div class="empty">' + t('month.nohl') + '</div>';
  html += '<div class="add-row"><input type="text" id="new-hl" placeholder="' + t('month.addhl') + '">' +
    '<button class="btn" id="btn-add-hl">+</button></div></div>';
  return html;
}

function renderYearOverview(y) {
  const months = t('months'), dshort = t('days.short');
  const today = todayISO();
  const headColors = ['#bfe8e5', '#bfe8e5', '#bfe8e5', '#fcd9c4', '#fcd9c4', '#fcd9c4', '#ecc7de', '#ecc7de', '#ecc7de', '#f8dfa0', '#f8dfa0', '#f8dfa0'];
  let html = '<div class="card"><div class="mini-months">';
  for (let m = 0; m < 12; m++) {
    const first = new Date(y, m, 1).getDay(), dim = daysInMonth(y, m);
    html += '<div class="mini-m"><div class="mm-name" style="background:' + headColors[m] + '">' + months[m].slice(0, 3) + '</div><table><tr>' +
      dshort.map(d => '<td style="font-weight:700">' + d + '</td>').join('') + '</tr><tr>';
    for (let i = 0; i < first; i++) html += '<td></td>';
    for (let d = 1; d <= dim; d++) {
      const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const evs = DB.events.filter(e => e.date === iso);
      let cls = '';
      if (evs.some(e => e.type === 'highlight')) cls = 'hlt';
      else if (evs.some(e => e.type === 'holiday')) cls = 'hol';
      else if (evs.length) cls = 'evt';
      html += '<td class="' + cls + '"' + (iso === today ? ' style="text-decoration:underline;font-weight:700"' : '') + '>' + d + '</td>';
      if ((first + d) % 7 === 0 && d < dim) html += '</tr><tr>';
    }
    html += '</tr></table></div>';
  }
  html += '</div><div class="legend mt8">' +
    '<div class="lg"><span class="dot" style="background:#f5c85c;border-radius:50%"></span>' + t('ev.holiday') + '</div>' +
    '<div class="lg"><span class="dot" style="box-shadow:inset 0 0 0 1.5px var(--ink);background:none;border-radius:50%"></span>' + t('ev.event') + '</div>' +
    '<div class="lg"><span class="dot" style="background:#e08bb8;border-radius:50%"></span>' + t('ev.highlight') + '</div></div></div>';

  // year highlights list
  const yhl = DB.events.filter(e => e.type === 'highlight' && e.date.startsWith(String(y))).sort((a, b) => a.date < b.date ? -1 : 1);
  if (yhl.length) {
    html += '<div class="card"><div class="section-title"><span class="st-left">💖 ' + t('ev.highlight') + 's ' + y + '</span></div>';
    html += yhl.map(e => '<div class="ev-item"><span class="ev-date">' + fmtDate(e.date) + '</span><span>' + esc(e.title) + '</span></div>').join('');
    html += '</div>';
  }
  return html;
}

function bindMonth(root) {
  root.querySelector('#mo-prev').onclick = () => {
    if (UI.monthMode === 'year') UI.month.y--;
    else { UI.month.m--; if (UI.month.m < 0) { UI.month.m = 11; UI.month.y--; } }
    render();
  };
  root.querySelector('#mo-next').onclick = () => {
    if (UI.monthMode === 'year') UI.month.y++;
    else { UI.month.m++; if (UI.month.m > 11) { UI.month.m = 0; UI.month.y++; } }
    render();
  };
  root.querySelector('#seg-month').onclick = () => { UI.monthMode = 'month'; render(); };
  root.querySelector('#seg-year').onclick = () => { UI.monthMode = 'year'; render(); };
  if (UI.monthMode === 'year') return;

  root.querySelectorAll('td[data-date]').forEach(td => td.onclick = () => openEventModal(td.dataset.date));
  const evAdd = root.querySelector('#ev-add');
  if (evAdd) evAdd.onclick = () => openEventModal(null);
  root.querySelectorAll('[data-ev]').forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    DB.events = DB.events.filter(x => x.id !== btn.dataset.ev);
    saveDB(); render();
  });
  root.querySelectorAll('[data-hl]').forEach(btn => btn.onclick = () => {
    const mk = UI.month.y + '-' + String(UI.month.m + 1).padStart(2, '0');
    DB.highlights[mk] = (DB.highlights[mk] || []).filter(x => x.id !== btn.dataset.hl);
    saveDB(); render();
  });
  const hlInp = root.querySelector('#new-hl');
  const addHl = () => {
    if (!hlInp.value.trim()) return;
    const mk = UI.month.y + '-' + String(UI.month.m + 1).padStart(2, '0');
    (DB.highlights[mk] || (DB.highlights[mk] = [])).push({ id: uid(), text: hlInp.value.trim() });
    saveDB(); render();
  };
  root.querySelector('#btn-add-hl').onclick = addHl;
  hlInp.onkeydown = e => { if (e.key === 'Enter') addHl(); };
}

function openEventModal(dateIso) {
  const def = dateIso || dateISO(new Date(UI.month.y, UI.month.m, 1));
  const dayEvs = dateIso ? DB.events.filter(e => e.date === dateIso) : [];
  let html = '<div class="modal-title">' + t('ev.new') + (dateIso ? ' · ' + fmtDate(dateIso) : '') + '<button class="icon-btn" id="md-x">✕</button></div>';
  if (dayEvs.length) {
    html += dayEvs.map(e => '<div class="ev-item"><span class="ev-dot" style="background:' + EV_COLORS[e.type] + ';width:9px;height:9px;border-radius:50%"></span>' +
      '<span style="flex:1">' + esc(e.title) + '</span><button class="tk-del" data-mdev="' + e.id + '">✕</button></div>').join('');
  }
  html += '<label class="fld">' + t('ev.title') + '</label><input type="text" id="ev-title">' +
    '<label class="fld">' + t('ev.date') + '</label><input type="date" id="ev-date" value="' + def + '">' +
    '<label class="fld">' + t('ev.type') + '</label><select id="ev-type">' +
    '<option value="event">' + t('ev.event') + '</option>' +
    '<option value="holiday">' + t('ev.holiday') + '</option>' +
    '<option value="highlight">' + t('ev.highlight') + '</option></select>' +
    '<div class="modal-actions"><button class="btn secondary" id="md-cancel">' + t('common.cancel') + '</button>' +
    '<button class="btn" id="md-save">' + t('common.save') + '</button></div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = md.querySelector('#md-cancel').onclick = closeModal;
  md.querySelectorAll('[data-mdev]').forEach(b => b.onclick = () => {
    DB.events = DB.events.filter(x => x.id !== b.dataset.mdev);
    saveDB(); closeModal(); render();
  });
  md.querySelector('#md-save').onclick = () => {
    const title = md.querySelector('#ev-title').value.trim();
    if (!title) return;
    DB.events.push({ id: uid(), date: md.querySelector('#ev-date').value, title, type: md.querySelector('#ev-type').value });
    saveDB(); closeModal(); render(); toast(t('common.saved'));
  };
}

// ---------- TRACKERS ----------
const TRACKER_LIST = ['resumen', 'mood', 'productivity', 'sleep', 'health', 'period', 'gym', 'habits', 'body'];

function renderTrackers() {
  const trk = UI.trk;
  let html = '<h1 class="page-title">trackers</h1><div class="goal-cat-tabs">';
  TRACKER_LIST.forEach(k => {
    html += '<button class="chip' + (k === trk ? ' on' : '') + '" data-seltrk="' + k + '"' +
      (k === trk ? ' style="background:var(--teal);color:#fff;border-color:var(--teal)"' : '') + '>' + t('trk.' + k).replace(' tracker', '') + '</button>';
  });
  html += '</div>';

  if (trk === 'resumen') return html + renderOverview();
  if (trk === 'habits') return html + renderHabitTracker();
  if (trk === 'body') return html + renderBodyTracker();

  html += '<div class="wk-nav"><button class="btn secondary small" id="ty-prev">‹</button><b>' + UI.trkYear + '</b>' +
    '<button class="btn secondary small" id="ty-next">›</button></div>';
  html += '<div class="card">' + renderLegend(trk) +
    '<div class="muted center">' + t('trk.pickday') + '</div>' +
    renderPixelGrid(trk, UI.trkYear) + '</div>';
  if (trk === 'period') {
    const pred = periodPrediction();
    html += '<div class="card center">' + (pred
      ? '🩸 ' + t('trk.predict') + ': <b>' + fmtDate(pred.next, { year: true }) + '</b><div class="muted">' + t('trk.predictdays') + ': ' + pred.cycle + ' ' + t('today.days') + '</div>'
      : '<span class="muted">' + t('trk.nopredict') + '</span>') + '</div>';
  }
  html += '<div class="card">' + renderStats(trk, UI.trkYear) + '</div>';
  return html;
}

// month overview: one table, one row per day, one column per tracker
const OV_TRACKERS = ['mood', 'productivity', 'sleep', 'gym', 'health', 'period'];

function renderOverview() {
  const { y, m } = UI.habitMonth;
  const months = t('months');
  const dim = daysInMonth(y, m);
  const today = todayISO();
  let html = '<div class="wk-nav"><button class="btn secondary small" id="hm-prev">‹</button><b>' + months[m] + ' ' + y + '</b>' +
    '<button class="btn secondary small" id="hm-next">›</button></div>';
  html += '<div class="card"><div class="pixel-wrap"><table class="pixel"><tr><th></th>';
  OV_TRACKERS.forEach(k => html += '<th style="font-size:9px">' + t('trk.' + k).replace(' tracker', '') + '</th>');
  html += '<th style="font-size:9px">' + t('today.habits') + '</th></tr>';
  for (let d = 1; d <= dim; d++) {
    const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    html += '<tr><td class="rowlbl">' + d + '</td>';
    OV_TRACKERS.forEach(k => {
      const def = TRACKER_DEFS[k];
      const v = DB.trackers[k][iso];
      let style = '', inner = '';
      if (v) {
        if (def.multi) {
          inner = '<div class="multi-halves">' + v.map(x => '<span style="background:' + trkColor(k, x) + '"></span>').join('') + '</div>';
        } else {
          style = 'background:' + trkColor(k, v);
        }
      }
      html += '<td class="cell' + (iso === today ? ' today' : '') + '" data-ovtrk="' + k + '" data-date="' + iso + '" style="' + style + '">' + inner + '</td>';
    });
    // habits column: fraction of habits done that day
    const done = (DB.habitLog[iso] || []).length, total = DB.habits.length;
    const pct = total ? done / total : 0;
    const habStyle = done ? 'background:rgba(91,200,192,' + (0.25 + pct * 0.75).toFixed(2) + ')' : '';
    html += '<td class="cell" style="' + habStyle + ';font-size:9px;text-align:center;color:var(--ink)">' + (done ? done + '/' + total : '') + '</td></tr>';
  }
  html += '</table></div><div class="muted center mt8">' + t('trk.pickday') + '</div></div>';
  return html;
}

function renderHabitTracker() {
  const { y, m } = UI.habitMonth;
  const months = t('months');
  const dim = daysInMonth(y, m);
  let html = '<div class="wk-nav"><button class="btn secondary small" id="hm-prev">‹</button><b>' + months[m] + ' ' + y + '</b>' +
    '<button class="btn secondary small" id="hm-next">›</button></div>';
  html += '<div class="card"><div class="pixel-wrap"><table class="pixel"><tr><th style="text-align:left">·</th>';
  for (let d = 1; d <= dim; d++) html += '<th>' + d + '</th>';
  html += '</tr>';
  DB.habits.forEach(h => {
    html += '<tr><td class="rowlbl" style="white-space:nowrap;font-size:11px">' + esc(h.name) + '</td>';
    for (let d = 1; d <= dim; d++) {
      const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const on = (DB.habitLog[iso] || []).includes(h.id);
      html += '<td class="cell' + (iso === todayISO() ? ' today' : '') + '" data-hab="' + h.id + '" data-date="' + iso + '"' +
        (on ? ' style="background:' + h.color + '"' : '') + '></td>';
    }
    html += '</tr>';
  });
  html += '</table></div></div>';
  // streaks
  html += '<div class="card"><div class="section-title"><span class="st-left">🔥 ' + t('today.streak') + '</span></div><div class="stat-row">';
  DB.habits.forEach(h => {
    html += '<div class="stat"><div class="num">' + habitStreak(h.id) + '</div><div class="lbl">' + esc(h.name) + '</div></div>';
  });
  html += '</div></div>';
  return html;
}

const BODY_FIELDS = ['weight', 'chest', 'armR', 'armL', 'waist', 'hips', 'thighR', 'thighL', 'calfR', 'calfL'];

function renderBodyTracker() {
  const rows = DB.body.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  let html = '<div class="card"><div class="section-title"><span class="st-left">📏 ' + t('trk.body') + '</span>' +
    '<button class="btn small" id="body-add">+ ' + t('trk.addmeasure') + '</button></div>';
  if (rows.length) {
    html += '<div class="body-table-wrap"><table class="body-t"><tr><th></th>' +
      rows.map(r => '<th>' + fmtDate(r.date) + '</th>').join('') + '<th></th></tr>';
    BODY_FIELDS.forEach(f => {
      html += '<tr><th>' + t('body.' + f) + '</th>' + rows.map(r => '<td>' + (r[f] || '–') + '</td>').join('') + '<td></td></tr>';
    });
    html += '<tr><th></th>' + rows.map(r => '<td><button class="tk-del" data-body="' + r.id + '">✕</button></td>').join('') + '<td></td></tr></table></div>';
    // sparkline for waist + weight
    ['waist', 'weight'].forEach(f => {
      const pts = rows.filter(r => r[f]).map(r => Number(r[f]));
      if (pts.length >= 2) html += '<div class="muted mt8">' + t('body.' + f) + '</div>' + sparkline(pts);
    });
  } else {
    html += '<div class="empty">📏 ✍️</div>';
  }
  html += '</div>';
  return html;
}

function sparkline(pts) {
  const w = 300, h = 100, pad = 10;
  const mn = Math.min(...pts), mx = Math.max(...pts);
  const rng = (mx - mn) || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const xy = pts.map((p, i) => [pad + i * step, h - pad - ((p - mn) / rng) * (h - pad * 2)]);
  const path = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '"><path d="' + path + '" fill="none" stroke="var(--teal)" stroke-width="2.5"/>' +
    xy.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="var(--teal)"/><text x="' + p[0] + '" y="' + (p[1] - 7) + '" font-size="9" text-anchor="middle" fill="var(--ink-soft)">' + pts[i] + '</text>').join('') + '</svg>';
}

function bindTrackers(root) {
  root.querySelectorAll('[data-seltrk]').forEach(btn => btn.onclick = () => { UI.trk = btn.dataset.seltrk; render(); });
  const yp = root.querySelector('#ty-prev'), yn = root.querySelector('#ty-next');
  if (yp) yp.onclick = () => { UI.trkYear--; render(); };
  if (yn) yn.onclick = () => { UI.trkYear++; render(); };
  const hp = root.querySelector('#hm-prev'), hn = root.querySelector('#hm-next');
  if (hp) hp.onclick = () => { UI.habitMonth.m--; if (UI.habitMonth.m < 0) { UI.habitMonth.m = 11; UI.habitMonth.y--; } render(); };
  if (hn) hn.onclick = () => { UI.habitMonth.m++; if (UI.habitMonth.m > 11) { UI.habitMonth.m = 0; UI.habitMonth.y++; } render(); };

  if (UI.trk === 'resumen') {
    root.querySelectorAll('td.cell[data-ovtrk]').forEach(td => td.onclick = () => openPixelPicker(td.dataset.ovtrk, td.dataset.date));
    return;
  }
  if (UI.trk === 'habits') {
    root.querySelectorAll('td.cell[data-hab]').forEach(td => td.onclick = () => {
      const iso = td.dataset.date, id = td.dataset.hab;
      const log = DB.habitLog[iso] || (DB.habitLog[iso] = []);
      const i = log.indexOf(id);
      if (i >= 0) log.splice(i, 1); else log.push(id);
      saveDB(); render();
    });
    return;
  }
  if (UI.trk === 'body') {
    const add = root.querySelector('#body-add');
    if (add) add.onclick = openBodyModal;
    root.querySelectorAll('[data-body]').forEach(b => b.onclick = () => {
      DB.body = DB.body.filter(x => x.id !== b.dataset.body);
      saveDB(); render();
    });
    return;
  }
  root.querySelectorAll('td.cell[data-date]').forEach(td => td.onclick = () => openPixelPicker(UI.trk, td.dataset.date));
}

function openPixelPicker(trk, iso) {
  const def = TRACKER_DEFS[trk];
  const v = DB.trackers[trk][iso];
  let html = '<div class="modal-title">' + t('trk.' + trk) + ' · ' + fmtDate(iso, { year: true }) + '<button class="icon-btn" id="md-x">✕</button></div><div class="qt-opts">';
  def.options.forEach(o => {
    const on = def.multi ? (v || []).includes(o.id) : v === o.id;
    html += '<button class="qt-opt' + (on ? ' on' : '') + '" data-pk="' + o.id + '" style="padding:12px 14px">' +
      '<span class="dot" style="background:' + o.color + '"></span>' + trkLabel(trk, o.id) + '</button>';
  });
  html += '</div><div class="modal-actions"><button class="btn secondary" id="md-clear">' + t('trk.clear') + '</button></div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = closeModal;
  md.querySelector('#md-clear').onclick = () => { clearTrackerDay(trk, iso); closeModal(); render(); };
  md.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => {
    setTrackerValue(trk, iso, b.dataset.pk);
    if (def.multi) { openPixelPicker(trk, iso); } else { closeModal(); render(); }
  });
}

function openBodyModal() {
  let html = '<div class="modal-title">' + t('trk.addmeasure') + '<button class="icon-btn" id="md-x">✕</button></div>' +
    '<label class="fld">' + t('ev.date') + '</label><input type="date" id="bd-date" value="' + todayISO() + '">';
  BODY_FIELDS.forEach(f => {
    html += '<label class="fld">' + t('body.' + f) + '</label><input type="number" step="0.1" id="bd-' + f + '" inputmode="decimal">';
  });
  html += '<div class="modal-actions"><button class="btn secondary" id="md-cancel">' + t('common.cancel') + '</button>' +
    '<button class="btn" id="md-save">' + t('common.save') + '</button></div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = md.querySelector('#md-cancel').onclick = closeModal;
  md.querySelector('#md-save').onclick = () => {
    const row = { id: uid(), date: md.querySelector('#bd-date').value };
    BODY_FIELDS.forEach(f => { const v = md.querySelector('#bd-' + f).value; if (v) row[f] = v; });
    DB.body.push(row); saveDB(); closeModal(); render(); toast(t('common.saved'));
  };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
