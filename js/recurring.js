// ===== Rutinas: tareas que se agendan solas =====
// Gym, intercambio de idiomas, retro de fin de mes, revisión trimestral...
// Se definen una vez y la app las va sembrando en el calendario.

const REC_DIAS_ADELANTE = 60;   // cuánto futuro se siembra

// ---- reglas ----
// { t:'w', days:[1,4] }   semanal en esos días (0=domingo … 6=sábado)
// { t:'m', day:15 }       mensual el día 15
// { t:'m', day:'last' }   mensual el último día del mes
// { t:'q' }               trimestral: último día de marzo, junio, sept y dic

function ultimoDiaMes(y, m) { return new Date(y, m + 1, 0).getDate(); }

function recAplica(rule, iso) {
  const d = fromISO(iso);
  if (!rule) return false;
  if (rule.t === 'w') return (rule.days || []).includes(d.getDay());
  if (rule.t === 'm') {
    const ultimo = ultimoDiaMes(d.getFullYear(), d.getMonth());
    const objetivo = rule.day === 'last' ? ultimo : Math.min(Number(rule.day) || 1, ultimo);
    return d.getDate() === objetivo;
  }
  if (rule.t === 'q') {
    const cierres = [2, 5, 8, 11];  // marzo, junio, septiembre, diciembre
    return cierres.includes(d.getMonth()) &&
           d.getDate() === ultimoDiaMes(d.getFullYear(), d.getMonth());
  }
  return false;
}

// texto legible de la regla, para la lista de rutinas
function recDescripcion(rule) {
  if (!rule) return '';
  if (rule.t === 'w') {
    const nombres = t('days.long');
    const ds = (rule.days || []).slice().sort();
    if (!ds.length) return t('rec.nodays');
    if (ds.length === 7) return t('rec.daily');
    if (ds.join() === '1,2,3,4,5') return t('rec.weekdays');
    return ds.map(i => nombres[i].slice(0, 3)).join(', ');
  }
  if (rule.t === 'm') {
    return rule.day === 'last' ? t('rec.monthlast') : t('rec.monthday').replace('{d}', rule.day);
  }
  if (rule.t === 'q') return t('rec.quarter');
  return '';
}

// El id es determinista (misma rutina + mismo día = mismo id) para que dos
// dispositivos generen exactamente la misma tarea y la fusión no duplique.
function recTaskId(rid, iso) { return 'r_' + rid + '_' + iso; }

// Siembra las tareas de las rutinas en los próximos días.
// Respeta lo borrado (tombstones) y nunca pisa lo que ella ya editó.
function materializeRecurring() {
  const rutinas = DB.recurring || [];
  if (!rutinas.length) return 0;
  const tombs = new Set(DB.tombstones || []);
  const hoy = todayISO();
  let creadas = 0;
  for (let i = 0; i < REC_DIAS_ADELANTE; i++) {
    const iso = addDays(hoy, i);
    rutinas.forEach(r => {
      if (!recAplica(r.rule, iso)) return;
      if (r.until && iso > r.until) return;
      const id = recTaskId(r.id, iso);
      if (tombs.has('task:' + iso + ':' + id)) return;      // ella la borró: no revive
      const lista = DB.tasks[iso] || (DB.tasks[iso] = []);
      if (lista.some(x => x.id === id)) return;             // ya existe
      const tk = { id: id, title: r.title, done: false, rid: r.id };
      if (r.time) tk.time = r.time;
      if (r.cat) tk.cat = r.cat;
      if (r.place) tk.place = r.place;
      if (r.notes) tk.notes = r.notes;
      stamp(tk);
      lista.push(tk);
      creadas++;
    });
  }
  if (creadas) saveDB();
  return creadas;
}

