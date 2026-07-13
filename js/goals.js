// ===== Goals + Reviews + Year Ritual =====
const GOAL_CATS = ['personal', 'health', 'finance', 'work', 'social'];
const CAT_COLORS = { personal: '#5bc8c0', health: '#f4a98c', finance: '#e08bb8', work: '#f5c85c', social: '#8fd0a8' };

function renderGoals() {
  const y = UI.goalYear;
  let html = '<h1 class="page-title">' + t('goals.title') + '</h1>';
  html += '<div class="wk-nav"><button class="btn secondary small" id="gy-prev">‹</button><b>' + y + '</b>' +
    '<button class="btn secondary small" id="gy-next">›</button></div>';

  // ritual banners
  const startKey = 'start-' + y, endKey = 'end-' + y;
  html += '<div class="ritual-banner" id="ritual-start"><div class="rb-title">🌅 ' + t('goals.ritual.start') + (DB.ritual[startKey] ? ' ✓' : '') + '</div>' +
    (DB.ritual[startKey] && DB.ritual[startKey].word ? '<div class="rb-sub">✨ "' + esc(DB.ritual[startKey].word) + '"</div>' : '') + '</div>';
  html += '<div class="ritual-banner rb-end" id="ritual-end"><div class="rb-title">🌙 ' + t('goals.ritual.end') + (DB.ritual[endKey] ? ' ✓' : '') + '</div></div>';

  // review card
  html += '<div class="card"><div class="section-title"><span class="st-left">🔄 ' + t('goals.review') + '</span></div>' +
    '<div style="display:flex;gap:8px"><button class="btn secondary small" id="rev-month" style="flex:1">📅 ' + t('goals.reviewmonth') + '</button>' +
    '<button class="btn secondary small" id="rev-trim" style="flex:1">📊 ' + t('goals.reviewtrim') + '</button></div>';
  const revKeys = Object.keys(DB.reviews).sort().reverse().slice(0, 6);
  if (revKeys.length) {
    html += '<div class="muted mt8">' + t('review.history') + ':</div>';
    revKeys.forEach(k => {
      html += '<div class="ev-item" data-rev="' + k + '" style="cursor:pointer"><span>' + reviewLabel(k) + '</span><span style="flex:1"></span><span class="muted">›</span></div>';
    });
  }
  html += '</div>';

  // category tabs
  html += '<div class="goal-cat-tabs"><button class="chip' + (UI.goalCat === 'all' ? ' on' : '') + '" data-gcat="all">' + t('goals.all') + '</button>';
  GOAL_CATS.forEach(c => {
    const on = UI.goalCat === c;
    html += '<button class="chip' + (on ? ' on' : '') + '" data-gcat="' + c + '"' +
      (on ? ' style="background:' + CAT_COLORS[c] + '33;border-color:' + CAT_COLORS[c] + '"' : '') + '>' + t('goals.' + c) + '</button>';
  });
  html += '</div>';

  const goals = DB.goals.filter(g => g.year === y && (UI.goalCat === 'all' || g.category === UI.goalCat));
  if (!goals.length) html += '<div class="empty">' + t('goals.none') + '</div>';
  goals.forEach(g => {
    const p = Math.round(goalProgress(g) * 100);
    const auto = g.target ? goalAutoCount(g) : null;
    html += '<div class="goal' + (g.done ? ' done' : '') + '" data-goal="' + g.id + '">' +
      '<div class="g-head"><span class="ev-dot" style="background:' + CAT_COLORS[g.category] + ';width:10px;height:10px;border-radius:50%"></span>' +
      '<span class="g-title">' + esc(g.title) + '</span><b>' + p + '%</b></div>' +
      '<div class="progress"><div class="bar" style="width:' + p + '%;background:' + CAT_COLORS[g.category] + '"></div></div>' +
      '<div class="g-meta"><span>' + t('goals.' + g.category) + '</span>' +
      (g.target ? '<span>' + auto + ' / ' + g.target + (g.tracker === 'gym' ? ' 🏋️' : '') + '</span>' : '') +
      (g.done ? '<span>🎉</span>' : '') + '</div></div>';
  });
  html += '<button class="btn" id="goal-add" style="width:100%;margin-top:10px">+ ' + t('goals.add') + '</button>';
  return html;
}

function reviewLabel(k) {
  const months = t('months');
  if (k.startsWith('M-')) { const [, y, m] = k.split('-'); return '📅 ' + months[Number(m) - 1] + ' ' + y; }
  if (k.startsWith('Q-')) { const [, y, q] = k.split('-'); return '📊 ' + t('goals.trimester') + ' ' + q + ' · ' + y; }
  return k;
}

