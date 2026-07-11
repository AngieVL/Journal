// ===== Year-in-pixels trackers (colors match her physical journal) =====
const TRACKER_DEFS = {
  mood: {
    multi: false,
    options: [
      { id: 'fantastic', color: '#5bc8c0' },
      { id: 'great', color: '#f4a98c' },
      { id: 'okay', color: '#a99bc6' },
      { id: 'down', color: '#8fd0a8' },
      { id: 'sad', color: '#f0b429' }
    ],
    key: 'mood.'
  },
  productivity: {
    multi: false,
    options: [
      { id: 'high', color: '#5bc8c0' },
      { id: 'mid', color: '#e08bb8' },
      { id: 'low', color: '#f4a98c' },
      { id: 'rest', color: '#f5c85c' }
    ],
    key: 'prod.'
  },
  sleep: {
    multi: false,
    options: [
      { id: 's9', color: '#e08bb8' },
      { id: 's78', color: '#5bc8c0' },
      { id: 's65', color: '#f4a98c' },
      { id: 's43', color: '#f5c85c' },
      { id: 's3', color: '#8fd0a8' },
      { id: 's0', color: '#a9714b' }
    ],
    key: 'sleep.'
  },
  health: {
    multi: true,
    options: [
      { id: 'headache', color: '#f5a623' },
      { id: 'flu', color: '#9fe3c9' },
      { id: 'nausea', color: '#a9714b' },
      { id: 'fainting', color: '#f0d43a' },
      { id: 'backache', color: '#4e9a6c' }
    ],
    key: 'health.'
  },
  period: {
    multi: true,
    options: [
      { id: 'flow', color: '#f28b82' },
      { id: 'cramps', color: '#5bc8c0' },
      { id: 'symptoms', color: '#f5c85c' },
      { id: 'love', color: '#b7a8d4' },
      { id: 'acne', color: '#8fd0a8' }
    ],
    key: 'period.'
  },
  gym: {
    multi: false,
    options: [
      { id: 'full', color: '#b7a8d4' },
      { id: 'upper', color: '#f4a98c' },
      { id: 'lower', color: '#5bc8c0' },
      { id: 'rest', color: '#f5c85c' },
      { id: 'cardio', color: '#8fd0a8' }
    ],
    key: 'gym.'
  }
};

function trkColor(trk, optId) {
  const o = TRACKER_DEFS[trk].options.find(o => o.id === optId);
  return o ? o.color : 'transparent';
}
function trkLabel(trk, optId) { return t(TRACKER_DEFS[trk].key + optId); }

function setTrackerValue(trk, dateIso, optId) {
  const def = TRACKER_DEFS[trk];
  const store = DB.trackers[trk];
  if (def.multi) {
    const cur = store[dateIso] || [];
    if (cur.includes(optId)) {
      const next = cur.filter(x => x !== optId);
      if (next.length) store[dateIso] = next; else delete store[dateIso];
    } else {
      store[dateIso] = cur.concat(optId);
    }
  } else {
    if (store[dateIso] === optId) delete store[dateIso];
    else store[dateIso] = optId;
  }
  saveDB();
}

function clearTrackerDay(trk, dateIso) { delete DB.trackers[trk][dateIso]; saveDB(); }

// year pixel grid: rows 1-31, cols J..D
function renderPixelGrid(trk, year, onCellTap) {
  const def = TRACKER_DEFS[trk];
  const store = DB.trackers[trk];
  const mshort = t('months.short');
  const today = todayISO();
  let html = '<div class="pixel-wrap"><table class="pixel"><tr><th></th>';
  for (let m = 0; m < 12; m++) html += '<th>' + mshort[m] + '</th>';
  html += '</tr>';
  for (let day = 1; day <= 31; day++) {
    html += '<tr><td class="rowlbl">' + day + '</td>';
    for (let m = 0; m < 12; m++) {
      const dim = daysInMonth(year, m);
      if (day > dim) { html += '<td class="cell off"></td>'; continue; }
      const iso = year + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const v = store[iso];
      let style = '', inner = '';
      if (v) {
        if (def.multi) {
          const colors = v.map(x => trkColor(trk, x));
          inner = '<div class="multi-halves">' + colors.map(c => '<span style="background:' + c + '"></span>').join('') + '</div>';
        } else {
          style = 'background:' + trkColor(trk, v);
        }
      }
      const cls = 'cell' + (iso === today ? ' today' : '');
      html += '<td class="' + cls + '" data-date="' + iso + '" style="' + style + '">' + inner + '</td>';
    }
    html += '</tr>';
  }
  html += '</table></div>';
  return html;
}

function renderLegend(trk) {
  const def = TRACKER_DEFS[trk];
  return '<div class="legend">' + def.options.map(o =>
    '<div class="lg"><span class="dot" style="background:' + o.color + '"></span>' + trkLabel(trk, o.id) + '</div>'
  ).join('') + '</div>';
}

// stats: counts per option for a month or whole year
function trackerStats(trk, year, month) { // month 0-11 or null = year
  const def = TRACKER_DEFS[trk];
  const store = DB.trackers[trk];
  const prefix = month === null ? String(year) : year + '-' + String(month + 1).padStart(2, '0');
  const counts = {};
  def.options.forEach(o => counts[o.id] = 0);
  for (const d in store) {
    if (!d.startsWith(prefix)) continue;
    const v = store[d];
    if (def.multi) v.forEach(x => { if (counts[x] !== undefined) counts[x]++; });
    else if (counts[v] !== undefined) counts[v]++;
  }
  return counts;
}

function renderStats(trk, year) {
  const m = new Date().getMonth();
  const isCurYear = year === curYear();
  const monthCounts = trackerStats(trk, year, isCurYear ? m : 11);
  const yearCounts = trackerStats(trk, year, null);
  const def = TRACKER_DEFS[trk];
  let html = '<div class="muted mt8">' + t('trk.thismonth') + '</div><div class="stat-row">';
  def.options.forEach(o => {
    html += '<div class="stat"><div class="num" style="color:' + darker(o.color) + '">' + monthCounts[o.id] + '</div><div class="lbl">' + trkLabel(trk, o.id) + '</div></div>';
  });
  html += '</div><div class="muted mt8">' + t('trk.thisyear') + '</div><div class="stat-row">';
  def.options.forEach(o => {
    html += '<div class="stat"><div class="num" style="color:' + darker(o.color) + '">' + yearCounts[o.id] + '</div><div class="lbl">' + trkLabel(trk, o.id) + '</div></div>';
  });
  html += '</div>';
  return html;
}

function darker(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * 0.72), g = Math.floor(((n >> 8) & 255) * 0.72), b = Math.floor((n & 255) * 0.72);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