// ---------- pantalla de rutinas ----------
function openRoutines() {
  const rs = DB.recurring || [];
  let html = '<div class="modal-title">🔁 ' + t('rec.title') + '<button class="icon-btn" id="md-x">✕</button></div>' +
    '<div class="muted" style="font-size:13px">' + t('rec.hint') + '</div>';
  if (rs.length) {
    html += '<div style="margin-top:10px">' + rs.map(r => {
      const cat = catById(r.cat);
      return '<div class="task" data-recrow="' + r.id + '"' +
        (cat ? ' style="border-left:4px solid ' + cat.color + ';padding-left:8px;margin-left:-4px"' : '') + '>' +
        '<span class="tk-main"><span class="tk-title">' + esc(r.title) + '</span>' +
        '<span class="tk-meta">🔁 ' + esc(recDescripcion(r.rule)) + (r.time ? ' · 🕐 ' + r.time : '') + '</span></span>' +
        '<button class="tk-move rec-edit">✏️</button>' +
        '<button class="tk-del rec-del">✕</button></div>';
    }).join('') + '</div>';
  } else {
    html += '<div class="empty">' + t('rec.empty') + '</div>';
  }
  html += '<button class="btn" id="rec-add" style="width:100%;margin-top:12px">+ ' + t('rec.add') + '</button>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = () => { closeModal(); render(); };
  md.querySelector('#rec-add').onclick = () => openRoutineForm(null);
  md.querySelectorAll('[data-recrow]').forEach(row => {
    const id = row.dataset.recrow;
    row.querySelector('.rec-edit').onclick = () => openRoutineForm(id);
    row.querySelector('.tk-main').onclick = () => openRoutineForm(id);
    row.querySelector('.rec-del').onclick = () => {
      if (!confirm(t('rec.delconfirm'))) return;
      borrarRutina(id);
      openRoutines();
    };
  });
}

// borra la rutina y sus tareas futuras que siguen sin tocar
function borrarRutina(id) {
  tomb('rec:' + id);
  DB.recurring = (DB.recurring || []).filter(r => r.id !== id);
  const hoy = todayISO();
  for (const d in DB.tasks) {
    if (d < hoy) continue;                       // el pasado se conserva como registro
    DB.tasks[d] = DB.tasks[d].filter(tk => {
      if (tk.rid !== id || tk.done) return true; // lo ya hecho no se borra
      tomb('task:' + d + ':' + tk.id);
      return false;
    });
    if (!DB.tasks[d].length) delete DB.tasks[d];
  }
  saveDB();
}