function bindGoals(root) {
  root.querySelector('#gy-prev').onclick = () => { UI.goalYear--; render(); };
  root.querySelector('#gy-next').onclick = () => { UI.goalYear++; render(); };
  root.querySelectorAll('[data-gcat]').forEach(b => b.onclick = () => { UI.goalCat = b.dataset.gcat; render(); });
  root.querySelectorAll('[data-goal]').forEach(el => el.onclick = () => openGoalDetail(el.dataset.goal));
  root.querySelector('#goal-add').onclick = openGoalForm;
  root.querySelector('#ritual-start').onclick = () => openRitual('start');
  root.querySelector('#ritual-end').onclick = () => openRitual('end');
  root.querySelector('#rev-month').onclick = () => openReview('M');
  root.querySelector('#rev-trim').onclick = () => openReview('Q');
  root.querySelectorAll('[data-rev]').forEach(el => el.onclick = () => openReviewDetail(el.dataset.rev));
}

// ---- new goal ----
function openGoalForm() {
  let html = '<div class="modal-title">🎯 ' + t('goals.add') + '<button class="icon-btn" id="md-x">✕</button></div>' +
    '<label class="fld">' + t('goals.titlefld') + '</label><input type="text" id="gf-title">' +
    '<label class="fld">' + t('goals.category') + '</label><select id="gf-cat">' +
    GOAL_CATS.map(c => '<option value="' + c + '">' + t('goals.' + c) + '</option>').join('') + '</select>' +
    '<label class="fld">' + t('goals.target') + '</label><input type="number" id="gf-target" inputmode="numeric" placeholder="' + t('goals.targethint') + '">' +
    '<label class="fld">' + t('goals.link') + '</label><select id="gf-link">' +
    '<option value="">' + t('goals.link.none') + '</option><option value="gym">' + t('goals.link.gymopt') + '</option></select>' +
    '<div class="modal-actions"><button class="btn secondary" id="md-cancel">' + t('common.cancel') + '</button>' +
    '<button class="btn" id="md-save">' + t('common.save') + '</button></div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = md.querySelector('#md-cancel').onclick = closeModal;
  md.querySelector('#md-save').onclick = () => {
    const title = md.querySelector('#gf-title').value.trim();
    if (!title) return;
    const g = {
      id: uid(), year: UI.goalYear, category: md.querySelector('#gf-cat').value,
      title, done: false, milestones: [], count: 0
    };
    const target = md.querySelector('#gf-target').value;
    if (target) g.target = Number(target);
    const link = md.querySelector('#gf-link').value;
    if (link) g.tracker = link;
    DB.goals.push(g); saveDB(); closeModal(); render(); openGoalDetail(g.id);
  };
}

