// ===== Puntos, niveles y recompensas =====
// Inspirado en Skillion, con una diferencia de fondo: aquí los puntos SOLO
// suman. No hay vidas que perder ni castigo por fallar un día — un día malo
// vale cero, nunca negativo.
//
// Los puntos no se guardan: se DERIVAN de lo que ya está en la agenda (tareas
// hechas, hábitos marcados, entrenos, tráfico tachado, metas cumplidas). Así no
// hay forma de contarlos dos veces ni de que dos dispositivos se peleen por el
// saldo. Lo único que se guarda es lo que ella define y gasta: las recompensas
// y los canjes.

const PUNTOS = {
  tarea: 10,      // una tarea tachada
  trafico: 25,    // una prioridad de la semana cumplida (vale más: la eligió ella)
  habito: 5,      // un hábito marcado en el día
  gym: 20,        // un entreno registrado (descanso no cuenta... y no resta)
  hito: 50,       // un hito de meta cumplido
  meta: 200,      // una meta del año cumplida
  semana: 100     // bono por llegar a la meta semanal de puntos
};

const GAME_DEFAULTS = { on: true, meta: 300, rewards: [], claims: [], desde: null };

// Recompensas de arranque: son ejemplos para que edite, no un plan.
function seedRewards() {
  return [
    { id: uid(), title: 'Un capítulo de una serie, sin culpa', price: 150, mt: Date.now() },
    { id: uid(), title: 'Pedir comida de afuera', price: 400, mt: Date.now() },
    { id: uid(), title: 'Una tarde libre: ni portafolio ni freelance', price: 600, mt: Date.now() },
    { id: uid(), title: 'Algo lindo para el cuarto o la oficina', price: 1200, mt: Date.now() },
    { id: uid(), title: 'Un día entero sin agenda', price: 1500, mt: Date.now() }
  ];
}

function ensureGame() {
  const g = DB.game || (DB.game = {});
  for (const k in GAME_DEFAULTS) if (g[k] === undefined) g[k] = JSON.parse(JSON.stringify(GAME_DEFAULTS[k]));
  // Las monedas se cuentan desde el día que estrena el sistema: sus niveles sí
  // reflejan todo el año (es bonito ver lo que ya hizo), pero no quiero que
  // empiece con el monedero lleno por metas que cumplió hace meses.
  // Arranca el lunes de la semana en que lo estrena: así cuenta la semana
  // completa (el tráfico suma en el lunes de su semana) y no empieza a medias.
  if (!g.desde) { g.desde = weekStartISO(todayISO()); }
  if (!g.seeded) { g.rewards = seedRewards(); g.seeded = true; saveDB(); }
  return g;
}

// ---- recolección (cache: se recalcula cuando cambia la base) ----
let _ptsCache = null;
function invalidarPuntos() { _ptsCache = null; }

function recolectar() {
  if (_ptsCache) return _ptsCache;
  const porDia = {};        // 'YYYY-MM-DD' -> puntos de ese día
  const porCat = {};        // catId -> xp de por vida
  let constancia = 0;       // hábitos + gym: la habilidad de sostener
  let total = 0;

  const sumar = (iso, pts, cat) => {
    if (!pts) return;
    porDia[iso] = (porDia[iso] || 0) + pts;
    total += pts;
    if (cat) porCat[cat] = (porCat[cat] || 0) + pts;
  };

  for (const iso in (DB.tasks || {})) {
    (DB.tasks[iso] || []).forEach(tk => { if (tk.done) sumar(iso, PUNTOS.tarea, tk.cat); });
  }
  for (const k in (DB.trafico || {})) {
    const iso = k.slice(1);   // la clave es 'N'+lunes de esa semana
    (DB.trafico[k] || []).forEach(it => { if (it.done) sumar(iso, PUNTOS.trafico, it.cat); });
  }
  for (const iso in (DB.habitLog || {})) {
    const n = (DB.habitLog[iso] || []).length;
    if (n) { sumar(iso, PUNTOS.habito * n); constancia += PUNTOS.habito * n; }
  }
  const gym = (DB.trackers || {}).gym || {};
  for (const iso in gym) {
    if (gym[iso] && gym[iso] !== 'rest') { sumar(iso, PUNTOS.gym); constancia += PUNTOS.gym; }
  }
  // metas: no tienen fecha de cumplimiento, así que cuentan en el total y en su
  // categoría, pero no empujan la semana (no sabríamos de qué semana son)
  (DB.goals || []).forEach(g => {
    const cat = catIdDeMeta(g.category);
    (g.milestones || []).forEach(m => { if (m.done) { total += PUNTOS.hito; if (cat) porCat[cat] = (porCat[cat] || 0) + PUNTOS.hito; } });
    if (g.done) { total += PUNTOS.meta; if (cat) porCat[cat] = (porCat[cat] || 0) + PUNTOS.meta; }
  });

  _ptsCache = { porDia, porCat, constancia, total };
  return _ptsCache;
}

