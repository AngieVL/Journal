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
  // Una tarea vale poco a propósito: ella parte los proyectos en pasos muy
  // chiquitos (un background = una tarea), así que el volumen de tareas mide
  // cuánto trocea, no cuánto avanza. Lo que mueve la semana es el tráfico.
  tarea: 5,       // una tarea tachada
  trafico: 50,    // una prioridad de la semana cumplida (vale más: la eligió ella)
  habito: 5,      // un hábito marcado en el día
  gym: 20,        // un entreno registrado (descanso no cuenta... y no resta)
  hito: 50,       // un hito de meta cumplido
  meta: 200,      // una meta del año cumplida
  semana: 100     // bono por llegar a la meta semanal de puntos
};

// Peso: lavar el casco y terminar un proyecto no pueden valer lo mismo.
// Se marca donde importa y se deja en normal donde da igual.
const PESOS = { l: 0.5, n: 1, p: 3 };
const PESO_ORDEN = ['l', 'n', 'p'];
const PESO_ICONO = { l: '•', n: '••', p: '•••' };
function pesoDe(o) { return PESOS[(o && o.w) || 'n'] || 1; }
function pesoSiguiente(w) { return PESO_ORDEN[(PESO_ORDEN.indexOf(w || 'n') + 1) % 3]; }

function pesoSelectHTML(id, actual, base) {
  return '<select id="' + id + '">' + PESO_ORDEN.map(w =>
    '<option value="' + w + '"' + ((actual || 'n') === w ? ' selected' : '') + '>' +
    PESO_ICONO[w] + '  ' + t('peso.' + w) + ' · ' + Math.round(base * PESOS[w]) + ' pts</option>').join('') +
    '</select>';
}

const GAME_DEFAULTS = { on: true, meta: 500, rewards: [], claims: [], desde: null };

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
  // v35 lo fijaba en "hoy" y no en el lunes: la barra contaba desde el lunes y
  // las monedas desde el martes, y los dos números no cuadraban.
  else if (g.desde !== weekStartISO(g.desde)) { g.desde = weekStartISO(g.desde); saveDB(); }
  if (!g.seeded) { g.rewards = seedRewards(); g.seeded = true; saveDB(); }
  // La primera meta (300) salió a ojo y le quedó corta: una semana suya llegaba
  // a eso sin cerrar ninguna prioridad. Se sube una vez; de ahí en adelante la
  // cambia ella, con el botón de sugerencia que mira su propio historial.
  if (!g.calibrado) { if (g.meta <= 300) g.meta = 500; g.calibrado = true; saveDB(); }
  return g;
}

// Mediana de sus últimas semanas cerradas, para sugerirle una meta con datos
// suyos en vez de un número inventado.
function metaSugerida() {
  const g = DB.game || {};
  const p = recolectar().porDia;
  const hoyWs = weekStartISO(todayISO());
  const desdeWs = weekStartISO(g.desde || todayISO());
  const porSemana = {};
  for (const iso in p) {
    const ws = weekStartISO(iso);
    if (ws >= hoyWs) continue;                 // la semana en curso no cuenta: está a medias
    if (ws < desdeWs) continue;                // antes del sistema no había tráfico ni pesos: no compara
    porSemana[ws] = (porSemana[ws] || 0) + p[iso];
  }
  const v = Object.keys(porSemana).sort().slice(-8).map(k => porSemana[k]).sort((a, b) => a - b);
  if (v.length < 3) return null;               // sin historial suficiente no se inventa nada
  const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return { mediana: Math.round(med), meta: Math.max(100, Math.round(med * 1.3 / 25) * 25), semanas: v.length };
}

// ---- recolección (cache: se recalcula cuando cambia la base) ----
let _ptsCache = null;
function invalidarPuntos() { _ptsCache = null; }

const FUENTES = ['tarea', 'trafico', 'habito', 'gym', 'hito'];