// ---- goal detail: milestones by trimester + steps ----
function openGoalDetail(goalId) {
  const g = DB.goals.find(x => x.id === goalId);
  if (!g) return;
  const p = Math.round(goalProgress(g) * 100);
  let html = '<div class="modal-title"><span style="' + (g.done ? 'background:var(--hl-done);border-radius:4px;padding:0 4px' : '') + '">' + esc(g.title) + '</span><button class="icon-btn" id="md-x">✕</button></div>' +
    '<div class="progress"><div class="bar" style="width:' + p + '%;background:' + CAT_COLORS[g.category] + '"></div></div>' +
    '<div class="g-meta mt8"><span>' + t('goals.' + g.category) + ' · ' + g.year + '</span><span>' + p + '%</span>' +
    (g.tracker === 'gym' ? '<span>🏋️ ' + t('goals.linked.gym') + ': <b>' + goalAutoCount(g) + (g.target ? ' / ' + g.target : '') + '</b></span>' : '') + '</div>';

  if (g.target && !g.tracker) {
    html += '<label class="fld">' + t('goals.count') + ' (/ ' + g.target + ')</label>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<button class="btn secondary small" id="gd-minus">−</button>' +
      '<b style="font-size:20px">' + (g.count || 0) + '</b>' +
      '<button class="btn small" id="gd-plus">+</button></div>';
  }

  html += '<div class="section-title mt16"><span class="st-left">🪜 ' + t('goals.milestones') + '</span></div>';
  for (let q = 1; q <= 4; q++) {
    const ms = (g.milestones || []).filter(m => m.quarter === q);
    html += '<div class="milestone"><div class="m-head">Q' + q + ' <span class="muted">(' + trimesterMonths(q) + ')</span></div>';
    ms.forEach(m => {
      html += '<div class="step' + (m.done ? ' done' : '') + '"><button class="tk-check' + '" data-ms="' + m.id + '" style="width:20px;height:20px;min-width:20px;border-radius:50%;border:2px solid var(--ink-soft);background:' + (m.done ? 'var(--teal)' : 'none') + ';color:#fff;cursor:pointer">' + (m.done ? '✓' : '') + '</button>' +
        '<span class="s-title editable" data-edit="ms:' + m.id + '" style="flex:1;font-weight:600">' + esc(m.title) + '</span><button class="tk-del" data-msdel="' + m.id + '">✕</button></div>';
      (m.steps || []).forEach(s => {
        html += '<div class="step' + (s.done ? ' done' : '') + '" style="padding-left:34px"><button data-st="' + m.id + ':' + s.id + '" style="width:17px;height:17px;min-width:17px;border-radius:4px;border:1.5px solid var(--ink-soft);background:' + (s.done ? 'var(--green)' : 'none') + ';color:#fff;cursor:pointer;font-size:10px">' + (s.done ? '✓' : '') + '</button>' +
          '<span class="s-title editable" data-edit="st:' + m.id + ':' + s.id + '" style="flex:1">' + esc(s.title) + '</span><button class="tk-del" data-stdel="' + m.id + ':' + s.id + '">✕</button></div>';
      });
      html += '<div class="add-row"><input type="text" class="ms-step-new" data-ms="' + m.id + '" placeholder="' + t('goals.addstep') + '"><button class="btn small ms-step-add" data-ms="' + m.id + '">+</button></div>';
    });
    html += '<div class="add-row"><input type="text" class="ms-new" data-q="' + q + '" placeholder="' + t('goals.addmilestone') + '"><button class="btn small secondary ms-add" data-q="' + q + '">+</button></div></div>';
  }

  html += '<div class="modal-actions">' +
    '<button class="btn danger" id="gd-del">🗑</button>' +
    '<button class="btn ' + (g.done ? 'secondary' : '') + '" id="gd-done" style="flex:3">' + (g.done ? t('goals.markundone') : t('goals.markdone')) + '</button></div>';

  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = () => { closeModal(); render(); };
  md.querySelector('#gd-done').onclick = () => {
    g.done = !g.done; saveDB(); closeModal(); render();
    if (g.done) { toast('🎉✨'); celebrate('goal', g.id, g.title); }
  };
  md.querySelector('#gd-del').onclick = () => {
    if (!confirm(t('goals.deleteconfirm'))) return;
    tomb('goal:' + g.title.trim().toLowerCase());
    DB.goals = DB.goals.filter(x => x.id !== g.id);
    saveDB(); closeModal(); render();
  };
  const plus = md.querySelector('#gd-plus'), minus = md.querySelector('#gd-minus');
  if (plus) plus.onclick = () => { g.count = (g.count || 0) + 1; saveDB(); openGoalDetail(g.id); };
  if (minus) minus.onclick = () => { g.count = Math.max(0, (g.count || 0) - 1); saveDB(); openGoalDetail(g.id); };

  md.querySelectorAll('.ms-add').forEach(b => b.onclick = () => {
    const inp = md.querySelector('.ms-new[data-q="' + b.dataset.q + '"]');
    if (!inp.value.trim()) return;
    g.milestones.push({ id: uid(), quarter: Number(b.dataset.q), title: inp.value.trim(), done: false, steps: [] });
    saveDB(); openGoalDetail(g.id);
  });
  md.querySelectorAll('.ms-step-add').forEach(b => b.onclick = () => {
    const inp = md.querySelector('.ms-step-new[data-ms="' + b.dataset.ms + '"]');
    if (!inp.value.trim()) return;
    const m = g.milestones.find(x => x.id === b.dataset.ms);
    (m.steps || (m.steps = [])).push({ id: uid(), title: inp.value.trim(), done: false });
    saveDB(); openGoalDetail(g.id);
  });
  md.querySelectorAll('[data-ms]').forEach(b => {
    if (b.tagName !== 'BUTTON' || !b.classList.contains('tk-check')) return;
    b.onclick = () => {
      const m = g.milestones.find(x => x.id === b.dataset.ms);
      m.done = !m.done; saveDB(); openGoalDetail(g.id);
    };
  });
  md.querySelectorAll('[data-msdel]').forEach(b => b.onclick = () => {
    const dm = g.milestones.find(x => x.id === b.dataset.msdel);
    if (dm) tomb('ms:' + g.title.trim().toLowerCase() + ':' + dm.title.trim().toLowerCase());
    g.milestones = g.milestones.filter(x => x.id !== b.dataset.msdel);
    saveDB(); openGoalDetail(g.id);
  });
  md.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    const [mid, sid] = b.dataset.st.split(':');
    const s = g.milestones.find(x => x.id === mid).steps.find(x => x.id === sid);
    s.done = !s.done; saveDB(); openGoalDetail(g.id);
  });
  md.querySelectorAll('[data-stdel]').forEach(b => b.onclick = () => {
    const [mid, sid] = b.dataset.stdel.split(':');
    const m = g.milestones.find(x => x.id === mid);
    const ds = m.steps.find(x => x.id === sid);
    if (ds) tomb('st:' + g.title.trim().toLowerCase() + ':' + ds.title.trim().toLowerCase());
    m.steps = m.steps.filter(x => x.id !== sid);
    saveDB(); openGoalDetail(g.id);
  });
  // tap a milestone/step title to edit it in place
  md.querySelectorAll('.editable[data-edit]').forEach(span => span.onclick = () => {
    const parts = span.dataset.edit.split(':');
    let target;
    if (parts[0] === 'ms') target = g.milestones.find(x => x.id === parts[1]);
    else { const m = g.milestones.find(x => x.id === parts[1]); target = m && (m.steps || []).find(x => x.id === parts[2]); }
    if (!target) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = target.title;
    inp.style.cssText = 'flex:1;padding:6px 8px;font-size:14px';
    span.replaceWith(inp); inp.focus();
    let saved = false;
    const commit = () => {
      if (saved) return; saved = true;
      const v = inp.value.trim();
      if (v) { target.title = v; saveDB(); }
      openGoalDetail(g.id);
    };
    inp.onblur = commit;
    inp.onkeydown = e => { if (e.key === 'Enter') commit(); };
  });
}