// las metas guardan su categoría por nombre ('personal', 'work'...): se busca
// la categoría de la app que le corresponda, y si no hay, no pasa nada
function catIdDeMeta(nombre) {
  if (!nombre) return null;
  const c = (DB.categories || []).find(x => (x.name || '').toLowerCase() === String(nombre).toLowerCase());
  return c ? c.id : null;
}

function puntosSemana(ws) {
  const p = recolectar().porDia;
  let n = 0;
  for (let i = 0; i < 7; i++) n += p[addDays(ws, i)] || 0;
  return n;
}

// semanas desde que estrenó el sistema en las que llegó a la meta: cada una da bono
function semanasCumplidas() {
  const g = ensureGame();
  const desdeWs = weekStartISO(g.desde || todayISO());
  const p = recolectar().porDia;
  const porSemana = {};
  for (const iso in p) {
    const ws = weekStartISO(iso);
    if (ws < desdeWs) continue;
    porSemana[ws] = (porSemana[ws] || 0) + p[iso];
  }
  let n = 0;
  for (const ws in porSemana) if (porSemana[ws] >= g.meta) n++;
  return n;
}

function gastado() {
  return (ensureGame().claims || []).reduce((s, c) => s + (c.price || 0), 0);
}

// Monedas ganadas: solo lo hecho a partir del día que estrenó el sistema.
// Las metas del año no dan monedas (no tienen fecha de cumplimiento), pero sí
// cuentan para los niveles.
function monedasGanadas() {
  const g = ensureGame();
  const desde = g.desde || todayISO();
  const p = recolectar().porDia;
  let n = 0;
  for (const iso in p) if (iso >= desde) n += p[iso];
  return n + PUNTOS.semana * semanasCumplidas();
}

// saldo para canjear
function monedas() {
  return Math.max(0, monedasGanadas() - gastado());
}

// Nivel por XP: rápido al principio, cada vez más lento.
// L2 a los 25, L3 a los 100, L4 a los 225, L5 a los 400...
function nivelDe(xp) {
  const n = Math.floor(Math.sqrt((xp || 0) / 25)) + 1;
  const ini = 25 * Math.pow(n - 1, 2);
  const fin = 25 * Math.pow(n, 2);
  return { nivel: n, en: (xp || 0) - ini, falta: fin - (xp || 0), tramo: fin - ini };
}

function barraHTML(hecho, total, color) {
  const pct = Math.max(0, Math.min(100, total ? Math.round(hecho * 100 / total) : 0));
  return '<div class="gm-bar"><div class="gm-fill" style="width:' + pct + '%' +
    (color ? ';background:' + color : '') + '"></div></div>';
}

// ---- tarjeta compacta en Hoy ----
function gameCardHTML() {
  const g = ensureGame();
  if (!g.on) return '';
  const ws = weekStartISO(todayISO());
  const pts = puntosSemana(ws);
  const listo = pts >= g.meta;
  return '<div class="card gm-card"><div class="section-title">' +
    '<span class="st-left">🎮 ' + t('game.week') + '</span>' +
    '<button class="btn secondary small gm-open">🪙 ' + monedas() + '</button></div>' +
    barraHTML(pts, g.meta) +
    '<div class="gm-line">' +
    (listo ? '🎉 <b>' + t('game.reached') + '</b> ' + t('game.bonus').replace('{n}', PUNTOS.semana)
           : '<b>' + pts + '</b> / ' + g.meta + ' · ' + t('game.togo').replace('{n}', g.meta - pts)) +
    '</div></div>';
}

function bindGameCard(root) {
  const b = root.querySelector('.gm-open');
  if (b) b.onclick = openGame;
}