function recolectar() {
  if (_ptsCache) return _ptsCache;
  const porDia = {};        // 'YYYY-MM-DD' -> puntos de ese día
  const porFuente = {};     // 'YYYY-MM-DD' -> {tarea:n, habito:n, ...} para poder explicar de dónde salen

  const sumar = (iso, bruto, fuente) => {
    const pts = Math.round(bruto);          // nada de medios puntos por ahí
    if (!pts || !iso) return;
    porDia[iso] = (porDia[iso] || 0) + pts;
    const f = porFuente[iso] || (porFuente[iso] = {});
    f[fuente] = (f[fuente] || 0) + pts;
  };

  for (const iso in (DB.tasks || {})) {
    (DB.tasks[iso] || []).forEach(tk => { if (tk.done) sumar(iso, PUNTOS.tarea * pesoDe(tk), 'tarea'); });
  }
  for (const k in (DB.trafico || {})) {
    const iso = k.slice(1);   // la clave es 'N'+lunes de esa semana
    (DB.trafico[k] || []).forEach(it => { if (it.done) sumar(iso, PUNTOS.trafico * pesoDe(it), 'trafico'); });
  }
  for (const iso in (DB.habitLog || {})) {
    const n = (DB.habitLog[iso] || []).length;
    if (n) sumar(iso, PUNTOS.habito * n, 'habito');
  }
  const gym = (DB.trackers || {}).gym || {};
  for (const iso in gym) {
    if (gym[iso] && gym[iso] !== 'rest') sumar(iso, PUNTOS.gym, 'gym');
  }
  // metas e hitos: solo los que guardaron la fecha en que se cumplieron
  (DB.goals || []).forEach(g => {
    (g.milestones || []).forEach(m => { if (m.done && m.doneAt) sumar(m.doneAt, PUNTOS.hito, 'hito'); });
    if (g.done && g.doneAt) sumar(g.doneAt, PUNTOS.meta, 'hito');
  });

  _ptsCache = { porDia, porFuente };
  return _ptsCache;
}

// de dónde salieron los puntos de una semana, para poder mostrárselo
function desgloseSemana(ws) {
  const pf = recolectar().porFuente;
  const out = {};
  for (let i = 0; i < 7; i++) {
    const f = pf[addDays(ws, i)] || {};
    for (const k in f) out[k] = (out[k] || 0) + f[k];
  }
  return out;
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
    '<span class="gm-reset">' + t('game.resets') + '</span></div>' +
    barraHTML(pts, g.meta) +
    '<div class="gm-line">' +
    (listo ? '🎉 <b>' + t('game.reached') + '</b> ' + t('game.bonus').replace('{n}', PUNTOS.semana)
           : '<b>' + pts + '</b> / ' + g.meta + ' · ' + t('game.togo').replace('{n}', g.meta - pts)) +
    '</div>' +
    '<button class="gm-wallet gm-open">🪙 <b>' + monedas() + '</b> ' + t('game.saved') + ' <span>›</span></button>' +
    '</div>';
}

// una línea por fuente: para que se vea que los hábitos sí suman
function desgloseHTML(ws) {
  const d = desgloseSemana(ws);
  const filas = FUENTES.filter(k => d[k]).map(k =>
    '<div class="gm-src"><span>' + t('game.src.' + k) + '</span><b>' + Math.round(d[k]) + '</b></div>');
  return filas.length ? '<div class="gm-srcs">' + filas.join('') + '</div>' : '';
}

function bindGameCard(root) {
  const b = root.querySelector('.gm-open');
  if (b) b.onclick = openGame;
}

// ---- panel completo ----
function openGame() {
  const g = ensureGame();
  const ws = weekStartISO(todayISO());
  const pts = puntosSemana(ws);
  const sug = metaSugerida();

  let html = '<div class="modal-title">🎮 ' + t('game.title') + '<button class="icon-btn" id="md-x">✕</button></div>';

  // semana
  html += '<div class="gm-block"><div class="gm-head"><b>' + t('game.week') + '</b>' +
    '<span>' + pts + ' / ' + g.meta + '</span></div>' + barraHTML(pts, g.meta) +
    desgloseHTML(ws) +
    '<label class="fld">' + t('game.goal') + '</label>' +
    '<div class="add-row"><input type="number" id="gm-meta" min="50" step="25" value="' + g.meta + '">' +
    '<button class="btn secondary small" id="gm-sug">' + t('game.suggest') + '</button></div>' +
    (sug ? '<div class="gm-exp">' + t('game.median').replace('{n}', sug.mediana).replace('{s}', sug.semanas) +
      ' → ' + sug.meta + '</div>' : '') +
    '<div class="gm-exp">' + t('game.goalhint') + '</div></div>';

  // tienda
  html += '<div class="gm-block"><div class="gm-head"><b>' + t('game.shop') + '</b>' +
    '<span class="gm-coins">🪙 ' + monedas() + '</span></div>' +
    '<div class="gm-exp">' + t('game.expcoins').replace('{n}', PUNTOS.semana) + '</div>';
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
  md.querySelector('#gm-sug').onclick = () => {
    if (!sug) { toast(t('game.nohist')); return; }
    g.meta = sug.meta; stampKey('game'); saveDB(); openGame();
  };
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