function trimesterMonths(q) {
  const months = t('months');
  return months[(q - 1) * 3].slice(0, 3) + '–' + months[q * 3 - 1].slice(0, 3);
}

// ---- reviews ----
function openReview(kind) { // 'M' or 'Q'
  const now = new Date();
  let key, label;
  if (kind === 'M') {
    // review the month that just ended if we're in the first days, else current month
    const d = now.getDate() <= 7 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now;
    key = 'M-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    label = t('goals.reviewmonth') + ' · ' + t('months')[d.getMonth()];
  } else {
    const q = curQuarter(now);
    key = 'Q-' + now.getFullYear() + '-' + q;
    label = t('goals.reviewtrim') + ' Q' + q;
  }
  const prev = DB.reviews[key] || {};
  const activeGoals = DB.goals.filter(g => g.year === UI.goalYear && !g.done);

  let html = '<div class="modal-title">' + label + '<button class="icon-btn" id="md-x">✕</button></div>';
  html += '<div class="review-q"><label class="fld">' + t('review.q.feel') + '</label><textarea id="rv-feel">' + esc(prev.feel || '') + '</textarea></div>';
  html += '<div class="review-q"><label class="fld">' + t('review.q.win') + '</label><textarea id="rv-win">' + esc(prev.win || '') + '</textarea></div>';
  if (activeGoals.length) {
    html += '<label class="fld">' + t('review.goalstatus') + '</label>';
    activeGoals.forEach(g => {
      const st = (prev.goals || {})[g.id] || '';
      html += '<div class="review-goal"><div style="font-weight:600;font-size:14px">' + esc(g.title) + '</div><div class="rg-opts">' +
        ['ontrack', 'behind', 'done'].map(s =>
          '<button class="qt-opt' + (st === s ? ' on' : '') + '" data-rvg="' + g.id + ':' + s + '">' + t('review.' + s) + '</button>').join('') +
        '</div></div>';
    });
  }
  html += '<div class="review-q"><label class="fld">' + t('review.q.improve') + '</label><textarea id="rv-improve">' + esc(prev.improve || '') + '</textarea></div>';
  html += '<div class="review-q"><label class="fld">' + t('review.q.next') + '</label><textarea id="rv-next">' + esc(prev.next || '') + '</textarea></div>';
  html += '<div class="modal-actions"><button class="btn" id="md-save">' + t('review.save') + '</button></div>';

  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = closeModal;
  const goalStatus = Object.assign({}, prev.goals || {});
  md.querySelectorAll('[data-rvg]').forEach(b => b.onclick = () => {
    const [gid, st] = b.dataset.rvg.split(':');
    goalStatus[gid] = st;
    md.querySelectorAll('[data-rvg^="' + gid + ':"]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (st === 'done') {
      const g = DB.goals.find(x => x.id === gid);
      if (g && !g.done) { g.done = true; saveDB(); celebrate('goal', g.id, g.title); }
    }
  });
  md.querySelector('#md-save').onclick = () => {
    DB.reviews[key] = {
      feel: md.querySelector('#rv-feel').value,
      win: md.querySelector('#rv-win').value,
      improve: md.querySelector('#rv-improve').value,
      next: md.querySelector('#rv-next').value,
      goals: goalStatus,
      savedAt: todayISO()
    };
    saveDB(); closeModal(); render(); toast('✓ ' + t('goals.reviewdone'));
  };
}