// ---- panel completo ----
function openGame() {
  const g = ensureGame();
  const r = recolectar();
  const ws = weekStartISO(todayISO());
  const pts = puntosSemana(ws);

  let html = '<div class="modal-title">🎮 ' + t('game.title') + '<button class="icon-btn" id="md-x">✕</button></div>';

  // semana
  html += '<div class="gm-block"><div class="gm-head"><b>' + t('game.week') + '</b>' +
    '<span>' + pts + ' / ' + g.meta + '</span></div>' + barraHTML(pts, g.meta) +
    '<label class="fld">' + t('game.goal') + '</label>' +
    '<input type="number" id="gm-meta" min="50" step="50" value="' + g.meta + '">' +
    '<div class="muted" style="font-size:12px;margin-top:4px">' + t('game.goalhint') + '</div></div>';

  // niveles
  const skills = (DB.categories || [])
    .map(c => ({ name: c.name, color: c.color, xp: r.porCat[c.id] || 0 }))
    .filter(s => s.xp > 0)
    .sort((a, b) => b.xp - a.xp);
  skills.push({ name: t('game.consistency'), color: '#f5c85c', xp: r.constancia });
  html += '<div class="gm-block"><b>' + t('game.levels') + '</b>';
  skills.forEach(s => {
    const n = nivelDe(s.xp);
    html += '<div class="gm-skill"><div class="gm-head">' +
      '<span>' + esc(s.name) + ' <span class="gm-lv">' + t('game.lvl') + ' ' + n.nivel + '</span></span>' +
      '<span class="muted">' + s.xp + ' xp</span></div>' +
      barraHTML(n.en, n.tramo, s.color) + '</div>';
  });
  html += '</div>';

  // tienda
  html += '<div class="gm-block"><div class="gm-head"><b>' + t('game.shop') + '</b>' +
    '<span class="gm-coins">🪙 ' + monedas() + '</span></div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:6px">' + t('game.shophint') + '</div>';
  (g.rewards || []).forEach(rw => {
    const puede = monedas() >= rw.price;
    html += '<div class="task gm-rw" data-rw="' + rw.id + '">' +
      '<span class="tk-main"><span class="tk-title">' + esc(rw.title) + '</span>' +
      '<span class="tk-meta">🪙 ' + rw.price + '</span></span>' +
      '<button class="btn small gm-claim"' + (puede ? '' : ' disabled') + '>' + t('game.claim') + '</button>' +
      '<button class="tk-del gm-rw-del">✕</button></div>';
  });
  html += '<div class="add-row"><input type="text" id="gm-new" placeholder="' + esc(t('game.newrw')) + '">' +
    '<input type="number" id="gm-new-p" class="gm-price" min="10" step="10" placeholder="🪙">' +
    '<button class="btn" id="gm-add">+</button></div></div>';

  // canjes
  const cl = (g.claims || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  if (cl.length) {
    html += '<div class="gm-block"><b>' + t('game.claimed') + '</b>' +
      cl.map(c => '<div class="gm-claimed">🎁 ' + esc(c.title) + ' <span class="muted">· ' + fmtDate(c.date) + '</span></div>').join('') +
      '</div>';
  }

  html += '<div class="gm-block"><label class="gm-off"><input type="checkbox" id="gm-on"' + (g.on ? ' checked' : '') + '> ' +
    t('game.enabled') + '</label></div>';

  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = () => { closeModal(); render(); };
  md.querySelector('#gm-meta').onchange = e => {
    const v = Math.max(50, Number(e.target.value) || 300);
    g.meta = v; stampKey('game'); saveDB(); openGame();
  };
  md.querySelector('#gm-on').onchange = e => { g.on = e.target.checked; stampKey('game'); saveDB(); };
  const add = () => {
    const ti = md.querySelector('#gm-new'), pi = md.querySelector('#gm-new-p');
    const title = ti.value.trim(), price = Number(pi.value) || 0;
    if (!title || price <= 0) return;
    g.rewards.push(stamp({ id: uid(), title: title, price: price }));
    saveDB(); openGame();
  };
  md.querySelector('#gm-add').onclick = add;
  md.querySelector('#gm-new').onkeydown = e => { if (e.key === 'Enter') add(); };
  md.querySelectorAll('.gm-rw').forEach(row => {
    const id = row.dataset.rw;
    const rw = (g.rewards || []).find(x => x.id === id);
    if (!rw) return;
    row.querySelector('.gm-rw-del').onclick = () => {
      tomb('rw:' + id);
      g.rewards = g.rewards.filter(x => x.id !== id);
      saveDB(); openGame();
    };
    row.querySelector('.gm-claim').onclick = () => {
      if (monedas() < rw.price) return;
      g.claims.push(stamp({ id: uid(), rewardId: id, title: rw.title, price: rw.price, date: todayISO() }));
      saveDB();
      toast('🎁 ' + t('game.enjoy'));
      openGame();
    };
  });
}