function openRoutineForm(recId) {
  const r = recId ? (DB.recurring || []).find(x => x.id === recId) : null;
  const rule = (r && r.rule) || { t: 'w', days: [] };
  const dias = t('days.short'), dlong = t('days.long');
  let html = '<div class="modal-title">🔁 ' + (r ? t('rec.edit') : t('rec.add')) + '<button class="icon-btn" id="md-x">✕</button></div>' +
    '<label class="fld">' + t('task.title') + '</label><input type="text" id="rc-title" value="' + (r ? esc(r.title) : '') + '" placeholder="' + t('rec.ph') + '">' +
    '<label class="fld">🎨 ' + t('cat.category') + '</label>' + catSelectHTML('rc-cat', r ? r.cat : UI.lastCat) +
    '<label class="fld">🕐 ' + t('task.time') + '</label><input type="time" id="rc-time" value="' + (r && r.time ? r.time : '') + '">' +
    '<label class="fld">🔁 ' + t('rec.when') + '</label>' +
    '<select id="rc-type">' +
    '<option value="w"' + (rule.t === 'w' ? ' selected' : '') + '>' + t('rec.weekly') + '</option>' +
    '<option value="m"' + (rule.t === 'm' ? ' selected' : '') + '>' + t('rec.monthly') + '</option>' +
    '<option value="q"' + (rule.t === 'q' ? ' selected' : '') + '>' + t('rec.quarterly') + '</option>' +
    '</select>' +
    // semanal: días de la semana (lunes primero, como su agenda)
    '<div id="rc-weekly" class="rc-block"><div class="rc-days">' +
    [1, 2, 3, 4, 5, 6, 0].map(i =>
      '<button class="chip rc-day' + ((rule.days || []).includes(i) ? ' on' : '') + '" data-day="' + i + '" title="' + dlong[i] + '">' + dias[(i + 6) % 7] + '</button>'
    ).join('') + '</div></div>' +
    // mensual: día del mes
    '<div id="rc-monthly" class="rc-block"><select id="rc-mday">' +
    '<option value="last"' + (rule.t === 'm' && rule.day === 'last' ? ' selected' : '') + '>' + t('rec.monthlast') + '</option>' +
    Array.from({ length: 28 }, (_, k) => k + 1).map(d =>
      '<option value="' + d + '"' + (rule.t === 'm' && Number(rule.day) === d ? ' selected' : '') + '>' + t('rec.monthday').replace('{d}', d) + '</option>'
    ).join('') + '</select></div>' +
    '<div id="rc-quarterly" class="rc-block muted" style="font-size:13px">' + t('rec.quarterhint') + '</div>' +
    detailsHTML('rc-place', 'rc-notes', r || {}) +
    '<div class="modal-actions">' +
    (r ? '<button class="btn danger" id="rc-delete">🗑</button>' : '') +
    '<button class="btn secondary" id="md-cancel">' + t('common.cancel') + '</button>' +
    '<button class="btn" id="md-save" style="flex:2">' + t('common.save') + '</button></div>';
  openModal(html);
  const md = document.getElementById('modal-card');

  const pintarBloques = () => {
    const tipo = md.querySelector('#rc-type').value;
    md.querySelector('#rc-weekly').style.display = tipo === 'w' ? '' : 'none';
    md.querySelector('#rc-monthly').style.display = tipo === 'm' ? '' : 'none';
    md.querySelector('#rc-quarterly').style.display = tipo === 'q' ? '' : 'none';
  };
  pintarBloques();
  md.querySelector('#rc-type').onchange = pintarBloques;
  md.querySelectorAll('.rc-day').forEach(b => b.onclick = () => b.classList.toggle('on'));
  md.querySelector('#md-x').onclick = md.querySelector('#md-cancel').onclick = openRoutines;
  if (r) md.querySelector('#rc-delete').onclick = () => {
    if (!confirm(t('rec.delconfirm'))) return;
    borrarRutina(r.id);
    openRoutines();
  };

  md.querySelector('#md-save').onclick = () => {
    const title = md.querySelector('#rc-title').value.trim();
    if (!title) return;
    const tipo = md.querySelector('#rc-type').value;
    let nuevaRegla;
    if (tipo === 'w') {
      const days = [...md.querySelectorAll('.rc-day.on')].map(b => Number(b.dataset.day));
      if (!days.length) { toast(t('rec.pickday')); return; }
      nuevaRegla = { t: 'w', days: days };
    } else if (tipo === 'm') {
      const v = md.querySelector('#rc-mday').value;
      nuevaRegla = { t: 'm', day: v === 'last' ? 'last' : Number(v) };
    } else {
      nuevaRegla = { t: 'q' };
    }
    const obj = r || { id: uid() };
    const reglaCambio = JSON.stringify(obj.rule || {}) !== JSON.stringify(nuevaRegla);
    obj.title = title;
    obj.rule = nuevaRegla;
    const cat = md.querySelector('.rc-cat').value;
    if (cat) obj.cat = cat; else delete obj.cat;
    const tm = md.querySelector('#rc-time').value;
    if (tm) obj.time = tm; else delete obj.time;
    const pl = md.querySelector('#rc-place').value.trim();
    if (pl) obj.place = pl; else delete obj.place;
    const nt = md.querySelector('#rc-notes').value.trim();
    if (nt) obj.notes = nt; else delete obj.notes;
    stamp(obj);
    if (!r) (DB.recurring || (DB.recurring = [])).push(obj);
    // si cambió el patrón, se limpian las futuras sin tocar y se vuelven a sembrar
    if (reglaCambio) limpiarFuturasDe(obj.id);
    saveDB();
    const n = materializeRecurring();
    openRoutines();
    toast('🔁 ' + t('rec.scheduled').replace('{n}', n));
  };
}

// quita las instancias futuras aún no completadas (sin dejar tombstone,
// para que el patrón nuevo pueda volver a usar esos días)
function limpiarFuturasDe(rid) {
  const hoy = todayISO();
  for (const d in DB.tasks) {
    if (d < hoy) continue;
    DB.tasks[d] = DB.tasks[d].filter(tk => !(tk.rid === rid && !tk.done));
    if (!DB.tasks[d].length) delete DB.tasks[d];
  }
}