function openReviewDetail(key) {
  const r = DB.reviews[key];
  if (!r) return;
  const rows = [['review.q.feel', r.feel], ['review.q.win', r.win], ['review.q.improve', r.improve], ['review.q.next', r.next]];
  let html = '<div class="modal-title">' + reviewLabel(key) + '<button class="icon-btn" id="md-x">✕</button></div>';
  rows.forEach(([k, v]) => { if (v) html += '<label class="fld">' + t(k) + '</label><div style="white-space:pre-wrap">' + esc(v) + '</div>'; });
  const gs = r.goals || {};
  const named = Object.keys(gs).map(gid => {
    const g = DB.goals.find(x => x.id === gid);
    return g ? '<div class="ev-item"><span style="flex:1">' + esc(g.title) + '</span><b>' + t('review.' + gs[gid]) + '</b></div>' : '';
  }).join('');
  if (named) html += '<label class="fld">' + t('review.goalstatus') + '</label>' + named;
  openModal(html);
  document.getElementById('md-x').onclick = closeModal;
}

// ---- year ritual ----
function openRitual(kind) {
  const y = UI.goalYear;
  const key = kind + '-' + y;
  const r = DB.ritual[key] || {};
  let html;
  if (kind === 'start') {
    html = '<div class="modal-title">🌅 ' + t('goals.ritual.start') + ' ' + y + '<button class="icon-btn" id="md-x">✕</button></div>' +
      '<label class="fld">✨ ' + t('ritual.word') + '</label><input type="text" id="rt-word" value="' + esc(r.word || '') + '">' +
      '<label class="fld">💭 ' + t('ritual.vision') + '</label><textarea id="rt-vision" style="min-height:110px">' + esc(r.vision || '') + '</textarea>' +
      '<label class="fld">💌 ' + t('ritual.letter') + '</label><textarea id="rt-letter" style="min-height:110px">' + esc(r.letter || '') + '</textarea>';
  } else {
    const yhl = DB.events.filter(e => e.type === 'highlight' && e.date.startsWith(String(y)));
    html = '<div class="modal-title">🌙 ' + t('goals.ritual.end') + ' ' + y + '<button class="icon-btn" id="md-x">✕</button></div>';
    if (yhl.length) {
      html += '<label class="fld">💖 ' + t('ev.highlight') + 's:</label>' +
        yhl.map(e => '<div class="hl-item"><span class="hl-mark">✦</span>' + fmtDate(e.date) + ' — ' + esc(e.title) + '</div>').join('');
    }
    html += '<label class="fld">⭐ ' + t('ritual.end.rating') + '</label><input type="number" min="1" max="10" id="rt-rating" value="' + (r.rating || '') + '">' +
      '<label class="fld">🏆 ' + t('ritual.end.best') + '</label><textarea id="rt-best">' + esc(r.best || '') + '</textarea>' +
      '<label class="fld">📖 ' + t('ritual.end.learned') + '</label><textarea id="rt-learned">' + esc(r.learned || '') + '</textarea>' +
      '<label class="fld">🍂 ' + t('ritual.end.release') + '</label><textarea id="rt-release">' + esc(r.release || '') + '</textarea>' +
      '<label class="fld">💜 ' + t('ritual.end.thanks') + '</label><textarea id="rt-thanks">' + esc(r.thanks || '') + '</textarea>';
  }
  html += '<div class="modal-actions"><button class="btn" id="md-save">' + t('common.save') + '</button></div>';
  openModal(html);
  const md = document.getElementById('modal-card');
  md.querySelector('#md-x').onclick = closeModal;
  md.querySelector('#md-save').onclick = () => {
    if (kind === 'start') {
      DB.ritual[key] = { word: md.querySelector('#rt-word').value, vision: md.querySelector('#rt-vision').value, letter: md.querySelector('#rt-letter').value };
    } else {
      DB.ritual[key] = {
        rating: md.querySelector('#rt-rating').value, best: md.querySelector('#rt-best').value,
        learned: md.querySelector('#rt-learned').value, release: md.querySelector('#rt-release').value,
        thanks: md.querySelector('#rt-thanks').value
      };
    }
    saveDB(); closeModal(); render(); toast(t('ritual.saved'));
  };
}
